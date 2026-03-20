import { Hono } from 'hono';
import { db } from '../db/index.js';
import { news, channels, filters as filtersTable } from '../db/schema.js';
import { eq, and, asc, max, sql, type SQL } from 'drizzle-orm';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { NewsItem } from '../../shared/types.js';
import { readChannelHistory, fetchMessageById, downloadMessageMedia } from '../services/telegram.js';
import { logger } from '../logger.js';

const router = new Hono();

function deleteMediaFile(localMediaPath: string | null) {
  if (!localMediaPath) return;
  const filepath = join(process.cwd(), 'data', localMediaPath);
  if (existsSync(filepath)) {
    try {
      unlinkSync(filepath);
    } catch {
      /* ignore */
    }
  }
}

/** Delete all media files for a news row (handles both single and album). */
function deleteAllMediaFiles(localMediaPath: string | null, localMediaPaths: string | null) {
  if (localMediaPaths) {
    (JSON.parse(localMediaPaths) as string[]).forEach(deleteMediaFile);
  } else if (localMediaPath) {
    deleteMediaFile(localMediaPath);
  }
}

// POST /api/news/read-all
router.post('/read-all', async (c) => {
  const body = await c.req.json<{ channelId?: number }>().catch((): { channelId?: number } => ({}));
  const conditions = [eq(news.isRead, 0)];
  if (body.channelId) conditions.push(eq(news.channelId, body.channelId));

  await db
    .update(news)
    .set({ isRead: 1 })
    .where(and(...conditions));

  // Sync read state to Telegram if channelId provided
  if (body.channelId) {
    try {
      const [channel] = await db.select().from(channels).where(eq(channels.id, body.channelId));
      if (channel) {
        const [result] = await db
          .select({ maxMsgId: max(news.telegramMsgId) })
          .from(news)
          .where(eq(news.channelId, body.channelId));

        if (result?.maxMsgId) {
          await readChannelHistory(channel.telegramId, result.maxMsgId);
        }
      }
    } catch (err) {
      // Non-critical: local state already updated, Telegram sync failed
      console.warn('Failed to sync read state to Telegram:', err);
    }
  }

  return c.json({ success: true });
});

// DELETE /api/news/read - delete all read news
router.delete('/read', async (c) => {
  const body = await c.req.json<{ channelId?: number }>().catch((): { channelId?: number } => ({}));
  const conditions = [eq(news.isRead, 1)];
  if (body.channelId) conditions.push(eq(news.channelId, body.channelId));
  const deleted = await db
    .delete(news)
    .where(and(...conditions))
    .returning({ localMediaPath: news.localMediaPath, localMediaPaths: news.localMediaPaths });
  deleted.forEach((r: { localMediaPath: string | null; localMediaPaths: string | null }) =>
    deleteAllMediaFiles(r.localMediaPath, r.localMediaPaths),
  );
  return c.json({ deleted: deleted.length });
});

// GET /api/news?channelId=&isRead=&filtered=1
// Response: { items: NewsItem[], filteredOut: number }
router.get('/', async (c) => {
  const channelId = c.req.query('channelId') ? parseInt(c.req.query('channelId')!, 10) : undefined;
  const isReadParam = c.req.query('isRead');
  const applyServerFilters = c.req.query('filtered') === '1';

  // Base conditions (channelId + isRead) — used for total-count query
  const baseConditions: SQL[] = [];
  if (channelId !== undefined) baseConditions.push(eq(news.channelId, channelId));
  if (isReadParam !== undefined) baseConditions.push(eq(news.isRead, parseInt(isReadParam, 10)));

  // Full conditions = base + filter exclusions
  const conditions: SQL[] = [...baseConditions];
  let filtersApplied = false;

  // Server-side filter application via SQLite json_each()
  if (applyServerFilters && channelId !== undefined) {
    const activeFilters = await db
      .select()
      .from(filtersTable)
      .where(and(eq(filtersTable.channelId, channelId), eq(filtersTable.isActive, 1)));

    const tagValues = activeFilters
      .filter((f: (typeof activeFilters)[number]) => f.type === 'tag')
      .map((f: (typeof activeFilters)[number]) => f.value.replace(/^#/, '').toLowerCase());

    const keywordValues = activeFilters
      .filter((f: (typeof activeFilters)[number]) => f.type === 'keyword')
      .map((f: (typeof activeFilters)[number]) => f.value.toLowerCase());

    if (tagValues.length > 0) {
      const orClauses = tagValues.flatMap((tag: string) => [
        sql`lower(value) = ${tag}`,
        sql`lower(value) = ${'#' + tag}`,
      ]);
      const combined = orClauses.reduce((acc: SQL<unknown>, clause: SQL<unknown>) => sql`${acc} OR ${clause}`);
      conditions.push(sql`NOT EXISTS (SELECT 1 FROM json_each(hashtags) WHERE ${combined})`);
      filtersApplied = true;
    }

    for (const kw of keywordValues) {
      conditions.push(sql`lower(${news.text}) NOT LIKE ${'%' + kw + '%'}`);
      filtersApplied = true;
    }
  }

  const rows = await db
    .select()
    .from(news)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(news.postedAt));

  // Count how many rows were excluded by filters
  let filteredOut = 0;
  if (filtersApplied) {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(news)
      .where(baseConditions.length > 0 ? and(...baseConditions) : undefined);
    filteredOut = (countResult?.count ?? 0) - rows.length;
  }

  const items: NewsItem[] = rows.map((r: (typeof rows)[number]) => ({
    ...r,
    links: JSON.parse(r.links) as string[],
    hashtags: JSON.parse(r.hashtags) as string[],
    mediaType: r.mediaType || undefined,
    fullContent: r.fullContent || undefined,
    localMediaPath: r.localMediaPath || undefined,
    localMediaPaths: r.localMediaPaths ? (JSON.parse(r.localMediaPaths) as string[]) : undefined,
    mediaSize: r.mediaSize || undefined,
  }));

  return c.json({ items, filteredOut });
});

// GET /api/news/:id
router.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const [row] = await db.select().from(news).where(eq(news.id, id));
  if (!row) return c.json({ error: 'News not found' }, 404);
  return c.json({
    ...row,
    links: JSON.parse(row.links) as string[],
    hashtags: JSON.parse(row.hashtags) as string[],
    mediaType: row.mediaType || undefined,
    fullContent: row.fullContent || undefined,
  });
});

// PATCH /api/news/:id/read
router.patch('/:id/read', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json<{ isRead?: number }>().catch(() => ({ isRead: 1 }));
  const isRead = body.isRead ?? 1;

  const [updated] = await db.update(news).set({ isRead }).where(eq(news.id, id)).returning();
  if (!updated) return c.json({ error: 'News not found' }, 404);

  // When marking as read — sync to Telegram and update lastReadAt in DB
  if (isRead === 1) {
    const [channel] = await db.select().from(channels).where(eq(channels.id, updated.channelId));
    if (channel) {
      // Fire and forget — don't block the response
      void (async () => {
        try {
          await readChannelHistory(channel.telegramId, updated.telegramMsgId);
        } catch (err) {
          logger.warn({ module: 'news', newsId: updated.id, err }, 'failed to sync read state to Telegram');
        }
        // Update lastReadAt only if this message is newer than what we have
        if (!channel.lastReadAt || updated.postedAt > channel.lastReadAt) {
          await db.update(channels).set({ lastReadAt: updated.postedAt }).where(eq(channels.id, updated.channelId));
        }
      })();
    }
  }

  return c.json({
    ...updated,
    links: JSON.parse(updated.links) as string[],
    hashtags: JSON.parse(updated.hashtags) as string[],
    mediaType: updated.mediaType || undefined,
    fullContent: updated.fullContent || undefined,
  });
});

// POST /api/news/:id/download-media — on-demand download (no size limit)
router.post('/:id/download-media', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const [row] = await db.select().from(news).where(eq(news.id, id));
  if (!row) return c.json({ error: 'News not found' }, 404);
  if (row.localMediaPath) return c.json({ localMediaPath: row.localMediaPath }); // already downloaded

  const [channel] = await db.select().from(channels).where(eq(channels.id, row.channelId));
  if (!channel) return c.json({ error: 'Channel not found' }, 404);

  if (row.albumMsgIds) {
    // Album: download all member messages
    const albumIds = JSON.parse(row.albumMsgIds) as number[];
    const paths: string[] = [];
    for (const msgId of albumIds) {
      const msg = await fetchMessageById(channel.telegramId, msgId);
      if (!msg?.rawMedia) continue;
      const localPath = await downloadMessageMedia(msg, channel.telegramId, { ignoreLimit: true });
      if (localPath) paths.push(localPath);
    }
    if (paths.length === 0) return c.json({ error: 'Failed to download album media' }, 500);

    const [updated] = await db
      .update(news)
      .set({ localMediaPath: paths[0], localMediaPaths: JSON.stringify(paths) })
      .where(eq(news.id, id))
      .returning();

    return c.json({
      ...updated,
      links: JSON.parse(updated.links) as string[],
      hashtags: JSON.parse(updated.hashtags) as string[],
      mediaType: updated.mediaType || undefined,
      fullContent: updated.fullContent || undefined,
      localMediaPath: updated.localMediaPath || undefined,
      localMediaPaths: updated.localMediaPaths ? (JSON.parse(updated.localMediaPaths) as string[]) : undefined,
      mediaSize: updated.mediaSize || undefined,
    } satisfies NewsItem);
  }

  const msg = await fetchMessageById(channel.telegramId, row.telegramMsgId);
  if (!msg) return c.json({ error: 'Message not found in Telegram' }, 404);

  const localPath = await downloadMessageMedia(msg, channel.telegramId, { ignoreLimit: true });
  if (!localPath) return c.json({ error: 'Failed to download media' }, 500);

  const [updated] = await db.update(news).set({ localMediaPath: localPath }).where(eq(news.id, id)).returning();

  return c.json({
    ...updated,
    links: JSON.parse(updated.links) as string[],
    hashtags: JSON.parse(updated.hashtags) as string[],
    mediaType: updated.mediaType || undefined,
    fullContent: updated.fullContent || undefined,
    localMediaPath: updated.localMediaPath || undefined,
    localMediaPaths: updated.localMediaPaths ? (JSON.parse(updated.localMediaPaths) as string[]) : undefined,
    mediaSize: updated.mediaSize || undefined,
  } satisfies NewsItem);
});

export default router;
