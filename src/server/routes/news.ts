import { Hono } from 'hono';
import { db } from '../db/index.js';
import { news, channels, downloads } from '../db/schema.js';
import { eq, and, asc, max, sql, gt, notInArray, type SQL } from 'drizzle-orm';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { NewsItem } from '../../shared/types.js';
import { readChannelHistory } from '../services/telegram.js';
import { logger } from '../logger.js';
import { toNewsItem } from '../db/mappers.js';
import { readAllNewsSchema, markReadSchema, parseOptionalBody } from './schemas.js';

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
  const body = await parseOptionalBody(c, readAllNewsSchema, {});
  const conditions = [eq(news.isRead, 0)];
  if (body.channelId) conditions.push(eq(news.channelId, body.channelId));

  await db
    .update(news)
    .set({ isRead: 1 })
    .where(and(...conditions));

  // Update denormalized unread_count
  if (body.channelId) {
    await db.update(channels).set({ unreadCount: 0 }).where(eq(channels.id, body.channelId));
  } else {
    await db.update(channels).set({ unreadCount: 0 });
  }

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

        // Update lastReadAt so the next fetch uses this as the boundary
        // for incremental fetching (avoids re-fetching already-read messages).
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

// DELETE /api/news/read - delete all read news (excluding items with active downloads)
router.delete('/read', async (c) => {
  const body = await parseOptionalBody(c, readAllNewsSchema, {});

  // Find news IDs with active (pending/processing) download tasks — protect them from deletion
  const activeDownloadNewsIds = await db
    .select({ newsId: downloads.newsId })
    .from(downloads)
    .where(sql`${downloads.status} IN ('pending', 'processing')`);
  const protectedIds = activeDownloadNewsIds.map((r) => r.newsId);

  const conditions = [eq(news.isRead, 1)];
  if (body.channelId) conditions.push(eq(news.channelId, body.channelId));
  if (protectedIds.length > 0) conditions.push(notInArray(news.id, protectedIds));
  const deleted = await db
    .delete(news)
    .where(and(...conditions))
    .returning({
      channelId: news.channelId,
      localMediaPath: news.localMediaPath,
      localMediaPaths: news.localMediaPaths,
    });
  deleted.forEach((r) => deleteAllMediaFiles(r.localMediaPath, r.localMediaPaths));

  // Decrement totalNewsCount per channel
  const countsByChannel = new Map<number, number>();
  for (const r of deleted) {
    countsByChannel.set(r.channelId, (countsByChannel.get(r.channelId) ?? 0) + 1);
  }
  for (const [chId, count] of countsByChannel) {
    await db
      .update(channels)
      .set({ totalNewsCount: sql`max(0, ${channels.totalNewsCount} - ${count})` })
      .where(eq(channels.id, chId));
  }

  return c.json({ deleted: deleted.length });
});

// GET /api/news?channelId=&isRead=&filtered=1&limit=&cursor=
// Response: { items: NewsItem[], filteredOut: number, nextCursor: number | null, hasMore: boolean }
router.get('/', async (c) => {
  const channelId = c.req.query('channelId') ? parseInt(c.req.query('channelId')!, 10) : undefined;
  const isReadParam = c.req.query('isRead');
  const applyServerFilters = c.req.query('filtered') === '1';
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
  const cursor = c.req.query('cursor') ? parseInt(c.req.query('cursor')!, 10) : undefined;

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

  // Cursor condition: fetch items after the cursor (posted_at > cursor)
  if (cursor !== undefined) {
    conditions.push(gt(news.postedAt, cursor));
  }

  // Fetch limit+1 to detect if there are more items
  const rows = await db
    .select()
    .from(news)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(news.postedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  // Count queries only on the first page (no cursor) — subsequent pages reuse page[0] values on the client
  let filteredOut = 0;
  if (!cursor && filtersApplied && channelId !== undefined) {
    const filteredConditions = [...baseConditions, eq(news.isFiltered, 1)];
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(news)
      .where(and(...filteredConditions));
    filteredOut = result?.count ?? 0;
  }

  const items: NewsItem[] = pageRows.map(toNewsItem);
  const nextCursor = hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1].postedAt : null;

  // ETag: based on item count + max postedAt for cache validation
  const maxPostedAt = pageRows.length > 0 ? pageRows[pageRows.length - 1].postedAt : 0;
  const etag = `"${items.length}-${maxPostedAt}-${filteredOut}"`;

  const ifNoneMatch = c.req.header('If-None-Match');
  if (ifNoneMatch === etag) {
    c.header('Cache-Control', 'no-cache, must-revalidate, private');
    c.header('ETag', etag);
    return c.body(null, 304);
  }

  // Cache-Control lets the browser store the response in its HTTP cache but
  // forces revalidation (If-None-Match) on every request. must-revalidate
  // explicitly permits caching responses to requests with Authorization header.
  // The browser handles ETag/304 transparently — JS fetch() sees a normal 200.
  c.header('Cache-Control', 'no-cache, must-revalidate, private');
  c.header('ETag', etag);
  return c.json({ items, filteredOut, nextCursor, hasMore });
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
  const body = await parseOptionalBody(c, markReadSchema, { isRead: 1 });
  const isRead = body.isRead ?? 1;

  const [updated] = await db.update(news).set({ isRead }).where(eq(news.id, id)).returning();
  if (!updated) return c.json({ error: 'News not found' }, 404);

  // Update denormalized unread_count: +1 if marking unread, -1 if marking read
  const delta = isRead === 1 ? -1 : 1;
  await db
    .update(channels)
    .set({ unreadCount: sql`max(0, ${channels.unreadCount} + ${delta})` })
    .where(eq(channels.id, updated.channelId));

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
