import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { db } from '../db/index.js';
import { channels, news } from '../db/schema.js';
import { eq, and, count } from 'drizzle-orm';
import { rmSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { fetchChannelMessages, fetchMessageById, getReadInboxMaxId, getChannelInfo } from '../services/telegram.js';
import { mediaProgressEmitter, type MediaProgressEvent } from '../services/mediaProgress.js';
import { getChannelStrategy, type PostProcessArgs } from '../services/channelStrategies.js';
import { NEWS_DEFAULT_FETCH_DAYS, NEWS_FETCH_LIMIT } from '../config.js';
import type { ChannelType } from '../../shared/types.js';

const router = new Hono();

// GET /api/channels/lookup?username=durov  — fetch channel title+description from Telegram
router.get('/lookup', async (c) => {
  const raw = c.req.query('username') ?? '';
  const username = raw
    .trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^@/, '')
    .split('/')[0];
  if (!username) return c.json({ error: 'username is required' }, 400);
  try {
    const info = await getChannelInfo(username);
    return c.json(info);
  } catch {
    return c.json({ error: 'Channel not found or inaccessible' }, 404);
  }
});

// GET /api/channels
router.get('/', async (c) => {
  const result = await db
    .select({
      id: channels.id,
      telegramId: channels.telegramId,
      name: channels.name,
      description: channels.description,
      channelType: channels.channelType,
      groupId: channels.groupId,
      sortOrder: channels.sortOrder,
      lastFetchedAt: channels.lastFetchedAt,
      lastReadAt: channels.lastReadAt,
      isUnavailable: channels.isUnavailable,
      createdAt: channels.createdAt,
      unreadCount: count(news.id),
    })
    .from(channels)
    .leftJoin(news, and(eq(news.channelId, channels.id), eq(news.isRead, 0)))
    .groupBy(channels.id)
    .orderBy(channels.sortOrder, channels.createdAt);
  return c.json(result);
});

// POST /api/channels
router.post('/', async (c) => {
  const body = await c.req.json<{
    telegramId: string;
    name: string;
    description?: string;
    channelType?: ChannelType;
    groupId?: number | null;
  }>();
  if (!body.telegramId || !body.name) {
    return c.json({ error: 'telegramId and name are required' }, 400);
  }

  const telegramId = body.telegramId
    .trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^@/, '')
    .split('/')[0];

  try {
    const [created] = await db
      .insert(channels)
      .values({
        telegramId,
        name: body.name.trim(),
        description: body.description?.trim(),
        channelType: body.channelType ?? 'none',
        groupId: body.groupId ?? null,
      })
      .returning();
    return c.json(created, 201);
  } catch (err: unknown) {
    const error = err as { message?: string };
    if (error.message?.includes('UNIQUE')) {
      return c.json({ error: 'Channel with this Telegram ID already exists' }, 409);
    }
    throw err;
  }
});

// PUT /api/channels/:id
router.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json<{
    name?: string;
    description?: string;
    channelType?: ChannelType;
    groupId?: number | null;
    lastFetchedAt?: number;
  }>();

  const [updated] = await db
    .update(channels)
    .set({
      ...(body.name && { name: body.name.trim() }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.channelType !== undefined && { channelType: body.channelType }),
      ...(body.groupId !== undefined && { groupId: body.groupId }),
      ...(body.lastFetchedAt !== undefined && { lastFetchedAt: body.lastFetchedAt }),
    })
    .where(eq(channels.id, id))
    .returning();

  if (!updated) return c.json({ error: 'Channel not found' }, 404);
  return c.json(updated);
});

// DELETE /api/channels/:id
router.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const [deleted] = await db.delete(channels).where(eq(channels.id, id)).returning();
  if (!deleted) return c.json({ error: 'Channel not found' }, 404);

  // Remove media files from disk
  const mediaDir = join(process.cwd(), 'data', deleted.telegramId);
  if (existsSync(mediaDir)) {
    try {
      rmSync(mediaDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`Failed to remove media folder for channel ${deleted.telegramId}:`, err);
    }
  }

  return c.json({ success: true });
});

// GET /api/channels/:id/media-progress — SSE stream for media download progress
router.get('/:id/media-progress', (c) => {
  const channelId = parseInt(c.req.param('id'), 10);
  const abortSignal = c.req.raw.signal;

  return streamSSE(c, async (stream) => {
    const cleanupFns: Array<() => void> = [];

    await new Promise<void>((resolve) => {
      const onEvent = (event: MediaProgressEvent) => {
        void stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
        if (event.type === 'complete' || event.type === 'aborted') resolve();
      };

      mediaProgressEmitter.on(`channel:${channelId}`, onEvent);
      const timeout = setTimeout(resolve, 5 * 60 * 1000);

      cleanupFns.push(() => {
        mediaProgressEmitter.off(`channel:${channelId}`, onEvent);
        clearTimeout(timeout);
      });

      abortSignal.addEventListener('abort', () => resolve());
    });

    cleanupFns.forEach((fn) => fn());
  });
});

// Shared helper — calculates the sinceDate for a channel using stored DB state (no Telegram calls)
export function getSinceDate(channel: { lastFetchedAt: number | null; lastReadAt: number | null }): Date {
  if (channel.lastReadAt) return new Date(channel.lastReadAt * 1000);
  if (channel.lastFetchedAt) return new Date(channel.lastFetchedAt * 1000);
  // New channel — default to configured days ago
  return new Date(Date.now() - NEWS_DEFAULT_FETCH_DAYS * 24 * 60 * 60 * 1000);
}

// POST /api/channels/count-unread — counts new messages in Telegram per channel without fetching
router.post('/count-unread', async (c) => {
  const allChannels = await db.select().from(channels);
  const counts: Record<number, number> = {};

  for (const channel of allChannels) {
    try {
      const sinceDate = getSinceDate(channel);
      const messages = await fetchChannelMessages(channel.telegramId, { sinceDate, limit: 200 });
      counts[channel.id] = messages.length;
      // Reset unavailable flag if channel is reachable again
      if (channel.isUnavailable) {
        await db.update(channels).set({ isUnavailable: 0 }).where(eq(channels.id, channel.id));
      }
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err).toLowerCase();
      const isGone =
        msg.includes('username_not_occupied') ||
        msg.includes('channel_invalid') ||
        msg.includes('username_invalid') ||
        msg.includes('could not find the input entity') ||
        msg.includes('no user has') ||
        msg.includes('channelprivate');
      if (isGone) {
        await db.update(channels).set({ isUnavailable: 1 }).where(eq(channels.id, channel.id));
      }
      counts[channel.id] = 0;
    }
  }

  return c.json(counts);
});

// POST /api/channels/:id/fetch
router.post('/:id/fetch', async (c) => {
  const channelId = parseInt(c.req.param('id'), 10);
  const body = await c.req
    .json<{ since?: string; limit?: number }>()
    .catch((): { since?: string; limit?: number } => ({}));

  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId));
  if (!channel) return c.json({ error: 'Channel not found' }, 404);

  let sinceDate: Date | undefined;

  if (body.since === 'lastSync') {
    // Dropdown: "С последней синхронизации" — use lastFetchedAt
    if (channel.lastFetchedAt) {
      sinceDate = new Date(channel.lastFetchedAt * 1000);
    }
  } else if (body.since) {
    // Dropdown: specific days (ISO date string)
    sinceDate = new Date(body.since);
  } else {
    // Default button: try to get freshest readInboxMaxId from Telegram, fallback to stored state
    const isNewChannel = !channel.lastFetchedAt && !channel.lastReadAt;
    if (isNewChannel) {
      sinceDate = new Date(Date.now() - NEWS_DEFAULT_FETCH_DAYS * 24 * 60 * 60 * 1000);
    } else {
      const readMaxId = await getReadInboxMaxId(channel.telegramId);
      if (readMaxId) {
        const readMsg = await fetchMessageById(channel.telegramId, readMaxId);
        if (readMsg) {
          sinceDate = new Date(readMsg.date * 1000);
          await db.update(channels).set({ lastReadAt: readMsg.date }).where(eq(channels.id, channelId));
        }
      }
      // Fallback to stored state via shared helper
      if (!sinceDate) sinceDate = getSinceDate(channel);
    }
  }

  try {
    // Clean up read news (and their media files) before fetching new ones
    const deletedRead = await db
      .delete(news)
      .where(and(eq(news.channelId, channelId), eq(news.isRead, 1)))
      .returning({ localMediaPath: news.localMediaPath });
    for (const row of deletedRead) {
      if (!row.localMediaPath) continue;
      const filepath = join(process.cwd(), 'data', row.localMediaPath);
      if (existsSync(filepath)) {
        try {
          unlinkSync(filepath);
        } catch {
          /* ignore */
        }
      }
    }

    const messages = await fetchChannelMessages(channel.telegramId, {
      sinceDate,
      limit: body.limit || NEWS_FETCH_LIMIT,
    });

    // Insert messages and collect inserted IDs
    let inserted = 0;
    const insertedMap = new Map<number, number>(); // telegramMsgId → news.id

    for (const msg of messages) {
      const [row] = await db
        .insert(news)
        .values({
          channelId,
          telegramMsgId: msg.id,
          text: msg.message,
          links: JSON.stringify(msg.links),
          hashtags: JSON.stringify(msg.hashtags),
          mediaType: msg.mediaType,
          postedAt: msg.date,
          mediaSize: msg.mediaSizeBytes,
        })
        .onConflictDoNothing()
        .returning({ id: news.id });

      if (row) {
        insertedMap.set(msg.id, row.id);
        inserted++;
      }
    }

    const now = Math.floor(Date.now() / 1000);
    await db.update(channels).set({ lastFetchedAt: now }).where(eq(channels.id, channelId));

    const strategy = getChannelStrategy(channel.channelType as ChannelType);
    const mediaProcessing = strategy.requiresMediaProcessing(messages);

    const args: PostProcessArgs = {
      channelId,
      channelTelegramId: channel.telegramId,
      messages,
      insertedMap,
    };

    // Fire post-processing in background — just queues tasks, returns immediately
    void strategy.postProcess(args);

    return c.json({ inserted, total: messages.length, mediaProcessing });
  } catch (err: unknown) {
    const error = err as { message?: string };
    console.error('Fetch error:', err);
    return c.json({ error: error.message || 'Failed to fetch messages' }, 500);
  }
});

export default router;
