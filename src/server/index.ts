import 'dotenv/config';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import channelsRouter from './routes/channels.js';
import newsRouter from './routes/news.js';
import filtersRouter from './routes/filters.js';
import contentRouter from './routes/content.js';
import mediaRouter from './routes/media.js';
import groupsRouter from './routes/groups.js';
import authRouter from './routes/auth.js';
import downloadsRouter from './routes/downloads.js';
import clientLogRouter from './routes/clientLog.js';
import digestRouter from './routes/digest.js';
import { authMiddleware } from './middleware/auth.js';
import { corsMiddleware } from './middleware/cors.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { startWorkerPool } from './services/downloadManager.js';
import { DOWNLOAD_WORKER_CONCURRENCY } from './config.js';
import { logger } from './logger.js';
import { getTelegramCircuitState, getTelegramSessionExpired } from './services/telegramCircuitBreaker.js';
import { sendAlert } from './services/alertBot.js';
import { client } from './db/index.js';
import { runMigration } from './db/migrate.js';

// All imports loaded — log how long module initialisation took
// (gramjs TL schema + crypto is the dominant cost, typically 5–8 s)
const tModules = performance.now();
logger.info({ module: 'server', ms: Math.round(tModules) }, `Modules loaded in ${Math.round(tModules)}ms`);

// DB migration is intentionally deferred — run AFTER the server starts listening
// so the startup probe can connect immediately instead of timing out during migration.

// ─── Process-level error handlers ────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  logger.fatal({ module: 'process', err }, 'uncaughtException — shutting down');
  // Best-effort alert before exit (give it 3s, then exit anyway)
  const msg = `uncaughtException: ${err.message ?? String(err)}`;
  void sendAlert(msg, 'uncaughtException')
    .catch(() => {})
    .finally(() => process.exit(1));
  setTimeout(() => process.exit(1), 3_000).unref();
});

process.on('unhandledRejection', (reason) => {
  logger.error({ module: 'process', reason }, 'unhandledRejection');
});

// ─── App ──────────────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV !== 'production';

const app = new Hono();

// ─── Access log (API only — static files are too noisy) ───────────────────────
app.use('/api/*', async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown';
  logger.info(
    { module: 'http', method: c.req.method, path: c.req.path, status: c.res.status, ms, ip },
    `${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`,
  );
});

// Override default 'no-referrer' — YouTube embeds need the Referer header to
// load their player configuration; without it they return Error 153.
// strict-origin-when-cross-origin sends origin only (no path) on cross-origin
// requests, which is sufficient for YouTube while still being safe.
app.use('*', secureHeaders({ referrerPolicy: 'strict-origin-when-cross-origin' }));

// Tell all crawlers and bots to stay away
app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('X-Robots-Tag', 'noindex, nofollow, nosnippet, noarchive');
});

app.use('/api/*', corsMiddleware);

// Rate limiting — production only
if (!isDev) {
  app.use('/api/*', rateLimitMiddleware);
}

// Auth routes (login/refresh/logout are public; me/totp/sessions are self-protected)
app.route('/api/auth', authRouter);

// Protect all other /api/* routes with JWT auth
const PUBLIC_PATHS = new Set(['/api/health']);
const PUBLIC_PREFIXES = ['/api/auth/'];

app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  if (PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    return next();
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  return authMiddleware(c, next);
});

// API routes
app.route('/api/channels', channelsRouter);
app.route('/api/groups', groupsRouter);
app.route('/api/news', newsRouter);
app.route('/api/channels/:channelId/filters', filtersRouter);
app.route('/api/content', contentRouter);
app.route('/api/media', mediaRouter);
app.route('/api/downloads', downloadsRouter);
app.route('/api/log/client', clientLogRouter);
app.route('/api/digest', digestRouter);

// Health check — exposes DB + Telegram circuit state for uptime monitors
app.get('/api/health', async (c) => {
  let dbOk = true;
  try {
    await client.execute('SELECT 1');
  } catch {
    dbOk = false;
  }

  const telegramCircuit = getTelegramCircuitState();
  const sessionExpired = getTelegramSessionExpired();
  const status = !dbOk || telegramCircuit === 'open' ? 'degraded' : 'ok';

  return c.json({
    status,
    timestamp: Date.now(),
    uptime: Math.floor(process.uptime()),
    db: dbOk ? 'ok' : 'error',
    telegram: { circuit: telegramCircuit, sessionExpired },
  });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  // Cache-Control for static assets:
  //   /assets/* → immutable (Vite content-hashes every filename → safe to cache 1 year)
  //   everything else (index.html, sw.js, robots.txt) → no-cache (always revalidate)
  app.use('/*', async (c, next) => {
    await next();
    if (c.req.path.startsWith('/assets/')) {
      c.res.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      c.res.headers.set('Cache-Control', 'no-cache');
    }
  });
  app.use('/*', serveStatic({ root: './dist/client' }));
  app.get('*', serveStatic({ path: './dist/client/index.html' }));
}

const port = parseInt(process.env.SERVER_PORT || '3173', 10);

// ── Start HTTP server FIRST so the startup probe can connect immediately ────
// Migration runs after serve() — during the ~3s migration window the health
// endpoint already responds (SELECT 1 works before schema changes), so the
// probe never sees "connection refused" and never fails.
serve({ fetch: app.fetch, port });
const honoMs = Math.round(performance.now() - tModules);
logger.info({ module: 'server', port, ms: honoMs }, `Hono listening on :${port} (setup ${honoMs}ms)`);

// Run migration, then start workers (both require a ready DB schema)
const t1 = performance.now();
await runMigration();
logger.info(
  { module: 'server', ms: Math.round(performance.now() - t1) },
  `Migration done in ${Math.round(performance.now() - t1)}ms`,
);

const t2 = performance.now();
startWorkerPool(DOWNLOAD_WORKER_CONCURRENCY);
logger.info(
  { module: 'server', workers: DOWNLOAD_WORKER_CONCURRENCY, ms: Math.round(performance.now() - t2) },
  `Worker pool started (${DOWNLOAD_WORKER_CONCURRENCY} workers) in ${Math.round(performance.now() - t2)}ms`,
);

logger.info(
  { module: 'server', totalMs: Math.round(performance.now()) },
  `✅ Ready in ${Math.round(performance.now())}ms total`,
);

// Startup alert — no dedup key so every (re)start fires (process is fresh each time).
// In prod: signals that the container came back up after a restart / new deploy.
// No-op in dev (ALERT_BOT_TOKEN not set locally).
if (process.env.NODE_ENV === 'production') {
  void sendAlert(`🟢 Server started — port ${port}`).catch(() => {});
}
