import { Hono } from 'hono';
import { getLogEntries, getBufferSize, LEVEL_MAP } from '../services/logBuffer.js';

const router = new Hono();

/**
 * GET /api/logs?hours=2&level=info
 *
 * Returns in-memory log buffer entries filtered by time window and minimum level.
 * Protected by JWT auth (registered under the auth middleware in index.ts).
 */
router.get('/', (c) => {
  const hoursParam = Math.min(Math.max(Number(c.req.query('hours') ?? '2'), 0.25), 24);
  const levelParam = (c.req.query('level') ?? 'debug').toLowerCase();

  const minLevel = LEVEL_MAP[levelParam] ?? LEVEL_MAP.debug;
  const sinceMs = Date.now() - hoursParam * 60 * 60 * 1000;

  const entries = getLogEntries(sinceMs, minLevel);

  return c.json({
    entries,
    total: entries.length,
    bufferSize: getBufferSize(),
    sinceMs,
    minLevel,
  });
});

export default router;
