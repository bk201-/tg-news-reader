import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({
  JWT_SECRET: 'test-secret-key',
  JWT_ACCESS_EXPIRES_SEC: 900,
  REFRESH_EXPIRES_DAYS: 7,
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

vi.mock('../services/downloadManager.js', () => ({
  enqueueTask: vi.fn().mockResolvedValue(undefined),
  prioritizeTask: vi.fn().mockResolvedValue(undefined),
  getActiveTasks: vi.fn().mockResolvedValue([]),
  startWorkerPool: vi.fn(),
  isWorkerPoolStopped: vi.fn().mockReturnValue(false),
}));

vi.mock('../services/downloadProgress.js', () => ({
  downloadProgressEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
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

import downloadsRouter from './downloads.js';
import { authMiddleware } from '../middleware/auth.js';
import { enqueueTask, prioritizeTask, getActiveTasks } from '../services/downloadManager.js';

function createApp() {
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api/downloads', downloadsRouter);
  return app;
}

describe('Downloads routes (integration)', () => {
  let app: ReturnType<typeof createApp>;
  let headers: Record<string, string>;

  beforeAll(async () => {
    testDb = await createTestDb();
    const user = await createTestUser(testDb.db);
    headers = await authHeaders(user.id);
  });

  beforeEach(async () => {
    await testDb.client.execute('DELETE FROM downloads');
    await testDb.client.execute('DELETE FROM news');
    await testDb.client.execute('DELETE FROM channels');
    app = createApp();
    vi.clearAllMocks();
  });

  // ── GET /api/downloads ────────────────────────────────────────────────────

  describe('GET /api/downloads', () => {
    it('returns 401 without auth', async () => {
      const res = await app.request('/api/downloads');
      expect(res.status).toBe(401);
    });

    it('returns active tasks from downloadManager', async () => {
      const mockTasks = [{ id: 1, newsId: 10, type: 'media', status: 'pending', priority: 0 }];
      vi.mocked(getActiveTasks).mockResolvedValueOnce(mockTasks as never);

      const res = await app.request('/api/downloads', { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(mockTasks);
    });
  });

  // ── POST /api/downloads ───────────────────────────────────────────────────

  describe('POST /api/downloads', () => {
    it('enqueues a download task with default priority=10', async () => {
      const res = await app.request('/api/downloads', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ newsId: 1, type: 'media' }),
      });

      expect(res.status).toBe(200);
      expect(enqueueTask).toHaveBeenCalledWith(1, 'media', undefined, 10);
    });

    it('passes url and custom priority', async () => {
      const res = await app.request('/api/downloads', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ newsId: 5, type: 'article', url: 'https://example.com', priority: 0 }),
      });

      expect(res.status).toBe(200);
      expect(enqueueTask).toHaveBeenCalledWith(5, 'article', 'https://example.com', 0);
    });
  });

  // ── PATCH /api/downloads/:id/prioritize ───────────────────────────────────

  describe('PATCH /api/downloads/:id/prioritize', () => {
    it('calls prioritizeTask with the correct id', async () => {
      const res = await app.request('/api/downloads/42/prioritize', {
        method: 'PATCH',
        headers,
      });

      expect(res.status).toBe(200);
      expect(prioritizeTask).toHaveBeenCalledWith(42);
    });
  });

  // ── DELETE /api/downloads/:id ─────────────────────────────────────────────

  describe('DELETE /api/downloads/:id', () => {
    it('deletes a download task from the DB', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id);
      const dl = await seedDownload(testDb.db, n.id);

      const res = await app.request(`/api/downloads/${dl.id}`, {
        method: 'DELETE',
        headers,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 404 for non-existent task', async () => {
      const res = await app.request('/api/downloads/99999', {
        method: 'DELETE',
        headers,
      });
      expect(res.status).toBe(404);
    });
  });
});
