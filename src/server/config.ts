export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
export const JWT_ACCESS_EXPIRES_SEC = 15 * 60; // 15 min
export const REFRESH_EXPIRES_DAYS = 7;

// ─── Download Manager ─────────────────────────────────────────────────────────
/** Number of concurrent download workers. Env: DOWNLOAD_WORKER_CONCURRENCY */
export const DOWNLOAD_WORKER_CONCURRENCY = parseInt(process.env.DOWNLOAD_WORKER_CONCURRENCY ?? '10', 10);
/** How long (ms) to keep a completed task before auto-deleting it. Env: DOWNLOAD_TASK_CLEANUP_DELAY_SEC */
export const DOWNLOAD_TASK_CLEANUP_DELAY_MS = parseInt(process.env.DOWNLOAD_TASK_CLEANUP_DELAY_SEC ?? '30', 10) * 1_000;

// ─── Worker pool circuit breaker ──────────────────────────────────────────────
/**
 * Fraction of workers that must crash within the window to trigger a fatal exit.
 * Set to 1.0 to disable (only individual restarts).
 * Env: WORKER_POOL_CRASH_THRESHOLD_RATIO
 */
export const WORKER_POOL_CRASH_THRESHOLD_RATIO = parseFloat(process.env.WORKER_POOL_CRASH_THRESHOLD_RATIO ?? '0.8');
/** Sliding window size in ms for crash counting. Env: WORKER_POOL_CRASH_WINDOW_SEC */
export const WORKER_POOL_CRASH_WINDOW_MS = parseInt(process.env.WORKER_POOL_CRASH_WINDOW_SEC ?? '60', 10) * 1_000;
/** Base restart delay for a crashed individual worker (ms). */
export const WORKER_RESTART_BASE_MS = 5_000;
/** Max random jitter added to worker restart delay (ms). */
export const WORKER_RESTART_JITTER_MS = 3_000;

// ─── Media size limits ────────────────────────────────────────────────────────
// Configure in MB via env; stored as bytes internally. Applied only to background (priority < 10) downloads.
/** Env: MAX_PHOTO_SIZE_MB (default 5) */
export const MAX_PHOTO_SIZE_BYTES = parseInt(process.env.MAX_PHOTO_SIZE_MB ?? '5', 10) * 1024 * 1024;
/** Env: MAX_VIDEO_SIZE_MB (default 75) */
export const MAX_VIDEO_SIZE_BYTES = parseInt(process.env.MAX_VIDEO_SIZE_MB ?? '75', 10) * 1024 * 1024;
/** Env: MAX_IMG_DOC_SIZE_MB (default 5) */
export const MAX_IMG_DOC_SIZE_BYTES = parseInt(process.env.MAX_IMG_DOC_SIZE_MB ?? '5', 10) * 1024 * 1024;

// ─── Telegram connection ──────────────────────────────────────────────────────
/** Seconds to delay the first Telegram connection after server start.
 *  Gives the old container time to disconnect on SIGTERM during deploys.
 *  Env: TG_CONNECT_DELAY_SEC (default 0 in dev, 15 in prod) */
export const TG_CONNECT_DELAY_MS =
  parseInt(process.env.TG_CONNECT_DELAY_SEC ?? (process.env.NODE_ENV === 'production' ? '30' : '0'), 10) * 1_000;

// ─── News fetching ────────────────────────────────────────────────────────────
/** Days to look back for a brand-new channel's first fetch. Env: NEWS_DEFAULT_FETCH_DAYS */
export const NEWS_DEFAULT_FETCH_DAYS = parseInt(process.env.NEWS_DEFAULT_FETCH_DAYS ?? '3', 10);
/** Max messages fetched per channel sync. Env: NEWS_FETCH_LIMIT */
export const NEWS_FETCH_LIMIT = parseInt(process.env.NEWS_FETCH_LIMIT ?? '1000', 10);

// ─── Azure OpenAI / OpenAI ───────────────────────────────────────────────────
/** Azure OpenAI endpoint URL. When set, Azure provider is used; otherwise falls back to OPENAI_API_KEY. */
export const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT ?? '';
/** Azure OpenAI API key. */
export const AZURE_OPENAI_KEY = process.env.AZURE_OPENAI_KEY ?? '';
/** Azure OpenAI deployment name (e.g. "gpt-4o-mini"). */
export const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini';
/** Direct OpenAI API key (fallback when Azure vars are absent). */
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
/** Max news items to include in a single digest request. */
export const DIGEST_MAX_ITEMS = parseInt(process.env.DIGEST_MAX_ITEMS ?? '200', 10);
/** Max chars per item when fullContent is available. Env: DIGEST_ARTICLE_CONTENT_LIMIT */
export const DIGEST_ARTICLE_CONTENT_LIMIT = parseInt(process.env.DIGEST_ARTICLE_CONTENT_LIMIT ?? '1500', 10);
/** Max ms to wait for article prefetch before proceeding. Env: DIGEST_ARTICLE_PREFETCH_TIMEOUT_SEC */
export const DIGEST_ARTICLE_PREFETCH_TIMEOUT_MS =
  parseInt(process.env.DIGEST_ARTICLE_PREFETCH_TIMEOUT_SEC ?? '30', 10) * 1_000;
/**
 * Max number of articles to prefetch for a single digest request.
 * Caps the number of download tasks enqueued to avoid saturating the download worker pool.
 * Env: DIGEST_MAX_PREFETCH (default 20)
 */
export const DIGEST_MAX_PREFETCH = parseInt(process.env.DIGEST_MAX_PREFETCH ?? '20', 10);

// ─── Article download limits ──────────────────────────────────────────────────
/**
 * Max number of workers that may process article (jsdom) tasks concurrently.
 * jsdom loaded in a worker costs ~100 MB; limiting concurrency prevents OOM bursts.
 * Env: ARTICLE_WORKER_CONCURRENCY (default 3)
 */
export const ARTICLE_WORKER_CONCURRENCY = parseInt(process.env.ARTICLE_WORKER_CONCURRENCY ?? '3', 10);
/**
 * Max HTML response size in bytes for article extraction.
 * Pages larger than this are skipped as a permanent failure (no retry).
 * Env: ARTICLE_MAX_HTML_MB (default 3)
 */
export const ARTICLE_MAX_HTML_BYTES = parseInt(process.env.ARTICLE_MAX_HTML_MB ?? '3', 10) * 1024 * 1024;

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-secret-change-in-production') {
  throw new Error('JWT_SECRET env variable must be set in production!');
}
