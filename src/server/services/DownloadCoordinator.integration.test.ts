import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({
  DOWNLOAD_TASK_CLEANUP_DELAY_MS: 100,
  WORKER_POOL_CRASH_THRESHOLD_RATIO: 0.5,
  WORKER_POOL_CRASH_WINDOW_MS: 60_000,
  WORKER_RESTART_BASE_MS: 10,
  WORKER_RESTART_JITTER_MS: 0,
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

// oxlint-disable-next-line typescript/no-explicit-any
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

// ─── DB mock ────────────────────────────────────────────────────────────────

import { createTestDb, type TestDb } from '../__tests__/testDb.js';
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

vi.mock('./downloadProgress.js', () => ({
  downloadProgressEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  emitTaskUpdate: vi.fn(),
}));

import { DownloadCoordinator } from './DownloadCoordinator.js';
import { downloadProgressEmitter, emitTaskUpdate } from './downloadProgress.js';
import { sendAlert } from './alertBot.js';
import { handleBridgeMessage } from './telegramBridge.js';

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

    const ch = await seedChannel(testDb.db);
    channelId = ch.id;
    const n = await seedNews(testDb.db, channelId);
    newsId = n.id;
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
