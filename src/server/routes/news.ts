import { Hono } from 'hono';
import { db } from '../db/index.js';
import { news, channels } from '../db/schema.js';
import { eq, and, asc, max, sql, type SQL } from 'drizzle-orm';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { NewsItem } from '../../shared/types.js';
import { readChannelHistory } from '../services/telegram.js';
import { logger } from '../logger.js';
import { toNewsItem } from '../db/mappers.js';

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
function deleteAllMediaFiles(localMediaPath: string | null, localMediaPaths: string[] | null) {
  if (localMediaPaths) {
    localMediaPaths.forEach(deleteMediaFile);
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
          .select({ maxMsgId: max(news.telegramMsgId), maxPostedAt: max(news.postedAt) })
          .from(news)
          .where(eq(news.channelId, body.channelId));

        if (result?.maxMsgId) {
          await readChannelHistory(channel.telegramId, result.maxMsgId);
        }

        // Update lastReadAt so the next fetch won't re-fetch already-read messages.
        // Without this, the fetch route deletes all isRead=1 news and then re-inserts
        // them from Telegram (starting from the old lastReadAt) with isRead=0.
        if (result?.maxPostedAt) {
          await db.update(channels).set({ lastReadAt: result.maxPostedAt }).where(eq(channels.id, body.channelId));
        }
      }
    } catch (err) {
      // Non-critical: local state already updated, Telegram sync failed
      logger.warn({ module: 'news', channelId: body.channelId, err }, 'failed to sync read state to Telegram');
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
  deleted.forEach((r) => deleteAllMediaFiles(r.localMediaPath, r.localMediaPaths));
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

  // Server-side filter application: use pre-computed is_filtered flag
  if (applyServerFilters && channelId !== undefined) {
    conditions.push(eq(news.isFiltered, 0));
    filtersApplied = true;

    // For media_content channels: auto-filter posts without real media attachment
    const [channelRow] = await db
      .select({ channelType: channels.channelType })
      .from(channels)
      .where(eq(channels.id, channelId));
    if (channelRow?.channelType === 'media') {
      conditions.push(sql`${news.mediaType} IN ('photo', 'document', 'audio')`);
    }
  }

  const rows = await db
    .select()
    .from(news)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(news.postedAt));

  // Count how many rows were excluded by user-defined filters (is_filtered=1)
  let filteredOut = 0;
  if (filtersApplied && channelId !== undefined) {
    const filteredConditions = [...baseConditions, eq(news.isFiltered, 1)];
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(news)
      .where(and(...filteredConditions));
    filteredOut = result?.count ?? 0;
  }

  const items: NewsItem[] = rows.map(toNewsItem);

  return c.json({ items, filteredOut });
});

// GET /api/news/:id
router.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const [row] = await db.select().from(news).where(eq(news.id, id));
  if (!row) return c.json({ error: 'News not found' }, 404);
  return c.json(toNewsItem(row));
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

  return c.json(toNewsItem(updated));
});

export default router;
