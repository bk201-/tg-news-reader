import { Hono } from 'hono';
import { existsSync, openSync, readSync, statSync, closeSync } from 'fs';
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
// Supports HTTP Range requests (required for video seeking in browsers)
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
  const { size: totalSize } = statSync(filepath);

  const rangeHeader = c.req.header('range');

  if (rangeHeader) {
    // Parse "bytes=start-end"
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      return c.body(null, 416, {
        'Content-Range': `bytes */${totalSize}`,
      });
    }

    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

    if (start > end || end >= totalSize) {
      return c.body(null, 416, {
        'Content-Range': `bytes */${totalSize}`,
      });
    }

    const chunkSize = end - start + 1;
    const buf = Buffer.allocUnsafe(chunkSize);
    const fd = openSync(filepath, 'r');
    readSync(fd, buf, 0, chunkSize, start);
    closeSync(fd);

    return c.body(buf, 206, {
      'Content-Type': contentType,
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Content-Length': String(chunkSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
    });
  }

  // Full file response
  const buf = Buffer.allocUnsafe(totalSize);
  const fd = openSync(filepath, 'r');
  readSync(fd, buf, 0, totalSize, 0);
  closeSync(fd);

  return c.body(buf, 200, {
    'Content-Type': contentType,
    'Content-Length': String(totalSize),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400',
  });
});

export default router;
