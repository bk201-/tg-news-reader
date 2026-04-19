import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import versionRouter from './version.js';
import { version as APP_VERSION } from '../../../package.json';

function createApp() {
  const app = new Hono();
  const publicPaths = new Set(['/api/version']);

  app.use('/api/*', async (c, next) => {
    if (publicPaths.has(c.req.path)) return next();
    return authMiddleware(c, next);
  });

  app.route('/api/version', versionRouter);
  return app;
}

describe('Version route (integration)', () => {
  it('returns the current app version without auth', async () => {
    const app = createApp();

    const res = await app.request('/api/version');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ version: APP_VERSION });
  });
});

