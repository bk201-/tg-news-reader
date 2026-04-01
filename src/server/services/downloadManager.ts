/**
 * Download Manager — coordinator (main thread).
 *
 * Spawns N worker_threads. Each worker handles both task types (article + media).
 * The coordinator:
 *   - Polls DB for pending tasks and dispatches them to available workers
 *   - Routes Telegram IPC messages (tg:*) from workers to telegramBridge
 *   - Emits SSE events via downloadProgressEmitter
 *   - Pool-level circuit breaker: ≥ ⌈N × ratio⌉ crashes in window → fatal + exit
 */

import { Worker } from 'worker_threads';
import { db } from '../db/index.js';
import { downloads, news, channels } from '../db/schema.js';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { downloadProgressEmitter, emitTaskUpdate } from './downloadProgress.js';
import {
  DOWNLOAD_TASK_CLEANUP_DELAY_MS,
  WORKER_POOL_CRASH_THRESHOLD_RATIO,
  WORKER_POOL_CRASH_WINDOW_MS,
  WORKER_RESTART_BASE_MS,
  WORKER_RESTART_JITTER_MS,
} from '../config.js';
import type { DownloadType, DownloadTask } from '../../shared/types.js';
import { logger } from '../logger.js';
import { sendAlert } from './alertBot.js';
import { withRetry, DB_POLL_POLICY } from '../utils/retry.js';
import { handleBridgeMessage, isBridgeMessage } from './telegramBridge.js';

const WAKEUP_EVENT = 'wakeup';

// ─── Context query (for SSE payloads) ────────────────────────────────────────

async function getTaskWithContext(id: number): Promise<DownloadTask | null> {
  const [row] = await db
    .select({
      id: downloads.id,
      newsId: downloads.newsId,
      type: downloads.type,
      url: downloads.url,
      priority: downloads.priority,
      status: downloads.status,
      error: downloads.error,
      createdAt: downloads.createdAt,
      processedAt: downloads.processedAt,
      newsText: news.text,
      channelId: news.channelId,
      channelName: channels.name,
      localMediaPath: news.localMediaPath,
      localMediaPaths: news.localMediaPaths,
    })
    .from(downloads)
    .innerJoin(news, eq(downloads.newsId, news.id))
    .innerJoin(channels, eq(news.channelId, channels.id))
    .where(eq(downloads.id, id));

  if (!row) return null;
  return {
    ...row,
    type: row.type as DownloadTask['type'],
    status: row.status as DownloadTask['status'],
    url: row.url ?? null,
    error: row.error ?? null,
    newsText: row.newsText || undefined,
    channelId: row.channelId || undefined,
    channelName: row.channelName || undefined,
    localMediaPath: row.localMediaPath ?? null,
    localMediaPaths: row.localMediaPaths ?? null,
  };
}

// ─── Worker message types ─────────────────────────────────────────────────────

interface DoneMsg {
  type: 'done';
  taskId: number;
}
interface ErrorMsg {
  type: 'error';
  taskId: number;
  message: string;
}
type WorkerMsg = DoneMsg | ErrorMsg | { type: string };

// ─── Coordinator ──────────────────────────────────────────────────────────────

class DownloadCoordinator {
  private readonly workers = new Map<number, Worker>();
  private readonly available = new Set<number>();
  private readonly crashLog: number[] = [];
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly concurrency: number;

  constructor(concurrency: number) {
    this.concurrency = concurrency;
  }

  async start(): Promise<void> {
    await db.update(downloads).set({ status: 'pending' }).where(eq(downloads.status, 'processing'));
    for (let i = 0; i < this.concurrency; i++) this.spawnWorker(i);
    downloadProgressEmitter.on(WAKEUP_EVENT, () => void this.tryDispatch());
    logger.info(
      { module: 'download', concurrency: this.concurrency },
      `worker pool started (${this.concurrency} workers)`,
    );
  }

  private spawnWorker(id: number): void {
    const isDev = process.env.NODE_ENV !== 'production';
    // Dev:  use a plain .mjs shim that calls register('tsx/esm') then
    //       dynamically imports downloadWorker.ts — the only reliable way
    //       to activate tsx hooks in worker_threads with Node.js 22.12+.
    // Prod: use the compiled .js directly, no loader needed.
    const workerUrl = new URL(
      isDev ? '../workers/downloadWorkerShim.mjs' : '../workers/downloadWorker.js',
      import.meta.url,
    );

    const worker = new Worker(workerUrl, {
      workerData: { workerId: id },
      execArgv: [], // tsx registration is handled inside the shim, not via execArgv
    });

    worker.on('message', (msg: WorkerMsg) => this.handleWorkerMessage(worker, id, msg));
    worker.on('error', (err) => this.handleWorkerCrash(id, err));
    worker.on('exit', (code) => {
      if (code !== 0) this.handleWorkerCrash(id, new Error(`Worker ${id} exited with code ${code}`));
    });

    this.workers.set(id, worker);
    this.available.add(id);
    void this.tryDispatch();
  }

  private handleWorkerCrash(id: number, err: unknown): void {
    this.available.delete(id);
    this.workers.delete(id);

    // Sliding-window pool circuit breaker
    const now = Date.now();
    const windowStart = now - WORKER_POOL_CRASH_WINDOW_MS;
    while (this.crashLog.length > 0 && this.crashLog[0] < windowStart) this.crashLog.shift();
    this.crashLog.push(now);

    const threshold = Math.ceil(this.concurrency * WORKER_POOL_CRASH_THRESHOLD_RATIO);
    if (this.crashLog.length >= threshold) {
      logger.fatal(
        { module: 'download', crashCount: this.crashLog.length, windowMs: WORKER_POOL_CRASH_WINDOW_MS, threshold },
        'worker pool circuit breaker — too many crashes, shutting down',
      );
      void sendAlert(
        `Download worker pool FATAL: ${this.crashLog.length} crashes in ${WORKER_POOL_CRASH_WINDOW_MS / 1000}s (threshold ${threshold}/${this.concurrency})`,
        'worker-pool-fatal',
      );
      process.exit(1);
    }

    const delay = WORKER_RESTART_BASE_MS + Math.floor(Math.random() * WORKER_RESTART_JITTER_MS);
    logger.error({ module: 'download', workerId: id, err }, `worker crashed — restarting in ${delay}ms`);
    void sendAlert(`Download worker ${id} crashed: ${err instanceof Error ? err.message : 'unknown'}`, 'worker-crash');
    setTimeout(() => this.spawnWorker(id), delay);
  }

  private handleWorkerMessage(worker: Worker, workerId: number, msg: WorkerMsg): void {
    if (isBridgeMessage(msg)) {
      handleBridgeMessage(worker, msg, workerId);
      return;
    }
    if (msg.type === 'done') void this.onTaskDone(workerId, (msg as DoneMsg).taskId);
    else if (msg.type === 'error') void this.onTaskError(workerId, (msg as ErrorMsg).taskId, (msg as ErrorMsg).message);
  }

  private async onTaskDone(workerId: number, taskId: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await db.update(downloads).set({ status: 'done', processedAt: now }).where(eq(downloads.id, taskId));
    const doneTask = await getTaskWithContext(taskId);
    if (doneTask) {
      emitTaskUpdate({ ...doneTask, status: 'done' });
      setTimeout(() => {
        void db.delete(downloads).where(eq(downloads.id, taskId));
      }, DOWNLOAD_TASK_CLEANUP_DELAY_MS);
    }
    this.available.add(workerId);
    void this.tryDispatch();
  }

  private async onTaskError(workerId: number, taskId: number, errorMsg: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await db
      .update(downloads)
      .set({ status: 'failed', error: errorMsg, processedAt: now })
      .where(eq(downloads.id, taskId));
    const failedTask = await getTaskWithContext(taskId);
    if (failedTask) emitTaskUpdate({ ...failedTask, status: 'failed', error: errorMsg });
    logger.error({ module: 'download', taskId, err: errorMsg }, 'task permanently failed');
    this.available.add(workerId);
    void this.tryDispatch();
  }

  private async tryDispatch(): Promise<void> {
    if (this.available.size === 0) return;

    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    const workerIdEntry = this.available.values().next();
    if (workerIdEntry.done) return;
    const workerId = workerIdEntry.value;
    this.available.delete(workerId);

    let task: typeof downloads.$inferSelect | undefined;
    try {
      [task] = await withRetry(
        () =>
          db
            .select()
            .from(downloads)
            .where(eq(downloads.status, 'pending'))
            .orderBy(desc(downloads.priority), asc(downloads.createdAt))
            .limit(1),
        DB_POLL_POLICY,
        'poll',
      );
    } catch (err) {
      logger.error({ module: 'download', err }, 'db poll failed permanently — will retry in 1s');
      this.available.add(workerId);
      this.schedulePoll();
      return;
    }

    if (!task) {
      this.available.add(workerId);
      this.schedulePoll();
      return;
    }

    const worker = this.workers.get(workerId);
    if (!worker) {
      this.available.delete(workerId);
      void this.tryDispatch();
      return;
    }

    const [claimed] = await db
      .update(downloads)
      .set({ status: 'processing' })
      .where(and(eq(downloads.id, task.id), eq(downloads.status, 'pending')))
      .returning();

    if (!claimed) {
      this.available.add(workerId);
      void this.tryDispatch();
      return;
    }

    const taskCtx = await getTaskWithContext(task.id);
    if (taskCtx) emitTaskUpdate({ ...taskCtx, status: 'processing' });

    worker.postMessage({
      type: 'task',
      payload: { id: task.id, newsId: task.newsId, type: task.type, url: task.url, priority: task.priority },
    });

    if (this.available.size > 0) void this.tryDispatch();
  }

  private schedulePoll(): void {
    if (this.pollTimer !== null) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.tryDispatch();
    }, 1_000);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function enqueueTask(newsId: number, type: DownloadType, url?: string, priority = 0): Promise<void> {
  await db
    .insert(downloads)
    .values({ newsId, type, url: url ?? null, priority, status: 'pending' })
    .onConflictDoUpdate({
      target: [downloads.newsId, downloads.type],
      set: {
        priority: sql`MAX(downloads.priority, excluded.priority)`,
        // Reset failed tasks to pending always.
        // Reset done tasks to pending only for user-initiated retries (priority ≥ 10) —
        // this handles the case where a background task was skipped due to size limit
        // (done but localMediaPath is null) and the user explicitly requests a download.
        // Background re-enqueues (priority=0) leave done tasks untouched.
        status: sql`CASE
          WHEN downloads.status = 'failed' THEN 'pending'
          WHEN downloads.status = 'done' AND excluded.priority >= 10 THEN 'pending'
          ELSE downloads.status
        END`,
        error: sql`CASE WHEN downloads.status = 'failed' THEN NULL ELSE downloads.error END`,
        url: sql`COALESCE(excluded.url, downloads.url)`,
      },
    });
  downloadProgressEmitter.emit(WAKEUP_EVENT);
}

export async function prioritizeTask(taskId: number): Promise<void> {
  await db
    .update(downloads)
    .set({
      priority: 10,
      status: sql`CASE WHEN status = 'failed' THEN 'pending' ELSE status END`,
      error: sql`CASE WHEN status = 'failed' THEN NULL ELSE error END`,
    })
    .where(eq(downloads.id, taskId));
  downloadProgressEmitter.emit(WAKEUP_EVENT);
}

export async function getActiveTasks(): Promise<DownloadTask[]> {
  const rows = await db
    .select({
      id: downloads.id,
      newsId: downloads.newsId,
      type: downloads.type,
      url: downloads.url,
      priority: downloads.priority,
      status: downloads.status,
      error: downloads.error,
      createdAt: downloads.createdAt,
      processedAt: downloads.processedAt,
      newsText: news.text,
      channelId: news.channelId,
      channelName: channels.name,
    })
    .from(downloads)
    .innerJoin(news, eq(downloads.newsId, news.id))
    .innerJoin(channels, eq(news.channelId, channels.id))
    .where(sql`${downloads.status} != 'done'`)
    .orderBy(desc(downloads.priority), asc(downloads.createdAt));

  return rows.map((r) => ({
    ...r,
    type: r.type as DownloadTask['type'],
    status: r.status as DownloadTask['status'],
    url: r.url ?? null,
    error: r.error ?? null,
    newsText: r.newsText || undefined,
    channelId: r.channelId || undefined,
    channelName: r.channelName || undefined,
  }));
}

export function startWorkerPool(concurrency: number): void {
  const c = new DownloadCoordinator(concurrency);
  void c.start();
}
