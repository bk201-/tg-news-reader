import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as storageModule from './downloadStorage.js';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({
  DOWNLOAD_TASK_CLEANUP_DELAY_MS: 100,
  WORKER_POOL_CRASH_THRESHOLD_RATIO: 0.5,
  WORKER_POOL_CRASH_WINDOW_MS: 60_000,
  WORKER_RESTART_BASE_MS: 10,
  WORKER_RESTART_JITTER_MS: 0,
  ARTICLE_WORKER_CONCURRENCY: 3,
  DOWNLOAD_STORAGE_RESERVE_BYTES: 1024 ** 3,
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

vi.mock('./alertBot.js', () => ({
  sendAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/retry.js', async () => {
  return {
    withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    DB_POLL_POLICY: {},
  };
});

const createdWorkers: any[] = [];

vi.mock('worker_threads', async () => {
  const { EventEmitter } = await import('events');
  class FakeWorker extends EventEmitter {
    postMessage = vi.fn();
    terminate = vi.fn().mockResolvedValue(0);
    constructor() {
      super();
      createdWorkers.push(this);
    }
  }
  return { Worker: FakeWorker };
});

vi.mock('./telegramBridge.js', () => ({
  handleBridgeMessage: vi.fn(),
  isBridgeMessage: vi.fn((msg: { type: string }) => msg.type.startsWith('tg:')),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  statfs: vi.fn().mockResolvedValue({ bavail: 10 * 1024 * 1024, bsize: 4096 }),
}));

vi.mock('./downloadStorage.js', async (importOriginal) => ({
  ...(await importOriginal<typeof storageModule>()),
  get downloadStorage() {
    return storage;
  },
}));

// ─── DB mock ────────────────────────────────────────────────────────────────

import { seedChannel, seedNews, seedDownload } from '../__tests__/seed.js';
import { createTestDb } from '../__tests__/testDb.js';
import type { TestDb } from '../__tests__/testDb.js';

let testDb: TestDb;

vi.mock('../db/index.js', () => ({
  get client() {
    return testDb.client;
  },
  get db() {
    return testDb.db;
  },
}));

vi.mock('./downloadProgress.js', async () => {
  const { EventEmitter } = await import('node:events');
  const emitter = new EventEmitter();
  vi.spyOn(emitter, 'on');
  vi.spyOn(emitter, 'emit');
  return { downloadProgressEmitter: emitter, emitTaskUpdate: vi.fn() };
});

import { statfs } from 'node:fs/promises';
import { sendAlert } from './alertBot.js';
import { DownloadCoordinator } from './DownloadCoordinator.js';
import { downloadProgressEmitter, emitTaskUpdate } from './downloadProgress.js';
import { DownloadStorage } from './downloadStorage.js';
import { handleBridgeMessage } from './telegramBridge.js';

let storage: DownloadStorage;

describe('DownloadCoordinator (integration)', () => {
  let channelId: number;
  let newsId: number;

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  beforeEach(async () => {
    await testDb.client.execute('DELETE FROM downloads');
    await testDb.client.execute('DELETE FROM news');
    await testDb.client.execute('DELETE FROM channels');
    createdWorkers.length = 0;
    vi.clearAllMocks();
    storage = new DownloadStorage();

    const ch = await seedChannel(testDb.db);
    channelId = ch.id;
    const n = await seedNews(testDb.db, channelId);
    newsId = n.id;
  });

  afterEach(async () => {
    // Stop each test's fake pool through its circuit breaker, including poll timers.
    for (const worker of createdWorkers) worker.emit('error', new Error('test teardown'));
    downloadProgressEmitter.removeAllListeners();
    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  // ── start() ──────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('resets processing tasks to pending on startup', async () => {
      await seedDownload(testDb.db, newsId, { status: 'processing' });

      const coordinator = new DownloadCoordinator(1);
      await coordinator.start();

      const rows = await testDb.client.execute('SELECT status FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows[0].status).toBe('pending');
    });

    it('spawns the requested number of workers', async () => {
      const coordinator = new DownloadCoordinator(3);
      await coordinator.start();

      expect(createdWorkers).toHaveLength(3);
      expect(coordinator.stopped).toBe(false);
    });

    it('registers wakeup listener on downloadProgressEmitter', async () => {
      const coordinator = new DownloadCoordinator(1);
      await coordinator.start();

      expect(downloadProgressEmitter.on).toHaveBeenCalledWith('wakeup', expect.any(Function));
    });
  });

  // ── Task dispatch ────────────────────────────────────────────────────────

  describe('task dispatch', () => {
    it.each(['main', 'worker'])('resumes a paused pending task immediately after %s-thread cleanup', async (source) => {
      vi.mocked(statfs).mockResolvedValueOnce({ bavail: 100, bsize: 4096 } as Awaited<ReturnType<typeof statfs>>);
      await seedDownload(testDb.db, newsId);
      const coordinator = new DownloadCoordinator(1);
      await coordinator.start();
      await vi.waitFor(() => expect(storage.status.paused).toBe(true));
      expect(createdWorkers[0].postMessage).not.toHaveBeenCalled();

      if (source === 'main') downloadProgressEmitter.emit('storage_freed');
      else createdWorkers[0].emit('message', { type: 'storage_freed' });

      await vi.waitFor(() => expect(createdWorkers[0].postMessage).toHaveBeenCalled());
      expect(storage.status.paused).toBe(false);
    });

    it('automatically retries the paused queue when space is freed outside the app', async () => {
      vi.useFakeTimers();
      vi.mocked(statfs).mockResolvedValueOnce({ bavail: 100, bsize: 4096 } as Awaited<ReturnType<typeof statfs>>);
      await seedDownload(testDb.db, newsId);
      const coordinator = new DownloadCoordinator(1);
      await coordinator.start();
      await vi.waitFor(() => expect(storage.status.paused).toBe(true));

      await vi.advanceTimersByTimeAsync(61_000);

      await vi.waitFor(() => expect(createdWorkers[0].postMessage).toHaveBeenCalled());
      expect(storage.status.paused).toBe(false);
    });

    it.each(['tasks_removed', 'task_removed'])('reconsiders smaller pending work after %s', async (event) => {
      await expect(storage.check(100 * 1024 ** 3)).rejects.toMatchObject({ code: 'STORAGE_PAUSED' });
      const oversizedTask = await seedDownload(testDb.db, newsId);
      const image = await seedNews(testDb.db, channelId, { mediaType: 'photo' });
      const imageTask = await seedDownload(testDb.db, image.id);
      const coordinator = new DownloadCoordinator(1);
      await coordinator.start();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(createdWorkers[0].postMessage).not.toHaveBeenCalled();

      if (event === 'tasks_removed') {
        await testDb.client.execute('DELETE FROM news WHERE id = ?', [newsId]);
        downloadProgressEmitter.emit(event, [newsId]);
      } else {
        await testDb.client.execute('DELETE FROM downloads WHERE id = ?', [oversizedTask.id]);
        downloadProgressEmitter.emit(event, oversizedTask.id);
      }

      await vi.waitFor(() =>
        expect(createdWorkers[0].postMessage).toHaveBeenCalledWith({
          type: 'task',
          payload: expect.objectContaining({ id: imageTask.id }),
        }),
      );
    });

    it('dispatches manual requests, then images, then other media with FIFO within each tier', async () => {
      const video = await seedNews(testDb.db, channelId, { mediaType: 'video' });
      const photo = await seedNews(testDb.db, channelId, { mediaType: 'photo' });
      const imageDocument = await seedNews(testDb.db, channelId, { mediaType: 'document' });
      const manual = await seedNews(testDb.db, channelId, { mediaType: 'video' });
      const videoTask = await seedDownload(testDb.db, video.id, { createdAt: 1 });
      const photoTask = await seedDownload(testDb.db, photo.id, { createdAt: 2 });
      const imageTask = await seedDownload(testDb.db, imageDocument.id, { priority: 5, createdAt: 3 });
      const manualTask = await seedDownload(testDb.db, manual.id, { priority: 10, createdAt: 4 });
      const coordinator = new DownloadCoordinator(1);
      await coordinator.start();
      for (const task of [manualTask, photoTask, imageTask, videoTask]) {
        await vi.waitFor(() =>
          expect(createdWorkers[0].postMessage).toHaveBeenCalledWith({
            type: 'task',
            payload: expect.objectContaining({ id: task.id }),
          }),
        );
        createdWorkers[0].postMessage.mockClear();
        createdWorkers[0].emit('message', { type: 'done', taskId: task.id });
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    it('does not start downloads when less than 1 GiB is free', async () => {
      vi.mocked(statfs).mockResolvedValueOnce({ bavail: 100, bsize: 4096 } as Awaited<ReturnType<typeof statfs>>);
      await seedDownload(testDb.db, newsId, { status: 'pending', priority: 10 });
      const coordinator = new DownloadCoordinator(1);
      await coordinator.start();
      await new Promise((r) => setTimeout(r, 50));

      expect(createdWorkers[0].postMessage).not.toHaveBeenCalled();
      const rows = await testDb.client.execute('SELECT status FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows[0].status).toBe('pending');
      expect(coordinator.stopped).toBe(false);
    });

    it('dispatches a pending task to an available worker', async () => {
      await seedDownload(testDb.db, newsId, { status: 'pending', priority: 0 });

      const coordinator = new DownloadCoordinator(1);
      await coordinator.start();

      // Give dispatch a tick to run
      await new Promise((r) => setTimeout(r, 50));

      // Verify: task status should be 'processing' in DB
      const rows = await testDb.client.execute('SELECT status FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows[0].status).toBe('processing');
    });

    it('sends task payload to worker via postMessage', async () => {
      const dl = await seedDownload(testDb.db, newsId, { status: 'pending', priority: 5 });

      const coordinator = new DownloadCoordinator(1);
      await coordinator.start();
      await new Promise((r) => setTimeout(r, 50));

      expect(createdWorkers).toHaveLength(1);
      const worker = createdWorkers[0] as { postMessage: ReturnType<typeof vi.fn> };
      expect(worker.postMessage).toHaveBeenCalledWith({
        type: 'task',
        payload: expect.objectContaining({
          id: dl.id,
          newsId,
          type: 'media',
          priority: 5,
        }),
      });
    });

    it('emits task_update with processing status', async () => {
      await seedDownload(testDb.db, newsId, { status: 'pending', priority: 0 });

      const coordinator = new DownloadCoordinator(1);
      await coordinator.start();
      await new Promise((r) => setTimeout(r, 50));

      expect(emitTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'processing' }));
    });
  });

  // ── Worker message handling ──────────────────────────────────────────────

  describe('worker messages', () => {
    it.each(['done', 'error'])('releases the article slot after a deleted task reports %s', async (type) => {
      const task = await seedDownload(testDb.db, newsId, { type: 'article', url: 'https://example.com' });
      const coordinator = new DownloadCoordinator(1);
      await coordinator.start();
      await vi.waitFor(() => expect(createdWorkers[0].postMessage).toHaveBeenCalled());
      await testDb.client.execute('DELETE FROM news WHERE id = ?', [newsId]);
      const next = await seedNews(testDb.db, channelId);
      const nextTask = await seedDownload(testDb.db, next.id, { type: 'article', url: 'https://example.com/next' });
      createdWorkers[0].postMessage.mockClear();

      createdWorkers[0].emit('message', { type, taskId: task.id, message: 'cancelled' });

      await vi.waitFor(() =>
        expect(createdWorkers[0].postMessage).toHaveBeenCalledWith({
          type: 'task',
          payload: expect.objectContaining({ id: nextTask.id }),
        }),
      );
    });

    it('pauses the whole queue and retains a task on ENOSPC instead of failing it', async () => {
      const dl = await seedDownload(testDb.db, newsId);
      const coordinator = new DownloadCoordinator(1);
      await coordinator.start();
      await new Promise((r) => setTimeout(r, 50));

      const next = await seedNews(testDb.db, channelId);
      await seedDownload(testDb.db, next.id);
      createdWorkers[0].postMessage.mockClear();
      createdWorkers[0].emit('message', {
        type: 'error',
        taskId: dl.id,
        message: 'ENOSPC: no space left on device',
      });
      await new Promise((r) => setTimeout(r, 50));

      expect(createdWorkers[0].postMessage).not.toHaveBeenCalled();
      const rows = await testDb.client.execute('SELECT status FROM downloads WHERE id = ?', [dl.id]);
      expect(rows.rows[0].status).toBe('pending');
      expect(coordinator.stopped).toBe(false);
    });

    it('handles "done" message — marks task done and emits update', async () => {
      const dl = await seedDownload(testDb.db, newsId, { status: 'pending', priority: 0 });

      const coordinator = new DownloadCoordinator(1);
      await coordinator.start();
      await new Promise((r) => setTimeout(r, 50));

      const worker = createdWorkers[0];
      worker.emit('message', { type: 'done', taskId: dl.id });
      await new Promise((r) => setTimeout(r, 50));

      const rows = await testDb.client.execute('SELECT status FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows[0].status).toBe('done');
    });

    it('handles "error" message — marks task failed', async () => {
      const dl = await seedDownload(testDb.db, newsId, { status: 'pending', priority: 0 });

      const coordinator = new DownloadCoordinator(1);
      await coordinator.start();
      await new Promise((r) => setTimeout(r, 50));

      const worker = createdWorkers[0];
      worker.emit('message', { type: 'error', taskId: dl.id, message: 'test error' });
      await new Promise((r) => setTimeout(r, 50));

      const rows = await testDb.client.execute('SELECT status, error FROM downloads WHERE news_id = ?', [newsId]);
      expect(rows.rows[0].status).toBe('failed');
      expect(rows.rows[0].error).toBe('test error');
    });

    it('routes bridge messages to telegramBridge handler', async () => {
      const coordinator = new DownloadCoordinator(1);
      await coordinator.start();
      await new Promise((r) => setTimeout(r, 50));

      const worker = createdWorkers[0];
      const bridgeMsg = {
        type: 'tg:downloadMedia',
        reqId: 1,
        channelTelegramId: 'test',
        msgId: 100,
        ignoreLimit: false,
      };
      worker.emit('message', bridgeMsg);

      expect(handleBridgeMessage).toHaveBeenCalledWith(expect.anything(), bridgeMsg, expect.any(Number));
    });
  });

  // ── Circuit breaker ──────────────────────────────────────────────────────

  describe('pool circuit breaker', () => {
    it('stops the pool when crash threshold is exceeded', async () => {
      // With concurrency=2, ratio=0.5 → threshold = ceil(2 * 0.5) = 1
      const coordinator = new DownloadCoordinator(2);
      await coordinator.start();
      await new Promise((r) => setTimeout(r, 50));

      expect(coordinator.stopped).toBe(false);
      expect(createdWorkers).toHaveLength(2);

      // Simulate a worker crash
      createdWorkers[0].emit('error', new Error('crash 1'));
      await new Promise((r) => setTimeout(r, 20));

      expect(coordinator.stopped).toBe(true);
      expect(sendAlert).toHaveBeenCalledWith(expect.stringContaining('STOPPED'), 'worker-pool-fatal');
    });
  });
});
