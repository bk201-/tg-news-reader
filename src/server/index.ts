import 'dotenv/config';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import channelsRouter from './routes/channels.js';
import newsRouter from './routes/news.js';
import filtersRouter from './routes/filters.js';
import contentRouter from './routes/content.js';
import mediaRouter from './routes/media.js';

// Run DB migration on startup
import './db/migrate.js';

const app = new Hono();

app.use('*', logger());
app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3173'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  }),
);

// API routes
app.route('/api/channels', channelsRouter);
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
