/**
 * Download Worker — runs in a worker_threads context.
 *
 * Handles both task types:
 *   - 'article': fetches HTML (with retry), parses with jsdom + Readability (CPU-bound),
 *                writes fullContent to DB via its own libsql connection.
 *   - 'media':   requests gramjs operations from the main thread via IPC bridge,
 *                writes localMediaPath(s) to DB via its own libsql connection.
 *
 * Each worker thread owns:
 *   - Its own libsql client (created when the module is first imported)
 *   - Its own jsdom + Readability instances (lazy-loaded on first article task)
 */

import { parentPort, workerData, isMainThread } from 'worker_threads';

if (isMainThread) {
  throw new Error('downloadWorker.ts must be run as a worker_threads Worker, not directly.');
}

import { db } from '../db/index.js';
import { news, channels } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { withRetry, TASK_POLICY, HTTP_FETCH_POLICY } from '../utils/retry.js';
import { parseHtml, buildFullContent } from '../services/readability.js';
import { logger } from '../logger.js';
import type { TgDownloadMediaMsg, MainToWorkerBridgeMsg } from '../services/telegramBridge.js';

// ─── Worker identity ──────────────────────────────────────────────────────────

const { workerId } = workerData as { workerId: number };

// ─── IPC slot for Telegram bridge round-trips ─────────────────────────────────
// The worker processes one task at a time, so at most one IPC call is pending.

type IpcSlot = {
  reqId: number;
  resolve: (result: { path: string | null; reason?: 'no_media' | 'size_limit' }) => void;
  reject: (err: Error) => void;
} | null;

let pendingIpc: IpcSlot = null;
let reqCounter = 0;

function ipcDownloadMedia(
  channelTelegramId: string,
  msgId: number,
  ignoreLimit: boolean,
): Promise<{ path: string | null; reason?: 'no_media' | 'size_limit' }> {
  return new Promise((resolve, reject) => {
    const reqId = ++reqCounter;
    pendingIpc = { reqId, resolve, reject };
    const msg: TgDownloadMediaMsg = { type: 'tg:downloadMedia', reqId, channelTelegramId, msgId, ignoreLimit };
    parentPort!.postMessage(msg);
  });
}

// ─── Message types ────────────────────────────────────────────────────────────

interface TaskPayload {
  id: number;
  newsId: number;
  type: 'media' | 'article';
  url: string | null;
  priority: number;
}

interface TaskMsg {
  type: 'task';
  payload: TaskPayload;
}

interface DoneMsg {
  type: 'done';
  taskId: number;
}

interface ErrorMsg {
  type: 'error';
  taskId: number;
  message: string;
}

type IncomingMsg = TaskMsg | MainToWorkerBridgeMsg;

// ─── Message router ───────────────────────────────────────────────────────────

parentPort!.on('message', (msg: IncomingMsg) => {
  // Bridge replies: resolve/reject the pending IPC slot
  if (msg.type === 'tg:result') {
    if (pendingIpc?.reqId === msg.reqId) {
      pendingIpc.resolve({ path: msg.result, reason: msg.reason });
      pendingIpc = null;
    }
    return;
  }
  if (msg.type === 'tg:error') {
    if (pendingIpc?.reqId === msg.reqId) {
      pendingIpc.reject(new Error(msg.message));
      pendingIpc = null;
    }
    return;
  }

  // Task from coordinator
  if (msg.type === 'task') {
    void handleTask(msg.payload);
  }
});

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

  // Already downloaded — skip (idempotent)
  if (row.albumMsgIds ? row.localMediaPaths !== null : row.localMediaPath !== null) return;

  const ignoreLimit = priority >= 10;

  if (row.albumMsgIds) {
    // ── Album: download each member via IPC ───────────────────────────────────
    const albumIds = JSON.parse(row.albumMsgIds) as number[];
    const paths: string[] = [];

    for (const msgId of albumIds) {
      const { path, reason } = await ipcDownloadMedia(row.channelTelegramId, msgId, ignoreLimit);
      if (reason === 'no_media') continue; // slot in album has no media — skip silently
      if (reason === 'size_limit') continue; // too large for background — skip, don't fail album
      if (path) paths.push(path);
    }

    if (paths.length === 0) {
      // All slots were either no_media or size_limit — treat as done (nothing to store)
      return;
    }

    await db
      .update(news)
      .set({ localMediaPath: paths[0], localMediaPaths: JSON.stringify(paths) })
      .where(eq(news.id, newsId));
  } else {
    // ── Single media ──────────────────────────────────────────────────────────
    const { path, reason } = await ipcDownloadMedia(row.channelTelegramId, row.telegramMsgId, ignoreLimit);

    if (reason === 'no_media') return; // message has no media — nothing to do, mark done
    if (reason === 'size_limit') {
      // Background download (priority < 10): file too large to auto-download — skip silently.
      // User-initiated downloads always have ignoreLimit=true so they never reach this branch.
      logger.debug({ module: 'download', workerId, newsId }, 'media skipped: exceeds background size limit');
      return;
    }

    if (!path) throw new Error('Download returned no path'); // unexpected — will retry
    await db.update(news).set({ localMediaPath: path }).where(eq(news.id, newsId));
  }
}

async function processArticleTask(newsId: number, url: string): Promise<void> {
  // Fetch HTML with retry — throws on HTTP 5xx or network errors, triggers TASK_POLICY retry
  const response = await withRetry(
    async () => {
      const r = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) throw new Error(`HTTP error ${r.status} for URL: ${url}`);
      return r;
    },
    HTTP_FETCH_POLICY,
    `article-fetch:${newsId}`,
  );

  const html = await response.text();

  // CPU-bound: runs in this worker thread — does NOT block the main event loop
  const extracted = await parseHtml(html, url);
  const content = buildFullContent(extracted);

  if (content) {
    await db.update(news).set({ fullContent: content }).where(eq(news.id, newsId));
  }
}

// ─── Main task handler ────────────────────────────────────────────────────────

async function handleTask(task: TaskPayload): Promise<void> {
  try {
    await withRetry(
      async () => {
        if (task.type === 'media') {
          await processMediaTask(task.newsId, task.priority);
        } else {
          if (!task.url) throw new Error('Article task missing URL');
          await processArticleTask(task.newsId, task.url);
        }
      },
      TASK_POLICY,
      `task:${task.id}`,
    );

    logger.info({ module: 'download', workerId, taskId: task.id, type: task.type }, 'task done');
    const reply: DoneMsg = { type: 'done', taskId: task.id };
    parentPort!.postMessage(reply);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ module: 'download', workerId, taskId: task.id, type: task.type, err }, 'task failed');
    const reply: ErrorMsg = { type: 'error', taskId: task.id, message };
    parentPort!.postMessage(reply);
  }
}
