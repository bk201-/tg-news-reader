import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({
  JWT_SECRET: 'test-secret-key',
  JWT_ACCESS_EXPIRES_SEC: 900,
  REFRESH_EXPIRES_DAYS: 7,
  DOWNLOAD_TASK_CLEANUP_DELAY_MS: 30_000,
  WORKER_POOL_CRASH_THRESHOLD_RATIO: 0.8,
  WORKER_POOL_CRASH_WINDOW_MS: 60_000,
  WORKER_RESTART_BASE_MS: 5_000,
  WORKER_RESTART_JITTER_MS: 3_000,
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

vi.mock('./downloadProgress.js', () => ({
  downloadProgressEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  emitTaskUpdate: vi.fn(),
}));

vi.mock('./DownloadCoordinator.js', () => {
  return {
    DownloadCoordinator: class MockCoordinator {
      stopped = false;
      start = vi.fn().mockResolvedValue(undefined);
    },
  };
});

import { createTestDb, type TestDb } from '../__tests__/testDb.js';
import { seedChannel, seedNews } from '../__tests__/seed.js';

let testDb: TestDb;

vi.mock('../db/index.js', () => ({
  get client() {
    return testDb.client;
  },
  get db() {
    return testDb.db;
  },
}));

import {
  enqueueTask,
  prioritizeTask,
  getActiveTasks,
  startWorkerPool,
  isWorkerPoolStopped,
} from './downloadManager.js';
import { downloadProgressEmitter } from './downloadProgress.js';

describe('downloadManager — public API (integration)', () => {
  let channelId: number;
  let newsId: number;

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  beforeEach(async () => {
    await testDb.client.execute('DELETE FROM downloads');
    await testDb.client.execute('DELETE FROM news');
    await testDb.client.execute('DELETE FROM channels');
    vi.clearAllMocks();

    const ch = await seedChannel(testDb.db);
    channelId = ch.id;
    const n = await seedNews(testDb.db, channelId);
    newsId = n.id;
  });

  // ── enqueueTask ──────────────────────────────────────────────────────────

  describe('enqueueTask', () => {
    it('inserts a pending task and emits wakeup', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);

      const rows = await testDb.client.execute('SELECT * FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].type).toBe('media');
      expect(rows.rows[0].status).toBe('pending');
      expect(rows.rows[0].priority).toBe(0);
      expect(downloadProgressEmitter.emit).toHaveBeenCalledWith('wakeup');
    });

    it('inserts an article task with url', async () => {
      await enqueueTask(newsId, 'article', 'https://example.com', 0);

      const rows = await testDb.client.execute('SELECT * FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].type).toBe('article');
      expect(rows.rows[0].url).toBe('https://example.com');
    });

    it('keeps MAX(priority) on conflict', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);
      await enqueueTask(newsId, 'media', undefined, 10);

      const rows = await testDb.client.execute('SELECT * FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].priority).toBe(10);
    });

    it('does not downgrade priority on re-enqueue', async () => {
      await enqueueTask(newsId, 'media', undefined, 10);
      await enqueueTask(newsId, 'media', undefined, 0);

      const rows = await testDb.client.execute('SELECT * FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows[0].priority).toBe(10);
    });

    it('resets failed task to pending on re-enqueue', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);
      await testDb.client.execute("UPDATE downloads SET status = 'failed', error = 'some error' WHERE news_id = ?", [
        newsId,
      ]);

      await enqueueTask(newsId, 'media', undefined, 0);

      const rows = await testDb.client.execute('SELECT * FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows[0].status).toBe('pending');
      expect(rows.rows[0].error).toBeNull();
    });

    it('resets done task to pending only for user-initiated priority', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);
      await testDb.client.execute("UPDATE downloads SET status = 'done' WHERE news_id = ?", [newsId]);

      // Background re-enqueue (priority=0) should NOT reset done
      await enqueueTask(newsId, 'media', undefined, 0);
      let rows = await testDb.client.execute('SELECT * FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows[0].status).toBe('done');

      // User-initiated (priority=10) should reset done → pending
      await enqueueTask(newsId, 'media', undefined, 10);
      rows = await testDb.client.execute('SELECT * FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows[0].status).toBe('pending');
    });

    it('preserves url via COALESCE on conflict', async () => {
      await enqueueTask(newsId, 'article', 'https://example.com', 0);
      await enqueueTask(newsId, 'article', undefined, 10);

      const rows = await testDb.client.execute('SELECT * FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows[0].url).toBe('https://example.com');
    });
  });

  // ── prioritizeTask ───────────────────────────────────────────────────────

  describe('prioritizeTask', () => {
    it('sets priority to 10 and emits wakeup', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);
      const rows = await testDb.client.execute('SELECT id FROM downloads WHERE news_id = ?', [newsId]);
      const taskId = rows.rows[0].id as number;

      vi.clearAllMocks();
      await prioritizeTask(taskId);

      const updated = await testDb.client.execute('SELECT * FROM downloads WHERE id = ?', [taskId]);
      expect(updated.rows[0].priority).toBe(10);
      expect(downloadProgressEmitter.emit).toHaveBeenCalledWith('wakeup');
    });

    it('resets failed task to pending when prioritized', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);
      const rows = await testDb.client.execute('SELECT id FROM downloads WHERE news_id = ?', [newsId]);
      const taskId = rows.rows[0].id as number;

      await testDb.client.execute("UPDATE downloads SET status = 'failed', error = 'err' WHERE id = ?", [taskId]);

      await prioritizeTask(taskId);

      const updated = await testDb.client.execute('SELECT * FROM downloads WHERE id = ?', [taskId]);
      expect(updated.rows[0].status).toBe('pending');
      expect(updated.rows[0].error).toBeNull();
    });

    it('does not change status of pending task', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);
      const rows = await testDb.client.execute('SELECT id FROM downloads WHERE news_id = ?', [newsId]);
      const taskId = rows.rows[0].id as number;

      await prioritizeTask(taskId);

      const updated = await testDb.client.execute('SELECT * FROM downloads WHERE id = ?', [taskId]);
      expect(updated.rows[0].status).toBe('pending');
    });
  });

  // ── getActiveTasks ───────────────────────────────────────────────────────

  describe('getActiveTasks', () => {
    it('returns empty array when no tasks', async () => {
      const tasks = await getActiveTasks();
      expect(tasks).toEqual([]);
    });

    it('returns pending and failed tasks with channel context', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);

      const tasks = await getActiveTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].newsId).toBe(newsId);
      expect(tasks[0].type).toBe('media');
      expect(tasks[0].status).toBe('pending');
      expect(tasks[0].channelName).toBeDefined();
    });

    it('excludes done tasks', async () => {
      await enqueueTask(newsId, 'media', undefined, 0);
      await testDb.client.execute("UPDATE downloads SET status = 'done' WHERE news_id = ?", [newsId]);

      const tasks = await getActiveTasks();
      expect(tasks).toHaveLength(0);
    });

    it('orders by priority desc, then created_at asc', async () => {
      const n2 = await seedNews(testDb.db, channelId);

      await enqueueTask(newsId, 'media', undefined, 0);
      await enqueueTask(n2.id, 'media', undefined, 10);

      const tasks = await getActiveTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks[0].newsId).toBe(n2.id); // priority 10 first
      expect(tasks[1].newsId).toBe(newsId); // priority 0 second
    });
  });

  // ── isWorkerPoolStopped ────────────────────────────────────────────────

  describe('isWorkerPoolStopped', () => {
    it('returns false when no coordinator is created', () => {
      expect(isWorkerPoolStopped()).toBe(false);
    });

    it('returns false after startWorkerPool when pool is healthy', () => {
      startWorkerPool(2);
      expect(isWorkerPoolStopped()).toBe(false);
    });
  });
});
