import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { streamSSE } from 'hono/streaming';
import { db } from '../db/index.js';
import { downloads } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { enqueueTask, prioritizeTask, getActiveTasks } from '../services/downloadManager.js';
import { downloadProgressEmitter } from '../services/downloadProgress.js';
import type { DownloadTask } from '../../shared/types.js';
import { createDownloadSchema } from './schemas.js';

const router = new Hono();

// GET /api/downloads — list all active (non-done) tasks with context
router.get('/', async (c) => {
  const tasks = await getActiveTasks();
  return c.json(tasks);
});

// POST /api/downloads — enqueue a task (user-initiated → default priority=10)
router.post('/', zValidator('json', createDownloadSchema), async (c) => {
  const body = c.req.valid('json');
  const priority = body.priority ?? 10;
  await enqueueTask(body.newsId, body.type, body.url, priority);
  return c.json({ success: true });
});

// PATCH /api/downloads/:id/prioritize — boost to priority=10, reset failed → pending
router.patch('/:id/prioritize', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await prioritizeTask(id);
  return c.json({ success: true });
});

// DELETE /api/downloads/:id — cancel a pending or failed task
router.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const [deleted] = await db.delete(downloads).where(eq(downloads.id, id)).returning();
  if (!deleted) return c.json({ error: 'Task not found' }, 404);
  return c.json({ success: true });
});

// GET /api/downloads/stream — SSE stream for real-time task updates
router.get('/stream', (c) => {
  const abortSignal = c.req.raw.signal;
  return streamSSE(c, async (stream) => {
    // Send current state on connect
    const activeTasks = await getActiveTasks();
    await stream.writeSSE({ event: 'init', data: JSON.stringify(activeTasks) });

    await new Promise<void>((resolve) => {
      const onTaskUpdate = (task: DownloadTask) => {
        void stream.writeSSE({ event: 'task_update', data: JSON.stringify(task) });
      };
      downloadProgressEmitter.on('task_update', onTaskUpdate);
      abortSignal.addEventListener('abort', () => {
        downloadProgressEmitter.off('task_update', onTaskUpdate);
        resolve();
      });
    });
  });
});

export default router;
