import 'dotenv/config';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import channelsRouter from './routes/channels.js';
import newsRouter from './routes/news.js';
import filtersRouter from './routes/filters.js';
import contentRouter from './routes/content.js';
import mediaRouter from './routes/media.js';
import groupsRouter from './routes/groups.js';
import authRouter from './routes/auth.js';
import { authMiddleware } from './middleware/auth.js';
import { corsMiddleware } from './middleware/cors.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';

// Run DB migration on startup
import './db/migrate.js';

const isDev = process.env.NODE_ENV !== 'production';

const app = new Hono();

app.use('*', logger());
app.use('*', secureHeaders());

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
  return authMiddleware(c, next);
});

// API routes
app.route('/api/channels', channelsRouter);
app.route('/api/groups', groupsRouter);
app.route('/api/news', newsRouter);
app.route('/api/channels/:channelId/filters', filtersRouter);
app.route('/api/content', contentRouter);
app.route('/api/media', mediaRouter);

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist/client' }));
  app.get('*', serveStatic({ path: './dist/client/index.html' }));
}

const port = parseInt(process.env.SERVER_PORT || '3173', 10);
console.log(`🚀 Server running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
