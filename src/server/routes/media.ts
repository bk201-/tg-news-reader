import { Hono } from 'hono';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const router = new Hono();

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

// GET /api/media/:channel/:filename
router.get('/:channel/:filename', (c) => {
  const channel = c.req.param('channel');
  const filename = c.req.param('filename');

  // Prevent path traversal
  if (channel.includes('..') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return c.json({ error: 'Invalid path' }, 400);
  }

  const filepath = join(process.cwd(), 'data', channel, filename);
  if (!existsSync(filepath)) return c.json({ error: 'Not found' }, 404);

  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const contentType = MIME[ext] ?? 'application/octet-stream';
  const data = readFileSync(filepath);

  return c.body(data, 200, {
    'Content-Type': contentType,
    'Content-Length': String(data.length),
    'Cache-Control': 'public, max-age=86400',
  });
});

export default router;

