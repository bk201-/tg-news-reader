/**
 * Download Manager — public API + worker pool lifecycle.
 *
 * The coordinator (worker thread management, dispatch, circuit breaker)
 * lives in `DownloadCoordinator.ts`.
 */

import { db } from '../db/index.js';
import { downloads, news, channels } from '../db/schema.js';
import { eq, desc, asc, sql } from 'drizzle-orm';
import { downloadProgressEmitter } from './downloadProgress.js';
import type { DownloadType, DownloadTask } from '../../shared/types.js';
import { DownloadCoordinator } from './DownloadCoordinator.js';

const WAKEUP_EVENT = 'wakeup';

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

let _coordinator: DownloadCoordinator | null = null;

export function startWorkerPool(concurrency: number): void {
  _coordinator = new DownloadCoordinator(concurrency);
  void _coordinator.start();
}

/** Returns true if the worker pool was stopped by the pool-level circuit breaker. */
export function isWorkerPoolStopped(): boolean {
  return _coordinator?.stopped ?? false;
}
