import { db } from '../db/index.js';
import { downloads, news, channels } from '../db/schema.js';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { fetchMessageById, downloadMessageMedia } from './telegram.js';
import { extractContentFromUrl, buildFullContent } from './readability.js';
import { downloadProgressEmitter, emitTaskUpdate } from './downloadProgress.js';
import { DOWNLOAD_TASK_CLEANUP_DELAY_MS, DOWNLOAD_MAX_RETRIES } from '../config.js';
import type { DownloadType, DownloadTask } from '../../shared/types.js';
import { logger } from '../logger.js';
import { sendAlert } from './alertBot.js';
import { isFileReferenceExpiredError } from './telegramCircuitBreaker.js';

const WAKEUP_EVENT = 'wakeup';

// ─── Transient error detection ────────────────────────────────────────────────

/** Returns true for errors that are safe to retry (network/timeout/flood/stale refs). */
function isTransientDownloadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  const code = (err as NodeJS.ErrnoException).code ?? '';
  return (
    err.constructor.name === 'FloodWaitError' ||
    msg.includes('timeout') ||
    msg.includes('flood') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('network') ||
    msg.includes('connection') ||
    msg.includes('socket') ||
    msg.includes('circuit breaker') ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    isFileReferenceExpiredError(err) // stale Telegram file refs — re-fetch on next attempt
  );
}

// ─── Context query ────────────────────────────────────────────────────────────

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

// ─── Task handlers ────────────────────────────────────────────────────────────

async function processMediaTask(newsId: number, priority: number): Promise<void> {
  const [row] = await db
    .select({
      telegramMsgId: news.telegramMsgId,
      localMediaPath: news.localMediaPath,
      localMediaPaths: news.localMediaPaths,
      albumMsgIds: news.albumMsgIds,
      channelTelegramId: channels.telegramId,
    })
    .from(news)
    .innerJoin(channels, eq(news.channelId, channels.id))
    .where(eq(news.id, newsId));
  if (!row) throw new Error(`News ${newsId} not found`);

  // Already downloaded — skip
  if (row.albumMsgIds ? row.localMediaPaths !== null : row.localMediaPath !== null) return;

  const ignoreLimit = priority >= 10;

  if (row.albumMsgIds) {
    // ── Album: download each member message sequentially ──────────────────────
    const albumIds = JSON.parse(row.albumMsgIds) as number[];
    const paths: string[] = [];

    for (const msgId of albumIds) {
      const msg = await fetchMessageById(row.channelTelegramId, msgId);
      if (!msg?.rawMedia) continue;
      const localPath = await downloadMessageMedia(msg, row.channelTelegramId, { ignoreLimit });
      if (localPath) paths.push(localPath);
    }

    if (paths.length === 0) throw new Error('No media files downloaded for album');

    await db
      .update(news)
      .set({ localMediaPath: paths[0], localMediaPaths: JSON.stringify(paths) })
      .where(eq(news.id, newsId));
  } else {
    // ── Single media ──────────────────────────────────────────────────────────
    const msg = await fetchMessageById(row.channelTelegramId, row.telegramMsgId);
    if (!msg?.rawMedia) throw new Error('No media in message');

    const localPath = await downloadMessageMedia(msg, row.channelTelegramId, { ignoreLimit });
    if (!localPath) throw new Error('Media exceeds size limit or download failed');

    await db.update(news).set({ localMediaPath: localPath }).where(eq(news.id, newsId));
  }
}

async function processArticleTask(newsId: number, url: string): Promise<void> {
  const extracted = await extractContentFromUrl(url);
  const content = buildFullContent(extracted);
  if (content) {
    await db.update(news).set({ fullContent: content }).where(eq(news.id, newsId));
  }
}

// ─── Worker loop ──────────────────────────────────────────────────────────────

async function runWorker(): Promise<never> {
  while (true) {
    const [task] = await db
      .select()
      .from(downloads)
      .where(eq(downloads.status, 'pending'))
      .orderBy(desc(downloads.priority), asc(downloads.createdAt))
      .limit(1);

    if (!task) {
      // Sleep until wakeup signal or 1s polling timeout.
      // Important: always remove the 'once' listener when the timeout fires,
      // otherwise it accumulates (10 workers × N sleep cycles → memory leak).
      await new Promise<void>((resolve) => {
        const onWakeup = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          downloadProgressEmitter.off(WAKEUP_EVENT, onWakeup);
          resolve();
        }, 1000);
        downloadProgressEmitter.once(WAKEUP_EVENT, onWakeup);
      });
      continue;
    }

    // Atomically claim the task — prevents two workers from grabbing the same row
    const [claimed] = await db
      .update(downloads)
      .set({ status: 'processing' })
      .where(and(eq(downloads.id, task.id), eq(downloads.status, 'pending')))
      .returning();
    if (!claimed) continue; // Another worker was faster

    const taskCtx = await getTaskWithContext(task.id);
    if (taskCtx) emitTaskUpdate({ ...taskCtx, status: 'processing' });

    // ── Inner retry loop for transient errors ────────────────────────────────
    let lastErr: unknown;
    let succeeded = false;

    for (let attempt = 0; attempt < DOWNLOAD_MAX_RETRIES; attempt++) {
      try {
        if (task.type === 'media') {
          await processMediaTask(task.newsId, task.priority);
        } else {
          if (!task.url) throw new Error('Article task missing URL');
          await processArticleTask(task.newsId, task.url);
        }
        succeeded = true;
        break;
      } catch (err) {
        lastErr = err;
        const isLast = attempt === DOWNLOAD_MAX_RETRIES - 1;
        if (isLast || !isTransientDownloadError(err)) break; // permanent or exhausted
        // Exponential backoff: 30s, 60s, 120s — capped at 5 min
        const delay = Math.min(30_000 * Math.pow(2, attempt), 5 * 60_000);
        logger.warn(
          { module: 'download', taskId: task.id, type: task.type, attempt: attempt + 1, delayMs: delay },
          `transient error — retrying in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    if (succeeded) {
      const now = Math.floor(Date.now() / 1000);
      await db.update(downloads).set({ status: 'done', processedAt: now }).where(eq(downloads.id, task.id));

      const doneTask = await getTaskWithContext(task.id);
      if (doneTask) {
        emitTaskUpdate({ ...doneTask, status: 'done' });
        // Auto-delete after configured delay — client has had time to react
        setTimeout(() => {
          void db.delete(downloads).where(eq(downloads.id, task.id));
        }, DOWNLOAD_TASK_CLEANUP_DELAY_MS);
      }
    } else {
      const errorMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
      const now = Math.floor(Date.now() / 1000);
      await db
        .update(downloads)
        .set({ status: 'failed', error: errorMsg, processedAt: now })
        .where(eq(downloads.id, task.id));

      const failedTask = await getTaskWithContext(task.id);
      if (failedTask) emitTaskUpdate({ ...failedTask, status: 'failed', error: errorMsg });

      logger.error(
        { module: 'download', taskId: task.id, type: task.type, newsId: task.newsId, err: lastErr },
        `task failed after ${DOWNLOAD_MAX_RETRIES} attempts`,
      );
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Add a task to the queue.
 * - priority=0: background (auto-queued on channel fetch)
 * - priority=10: user-initiated (clicked Download button)
 *
 * On UNIQUE conflict (same newsId+type already in queue):
 * - Keeps the higher priority
 * - Resets failed tasks back to pending
 */
export async function enqueueTask(newsId: number, type: DownloadType, url?: string, priority = 0): Promise<void> {
  await db
    .insert(downloads)
    .values({ newsId, type, url: url ?? null, priority, status: 'pending' })
    .onConflictDoUpdate({
      target: [downloads.newsId, downloads.type],
      set: {
        priority: sql`MAX(downloads.priority, excluded.priority)`,
        status: sql`CASE WHEN downloads.status = 'failed' THEN 'pending' ELSE downloads.status END`,
        error: sql`CASE WHEN downloads.status = 'failed' THEN NULL ELSE downloads.error END`,
        url: sql`COALESCE(excluded.url, downloads.url)`,
      },
    });
  downloadProgressEmitter.emit(WAKEUP_EVENT);
}

/**
 * Boost task priority to 10 and reset failed → pending.
 * Used when user clicks "Download" on a task that's already in queue.
 */
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

/** Returns all non-done tasks with channel/news context for the API and SSE stream. */
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

/**
 * Start N concurrent worker loops. Call once at server startup.
 * Resets any tasks stuck in 'processing' from a previous crash.
 * Each worker is self-healing: if it crashes, it restarts after 5s.
 */
export function startWorkerPool(concurrency = 10): void {
  // Reset crash-stuck tasks
  void db.update(downloads).set({ status: 'pending' }).where(eq(downloads.status, 'processing'));

  for (let i = 0; i < concurrency; i++) {
    spawnWorker(i);
  }
  logger.info({ module: 'download', concurrency }, `worker pool started (${concurrency} workers)`);
}

/** Starts a single worker; automatically restarts it after 5s if it crashes. */
function spawnWorker(id: number): void {
  void runWorker().catch((err: unknown) => {
    logger.error({ module: 'download', workerId: id, err }, 'worker crashed — restarting in 5s');
    void sendAlert(`Download worker ${id} crashed: ${(err as Error).message ?? 'unknown'}`, 'worker-crash');
    setTimeout(() => spawnWorker(id), 5_000);
  });
}
