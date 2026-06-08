import { existsSync, statSync } from 'fs';
import { mkdir, rename, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { and, eq, lt } from 'drizzle-orm';
import { OPENAI_TTS_MODEL, OPENAI_TTS_VOICE_DEFAULT, TTS_CACHE_TTL_SEC, TTS_CHUNK_SIZE_CHARS } from '../config.js';
import { db } from '../db/index.js';
import { ttsCache } from '../db/schema.js';
import { logger } from '../logger.js';
import { createTtsClient } from './openaiClient.js';
import { chunkTextForTts, computeTtsHash } from './ttsChunker.js';

const TTS_DIR = join(process.cwd(), 'data', 'tts');

/** Single-flight registry: ensures concurrent identical requests share one generation job. */
const inFlight = new Map<string, Promise<void>>();

export interface TtsJobStatus {
  hash: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  chunksTotal: number;
  chunksDone: number;
  error: string | null;
}

export interface TtsStartResult extends TtsJobStatus {
  /** True when the cached row was found and is `done` — caller can stream immediately. */
  cached: boolean;
}

/** Absolute path to the cached MP3 for a given hash (used by the route to stream the file). */
export function ttsFilePath(hash: string): string {
  return join(TTS_DIR, `${hash}.mp3`);
}

/**
 * Look up or kick off a TTS generation for the given input.
 *
 * - If a `done` row + file already exist → returns `cached: true`, bumps lastAccessedAt.
 * - If a row exists with status `pending`/`processing` → returns current status (no new job).
 * - If a row exists with status `failed` → resets to `pending` and re-runs.
 * - Otherwise → inserts a `pending` row and kicks off generation in the background.
 *
 * Never throws for "in progress" cases — only for invalid input or DB errors.
 */
export async function startOrGetTts(text: string, voice?: string): Promise<TtsStartResult> {
  const v = voice && voice.trim() ? voice.trim() : OPENAI_TTS_VOICE_DEFAULT;
  const model = OPENAI_TTS_MODEL;
  const hash = computeTtsHash(text, v, model);
  const now = Math.floor(Date.now() / 1000);

  await mkdir(TTS_DIR, { recursive: true });

  const existing = await db.select().from(ttsCache).where(eq(ttsCache.contentHash, hash)).limit(1);
  const row = existing[0];

  if (row && row.status === 'done' && existsSync(ttsFilePath(hash))) {
    // Cache hit — bump access time so cleanup keeps the file warm
    await db.update(ttsCache).set({ lastAccessedAt: now }).where(eq(ttsCache.contentHash, hash));
    return {
      hash,
      status: 'done',
      chunksTotal: row.chunksTotal,
      chunksDone: row.chunksDone,
      error: null,
      cached: true,
    };
  }

  if (row && (row.status === 'pending' || row.status === 'processing')) {
    return {
      hash,
      status: row.status,
      chunksTotal: row.chunksTotal,
      chunksDone: row.chunksDone,
      error: row.error,
      cached: false,
    };
  }

  // Fresh row, or previous attempt failed / file vanished → (re)start generation
  const chunks = chunkTextForTts(text, TTS_CHUNK_SIZE_CHARS);

  if (row) {
    await db
      .update(ttsCache)
      .set({
        status: 'pending',
        chunksTotal: chunks.length,
        chunksDone: 0,
        error: null,
        lastAccessedAt: now,
      })
      .where(eq(ttsCache.contentHash, hash));
  } else {
    await db.insert(ttsCache).values({
      contentHash: hash,
      voice: v,
      model,
      charCount: text.length,
      status: 'pending',
      chunksTotal: chunks.length,
      chunksDone: 0,
      lastAccessedAt: now,
    });
  }

  // Kick off the background job, with single-flight dedup
  void scheduleGeneration(hash, text, v, model, chunks);

  return {
    hash,
    status: 'pending',
    chunksTotal: chunks.length,
    chunksDone: 0,
    error: null,
    cached: false,
  };
}

/**
 * Read the current job status from the DB. Used by polling clients.
 */
export async function getTtsStatus(hash: string): Promise<TtsJobStatus | null> {
  const rows = await db.select().from(ttsCache).where(eq(ttsCache.contentHash, hash)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    hash,
    status: row.status,
    chunksTotal: row.chunksTotal,
    chunksDone: row.chunksDone,
    error: row.error,
  };
}

/** Bumps lastAccessedAt — called by the audio-streaming route on every hit. */
export async function touchTts(hash: string): Promise<void> {
  await db
    .update(ttsCache)
    .set({ lastAccessedAt: Math.floor(Date.now() / 1000) })
    .where(eq(ttsCache.contentHash, hash));
}

/**
 * Periodic cleanup — deletes rows + files where lastAccessedAt is older than TTL.
 * Called on server startup and on an interval.
 */
export async function cleanupExpiredTts(): Promise<number> {
  const cutoff = Math.floor(Date.now() / 1000) - TTS_CACHE_TTL_SEC;
  const expired = await db
    .select({ contentHash: ttsCache.contentHash })
    .from(ttsCache)
    .where(lt(ttsCache.lastAccessedAt, cutoff));

  let deleted = 0;
  for (const { contentHash } of expired) {
    const filepath = ttsFilePath(contentHash);
    try {
      if (existsSync(filepath)) await unlink(filepath);
    } catch (err) {
      logger.warn({ module: 'tts', hash: contentHash, err }, 'failed to delete expired tts file');
    }
    await db.delete(ttsCache).where(eq(ttsCache.contentHash, contentHash));
    deleted += 1;
  }

  // Also clean up orphaned tmp files left behind by crashed jobs (older than 1h)
  // — deferred to keep the function simple; the rename(.tmp → .mp3) is atomic so leftovers are rare.

  if (deleted > 0) {
    logger.info({ module: 'tts', deleted }, `cleaned up ${deleted} expired tts entries`);
  }
  return deleted;
}

/** Resets any rows stuck in 'processing' on server startup (crash recovery). */
export async function resetStuckTtsJobs(): Promise<void> {
  const stuck = await db
    .update(ttsCache)
    .set({ status: 'failed', error: 'Server restarted during generation' })
    .where(and(eq(ttsCache.status, 'processing')))
    .returning({ contentHash: ttsCache.contentHash });
  if (stuck.length > 0) {
    logger.warn({ module: 'tts', count: stuck.length }, 'marked stuck in-progress tts jobs as failed');
  }
}

// ─── Internal: background generation ──────────────────────────────────────────

function scheduleGeneration(hash: string, text: string, voice: string, model: string, chunks: string[]): Promise<void> {
  const existing = inFlight.get(hash);
  if (existing) return existing;

  const promise = generate(hash, text, voice, model, chunks).finally(() => {
    inFlight.delete(hash);
  });
  inFlight.set(hash, promise);
  return promise;
}

async function generate(hash: string, _text: string, voice: string, model: string, chunks: string[]): Promise<void> {
  const tmpPath = `${ttsFilePath(hash)}.tmp`;
  const finalPath = ttsFilePath(hash);

  try {
    await db.update(ttsCache).set({ status: 'processing', chunksDone: 0 }).where(eq(ttsCache.contentHash, hash));

    const client = createTtsClient();
    const buffers: Buffer[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const response = await client.audio.speech.create({
        model,
        voice,
        input: chunks[i],
        response_format: 'mp3',
      });
      const arrayBuf = await response.arrayBuffer();
      buffers.push(Buffer.from(arrayBuf));
      await db
        .update(ttsCache)
        .set({ chunksDone: i + 1, lastAccessedAt: Math.floor(Date.now() / 1000) })
        .where(eq(ttsCache.contentHash, hash));
      logger.debug({ module: 'tts', hash, chunk: i + 1, total: chunks.length }, 'tts chunk done');
    }

    // Concatenate raw MP3 bytes — players tolerate the extra ID3 frames between chunks.
    await writeFile(tmpPath, Buffer.concat(buffers));
    await rename(tmpPath, finalPath);

    const sizeBytes = statSync(finalPath).size;
    await db
      .update(ttsCache)
      .set({ status: 'done', lastAccessedAt: Math.floor(Date.now() / 1000) })
      .where(eq(ttsCache.contentHash, hash));

    logger.info({ module: 'tts', hash, chunks: chunks.length, sizeBytes }, 'tts generation complete');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ module: 'tts', hash, err }, 'tts generation failed');
    await db
      .update(ttsCache)
      .set({ status: 'failed', error: message.slice(0, 500) })
      .where(eq(ttsCache.contentHash, hash));
    // Best-effort cleanup of partial tmp file
    try {
      if (existsSync(tmpPath)) await unlink(tmpPath);
    } catch {
      // ignore
    }
  }
}
