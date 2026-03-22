export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
export const JWT_ACCESS_EXPIRES_SEC = 15 * 60; // 15 min
export const REFRESH_EXPIRES_DAYS = 7;

// ─── Download Manager ─────────────────────────────────────────────────────────
/** Number of concurrent download workers. Env: DOWNLOAD_WORKER_CONCURRENCY */
export const DOWNLOAD_WORKER_CONCURRENCY = parseInt(process.env.DOWNLOAD_WORKER_CONCURRENCY ?? '10', 10);
/** How long (ms) to keep a completed task before auto-deleting it. Env: DOWNLOAD_TASK_CLEANUP_DELAY_SEC */
export const DOWNLOAD_TASK_CLEANUP_DELAY_MS = parseInt(process.env.DOWNLOAD_TASK_CLEANUP_DELAY_SEC ?? '30', 10) * 1_000;
/** Max in-memory retry attempts for transient download errors. Env: DOWNLOAD_MAX_RETRIES */
export const DOWNLOAD_MAX_RETRIES = parseInt(process.env.DOWNLOAD_MAX_RETRIES ?? '3', 10);

// ─── Media size limits ────────────────────────────────────────────────────────
// Configure in MB via env; stored as bytes internally. Applied only to background (priority < 10) downloads.
/** Env: MAX_PHOTO_SIZE_MB (default 5) */
export const MAX_PHOTO_SIZE_BYTES = parseInt(process.env.MAX_PHOTO_SIZE_MB ?? '5', 10) * 1024 * 1024;
/** Env: MAX_VIDEO_SIZE_MB (default 75) */
export const MAX_VIDEO_SIZE_BYTES = parseInt(process.env.MAX_VIDEO_SIZE_MB ?? '75', 10) * 1024 * 1024;
/** Env: MAX_IMG_DOC_SIZE_MB (default 5) */
export const MAX_IMG_DOC_SIZE_BYTES = parseInt(process.env.MAX_IMG_DOC_SIZE_MB ?? '5', 10) * 1024 * 1024;

// ─── News fetching ────────────────────────────────────────────────────────────
/** Days to look back for a brand-new channel's first fetch. Env: NEWS_DEFAULT_FETCH_DAYS */
export const NEWS_DEFAULT_FETCH_DAYS = parseInt(process.env.NEWS_DEFAULT_FETCH_DAYS ?? '3', 10);
/** Max messages fetched per channel sync. Env: NEWS_FETCH_LIMIT */
export const NEWS_FETCH_LIMIT = parseInt(process.env.NEWS_FETCH_LIMIT ?? '1000', 10);

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-secret-change-in-production') {
  throw new Error('JWT_SECRET env variable must be set in production!');
}
