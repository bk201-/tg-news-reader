import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({
  JWT_SECRET: 'test-secret-key',
  JWT_ACCESS_EXPIRES_SEC: 900,
  REFRESH_EXPIRES_DAYS: 7,
  NEWS_DEFAULT_FETCH_DAYS: 3,
  NEWS_FETCH_LIMIT: 1000,
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

// Mock Telegram — no real TG calls
vi.mock('../services/telegram.js', () => ({
  readChannelHistory: vi.fn().mockResolvedValue(undefined),
  getChannelInfo: vi.fn(),
  fetchChannelMessages: vi.fn(),
  fetchMessageById: vi.fn(),
  getReadInboxMaxId: vi.fn(),
}));

import { Hono } from 'hono';
import { createTestDb, type TestDb } from '../__tests__/testDb.js';
import { createTestUser, authHeaders } from '../__tests__/auth.js';
import { seedChannel, seedNews, seedDownload } from '../__tests__/seed.js';

let testDb: TestDb;

vi.mock('../db/index.js', () => ({
  get client() {
    return testDb.client;
  },
  get db() {
    return testDb.db;
  },
}));

import newsRouter from './news.js';
import { authMiddleware } from '../middleware/auth.js';

function createApp() {
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api/news', newsRouter);
  return app;
}

describe('News routes (integration)', () => {
  let app: ReturnType<typeof createApp>;
  let headers: Record<string, string>;

  beforeAll(async () => {
    testDb = await createTestDb();
    const user = await createTestUser(testDb.db);
    headers = await authHeaders(user.id);
  });

  beforeEach(async () => {
    await testDb.client.execute('DELETE FROM news');
    await testDb.client.execute('DELETE FROM channels');
    app = createApp();
  });

  // ── GET /api/news ─────────────────────────────────────────────────────────

  describe('GET /api/news', () => {
    it('returns 401 without auth', async () => {
      const res = await app.request('/api/news');
      expect(res.status).toBe(401);
    });

    it('returns empty items for an empty DB', async () => {
      const res = await app.request('/api/news', { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toEqual([]);
      expect(body.hasMore).toBe(false);
    });

    it('returns news items ordered by postedAt asc', async () => {
      const ch = await seedChannel(testDb.db);
      const n1 = await seedNews(testDb.db, ch.id, { postedAt: 1000, text: 'first' });
      const n2 = await seedNews(testDb.db, ch.id, { postedAt: 2000, text: 'second' });

      const res = await app.request('/api/news', { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(2);
      expect(body.items[0].id).toBe(n1.id);
      expect(body.items[1].id).toBe(n2.id);
    });

    it('filters by channelId', async () => {
      const ch1 = await seedChannel(testDb.db, { telegramId: 'ch1' });
      const ch2 = await seedChannel(testDb.db, { telegramId: 'ch2' });
      await seedNews(testDb.db, ch1.id, { text: 'ch1 news' });
      await seedNews(testDb.db, ch2.id, { text: 'ch2 news' });

      const res = await app.request(`/api/news?channelId=${ch1.id}`, { headers });
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].text).toBe('ch1 news');
    });

    it('supports cursor-based pagination', async () => {
      const ch = await seedChannel(testDb.db);
      await seedNews(testDb.db, ch.id, { postedAt: 100 });
      await seedNews(testDb.db, ch.id, { postedAt: 200, telegramMsgId: 201 });
      await seedNews(testDb.db, ch.id, { postedAt: 300, telegramMsgId: 301 });

      // First page: limit=2
      const res1 = await app.request(`/api/news?channelId=${ch.id}&limit=2`, { headers });
      const body1 = await res1.json();
      expect(body1.items).toHaveLength(2);
      expect(body1.hasMore).toBe(true);
      expect(body1.nextCursor).toBe(200);

      // Second page using cursor
      const res2 = await app.request(`/api/news?channelId=${ch.id}&limit=2&cursor=${body1.nextCursor}`, { headers });
      const body2 = await res2.json();
      expect(body2.items).toHaveLength(1);
      expect(body2.hasMore).toBe(false);
    });
  });

  // ── GET /api/news/:id ─────────────────────────────────────────────────────

  describe('GET /api/news/:id', () => {
    it('returns a single news item', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id, { text: 'hello world' });

      const res = await app.request(`/api/news/${n.id}`, { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(n.id);
      expect(body.text).toBe('hello world');
    });

    it('returns 404 for missing item', async () => {
      const res = await app.request('/api/news/99999', { headers });
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /api/news/:id/read ──────────────────────────────────────────────

  describe('PATCH /api/news/:id/read', () => {
    it('marks a news item as read and updates unreadCount', async () => {
      const ch = await seedChannel(testDb.db, { unreadCount: 1 });
      const n = await seedNews(testDb.db, ch.id, { isRead: 0 });

      const res = await app.request(`/api/news/${n.id}/read`, {
        method: 'PATCH',
        headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isRead).toBe(1);
    });

    it('returns 404 for missing item', async () => {
      const res = await app.request('/api/news/99999/read', {
        method: 'PATCH',
        headers,
      });
      expect(res.status).toBe(404);
    });
  });

  // ── POST /api/news/read-all ───────────────────────────────────────────────

  describe('POST /api/news/read-all', () => {
    it('marks all unread news as read', async () => {
      const ch = await seedChannel(testDb.db, { unreadCount: 2 });
      await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 1 });
      await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 2 });

      const res = await app.request('/api/news/read-all', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: ch.id }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify they're all read
      const checkRes = await app.request(`/api/news?channelId=${ch.id}&isRead=0`, { headers });
      const checkBody = await checkRes.json();
      expect(checkBody.items).toHaveLength(0);
    });
  });

  // ── DELETE /api/news/read ─────────────────────────────────────────────────

  describe('DELETE /api/news/read', () => {
    it('deletes all read news', async () => {
      const ch = await seedChannel(testDb.db, { totalNewsCount: 3 });
      await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 1 });
      await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 2 });
      await seedNews(testDb.db, ch.id, { isRead: 0, telegramMsgId: 3 });

      const res = await app.request('/api/news/read', {
        method: 'DELETE',
        headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(2);

      // Unread item should still be there
      const checkRes = await app.request('/api/news', { headers });
      const checkBody = await checkRes.json();
      expect(checkBody.items).toHaveLength(1);
    });

    it('deletes read news for a specific channel only', async () => {
      const ch1 = await seedChannel(testDb.db, { telegramId: 'ch_del1', totalNewsCount: 2 });
      const ch2 = await seedChannel(testDb.db, { telegramId: 'ch_del2', totalNewsCount: 1 });
      await seedNews(testDb.db, ch1.id, { isRead: 1, telegramMsgId: 10 });
      await seedNews(testDb.db, ch1.id, { isRead: 1, telegramMsgId: 11 });
      await seedNews(testDb.db, ch2.id, { isRead: 1, telegramMsgId: 20 });

      const res = await app.request('/api/news/read', {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: ch1.id }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(2);

      // ch2's read news should still be there
      const checkRes = await app.request('/api/news', { headers });
      const checkBody = await checkRes.json();
      expect(checkBody.items).toHaveLength(1);
      expect(checkBody.items[0].channelId).toBe(ch2.id);
    });

    it('protects read news with active (pending/processing) downloads', async () => {
      const ch = await seedChannel(testDb.db, { totalNewsCount: 3 });
      const n1 = await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 30 });
      const n2 = await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 31 });
      const n3 = await seedNews(testDb.db, ch.id, { isRead: 1, telegramMsgId: 32 });

      // n1 has a pending download, n2 has a processing download — both protected
      await seedDownload(testDb.db, n1.id, { status: 'pending' });
      await seedDownload(testDb.db, n2.id, { status: 'processing' });
      // n3 has a completed download — NOT protected
      await seedDownload(testDb.db, n3.id, { status: 'done' });

      const res = await app.request('/api/news/read', {
        method: 'DELETE',
        headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      // Only n3 should be deleted; n1 and n2 are protected
      expect(body.deleted).toBe(1);

      // n1 and n2 should still exist
      const checkRes = await app.request('/api/news', { headers });
      const checkBody = await checkRes.json();
      expect(checkBody.items).toHaveLength(2);
      const ids = checkBody.items.map((i: { id: number }) => i.id);
      expect(ids).toContain(n1.id);
      expect(ids).toContain(n2.id);
    });
  });

  // ── ETag support ─────────────────────────────────────────────────────────

  describe('GET /api/news (ETag)', () => {
    it('returns 304 when If-None-Match matches ETag', async () => {
      const ch = await seedChannel(testDb.db);
      await seedNews(testDb.db, ch.id, { postedAt: 5000 });

      // First request to get the ETag
      const res1 = await app.request('/api/news', { headers });
      expect(res1.status).toBe(200);
      const etag = res1.headers.get('ETag');
      expect(etag).toBeTruthy();

      // Second request with If-None-Match
      const res2 = await app.request('/api/news', {
        headers: { ...headers, 'If-None-Match': etag! },
      });
      expect(res2.status).toBe(304);
    });

    it('ETag changes when localMediaPath is set (download complete)', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id, { postedAt: 6000 });

      // First request — no media path
      const res1 = await app.request(`/api/news?channelId=${ch.id}`, { headers });
      expect(res1.status).toBe(200);
      const etag1 = res1.headers.get('ETag');

      // Simulate download worker updating localMediaPath
      await testDb.client.execute(`UPDATE news SET local_media_path = 'ch/1.jpg' WHERE id = ${n.id}`);

      // Second request — ETag should differ, must NOT return 304
      const res2 = await app.request(`/api/news?channelId=${ch.id}`, {
        headers: { ...headers, 'If-None-Match': etag1! },
      });
      expect(res2.status).toBe(200);
      const body = (await res2.json()) as { items: Array<{ localMediaPath?: string }> };
      expect(body.items[0].localMediaPath).toBe('ch/1.jpg');
    });
  });

  // ── POST /api/news/read-all (global) ───────────────────────────────────

  describe('POST /api/news/read-all (global)', () => {
    it('marks all unread news across all channels as read', async () => {
      const ch1 = await seedChannel(testDb.db, { telegramId: 'g1', unreadCount: 1 });
      const ch2 = await seedChannel(testDb.db, { telegramId: 'g2', unreadCount: 1 });
      await seedNews(testDb.db, ch1.id, { isRead: 0, telegramMsgId: 50 });
      await seedNews(testDb.db, ch2.id, { isRead: 0, telegramMsgId: 60 });

      const res = await app.request('/api/news/read-all', {
        method: 'POST',
        headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify all are read
      const checkRes = await app.request('/api/news?isRead=0', { headers });
      const checkBody = await checkRes.json();
      expect(checkBody.items).toHaveLength(0);
    });
  });

  // ── PATCH /api/news/:id/read (mark unread) ─────────────────────────────

  describe('PATCH /api/news/:id/read (mark unread)', () => {
    it('marks a read news item as unread', async () => {
      const ch = await seedChannel(testDb.db, { unreadCount: 0 });
      const n = await seedNews(testDb.db, ch.id, { isRead: 1 });

      const res = await app.request(`/api/news/${n.id}/read`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: 0 }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isRead).toBe(0);
    });
  });

  // ── GET /api/news?filtered=1 ───────────────────────────────────────────

  describe('GET /api/news (filtered)', () => {
    it('excludes isFiltered=1 items when filtered=1', async () => {
      const ch = await seedChannel(testDb.db);
      await seedNews(testDb.db, ch.id, { isFiltered: 0, postedAt: 100, telegramMsgId: 70 });
      await seedNews(testDb.db, ch.id, { isFiltered: 1, postedAt: 200, telegramMsgId: 71 });

      const res = await app.request(`/api/news?channelId=${ch.id}&filtered=1`, { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.filteredOut).toBe(1);
    });

    it('auto-filters non-media posts for media channel type', async () => {
      const ch = await seedChannel(testDb.db, { channelType: 'media' });
      await seedNews(testDb.db, ch.id, { mediaType: 'photo', postedAt: 100, telegramMsgId: 80 });
      await seedNews(testDb.db, ch.id, { mediaType: 'webpage', postedAt: 200, telegramMsgId: 81 });

      const res = await app.request(`/api/news?channelId=${ch.id}&filtered=1`, { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      // Only 'photo' passes the media filter (photo/document/audio)
      expect(body.items).toHaveLength(1);
      expect(body.items[0].mediaType).toBe('photo');
    });
  });
});
