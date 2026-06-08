import { createReadStream, existsSync, statSync } from 'fs';
import { Readable } from 'stream';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { OPENAI_TTS_MODEL, OPENAI_TTS_VOICE_DEFAULT, TTS_MAX_INPUT_CHARS } from '../config.js';
import { logger } from '../logger.js';
import { isTtsConfigured } from '../services/openaiClient.js';
import { getTtsStatus, startOrGetTts, touchTts, ttsFilePath } from '../services/ttsService.js';
import { createTtsSchema } from './schemas.js';

const router = new Hono();

/**
 * GET /api/tts/config
 * Returns current TTS configuration so the client can enable/disable the AI button.
 * Public-ish: requires auth via the parent middleware, but does not reveal secrets.
 */
router.get('/config', (c) => {
  return c.json({
    enabled: isTtsConfigured(),
    defaultVoice: OPENAI_TTS_VOICE_DEFAULT,
    maxInputChars: TTS_MAX_INPUT_CHARS,
    model: OPENAI_TTS_MODEL,
  });
});

/**
 * POST /api/tts
 * Body: `{ text: string, voice?: string }`
 *
 * - Returns 503 if TTS provider not configured.
 * - Returns 413 if `text.length > TTS_MAX_INPUT_CHARS`.
 * - Returns `{ hash, status, chunksTotal, chunksDone, cached }`:
 *     * `cached: true` → audio is ready, fetch `GET /api/tts/:hash.mp3`
 *     * `cached: false` → poll `GET /api/tts/:hash/status` until `status === 'done'`
 */
router.post('/', zValidator('json', createTtsSchema), async (c) => {
  if (!isTtsConfigured()) {
    return c.json({ error: 'TTS not configured on the server' }, 503);
  }
  const { text, voice } = c.req.valid('json');
  if (text.length > TTS_MAX_INPUT_CHARS) {
    return c.json(
      {
        error: `Text too long (${text.length} chars). Max is ${TTS_MAX_INPUT_CHARS}.`,
        maxInputChars: TTS_MAX_INPUT_CHARS,
      },
      413,
    );
  }
  const result = await startOrGetTts(text, voice);
  return c.json(result);
});

/**
 * GET /api/tts/:hash/status
 * Used by the client to poll until generation completes.
 */
router.get('/:hash/status', async (c) => {
  const hash = c.req.param('hash');
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    return c.json({ error: 'Invalid hash' }, 400);
  }
  const status = await getTtsStatus(hash);
  if (!status) return c.json({ error: 'Unknown hash' }, 404);
  return c.json(status);
});

/**
 * GET /api/tts/:hash.mp3
 * Streams the cached MP3 with HTTP Range support so the browser can seek.
 * Auth via `?token=` query param (handled by the global auth middleware).
 */
router.get('/:filename{.+\\.mp3$}', (c) => {
  const filename = c.req.param('filename');
  const hash = filename.replace(/\.mp3$/, '');

  if (!/^[0-9a-f]{64}$/.test(hash)) {
    return c.json({ error: 'Invalid hash' }, 400);
  }

  const filepath = ttsFilePath(hash);
  if (!existsSync(filepath)) return c.json({ error: 'Not found' }, 404);

  // Bump lastAccessedAt asynchronously — don't block the stream on the DB write
  void touchTts(hash).catch((err) => {
    logger.warn({ module: 'tts', hash, err }, 'failed to bump lastAccessedAt');
  });

  const totalSize = statSync(filepath).size;
  const rangeHeader = c.req.header('range');

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      return c.body(null, 416, { 'Content-Range': `bytes */${totalSize}` });
    }
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
    if (start > end || end >= totalSize) {
      return c.body(null, 416, { 'Content-Range': `bytes */${totalSize}` });
    }
    const chunkSize = end - start + 1;
    const webStream = Readable.toWeb(createReadStream(filepath, { start, end })) as ReadableStream;
    return c.body(webStream, 206, {
      'Content-Type': 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Content-Length': String(chunkSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    });
  }

  const webStream = Readable.toWeb(createReadStream(filepath)) as ReadableStream;
  return c.body(webStream, 200, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': String(totalSize),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  });
});

export default router;
