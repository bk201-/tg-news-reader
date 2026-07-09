import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ConfigModule>()),
  NEWS_DEFAULT_FETCH_DAYS: 3,
  NEWS_FETCH_LIMIT: 1000,
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

vi.mock('./telegram.js', () => ({
  fetchChannelMessages: vi.fn(),
  fetchMessageById: vi.fn(),
  getReadInboxMaxId: vi.fn(),
}));

import { seedChannel, seedNews } from '../__tests__/seed.js';
import { createTestDb } from '../__tests__/testDb.js';
import type { TestDb } from '../__tests__/testDb.js';
import type * as ConfigModule from '../config.js';

let testDb: TestDb;

vi.mock('../db/index.js', () => ({
  get client() {
    return testDb.client;
  },
  get db() {
    return testDb.db;
  },
}));

import { fetchChannelNews } from './channelFetchService.js';
import { fetchChannelMessages, fetchMessageById, getReadInboxMaxId } from './telegram.js';

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;
const HOUR = 3600;

/** Read back the `sinceDate` passed to the (mocked) Telegram fetch. */
function sinceArgMs(): number {
  const call = vi.mocked(fetchChannelMessages).mock.calls[0];
  const opts = call[1] as { sinceDate?: Date };
  return opts.sinceDate!.getTime();
}

describe('channelFetchService — computeSinceDate boundary (integration)', () => {
  // Uses a file-backed DB: fetchChannelNews runs an interactive db.transaction(),
  // which libsql can't service against a :memory: connection (each connection is a
  // separate empty in-memory database).
  const dbFile = join(tmpdir(), `tg-fetch-${process.pid}-${Date.now()}.sqlite`);

  beforeAll(async () => {
    testDb = await createTestDb(`file:${dbFile}`);
  });

  afterAll(() => {
    testDb.client.close();
    // Best-effort cleanup — Windows may still hold the file handle briefly after close().
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        if (existsSync(dbFile + suffix)) rmSync(dbFile + suffix, { force: true });
      } catch {
        // temp file — OS will reclaim it
      }
    }
  });

  beforeEach(async () => {
    await testDb.client.execute('DELETE FROM downloads');
    await testDb.client.execute('DELETE FROM news');
    await testDb.client.execute('DELETE FROM channels');
    vi.mocked(fetchChannelMessages).mockReset().mockResolvedValue([]);
    vi.mocked(fetchMessageById).mockReset().mockResolvedValue(null);
    vi.mocked(getReadInboxMaxId).mockReset().mockResolvedValue(null);
  });

  it('first-ever fetch (no lastFetchedAt, unread channel) uses the default look-back window', async () => {
    const ch = await seedChannel(testDb.db, { lastFetchedAt: null, lastReadAt: null });

    await fetchChannelNews(ch.id);

    // Fallback branch: ~NEWS_DEFAULT_FETCH_DAYS days ago
    expect(sinceArgMs()).toBeLessThanOrEqual((NOW - 2 * DAY) * 1000);
  });

  it('re-fetches the look-back window when a previously-fetched channel is now empty', async () => {
    // Regression: after all news were read + cleaned up, a subsequent fetch used the
    // wall-clock lastFetchedAt as the boundary — always later than any real post — so
    // Telegram returned nothing and the channel stayed permanently empty.
    const ch = await seedChannel(testDb.db, { lastFetchedAt: NOW, lastReadAt: null });

    await fetchChannelNews(ch.id);

    expect(sinceArgMs()).toBeLessThanOrEqual((NOW - 2 * DAY) * 1000);
  });

  it('uses the newest stored post as the boundary, not the wall-clock lastFetchedAt', async () => {
    const postedAt = NOW - 2 * HOUR;
    const ch = await seedChannel(testDb.db, { lastFetchedAt: NOW });
    await seedNews(testDb.db, ch.id, { telegramMsgId: 10, postedAt, isRead: 0 });

    await fetchChannelNews(ch.id);

    expect(sinceArgMs()).toBe(postedAt * 1000);
  });

  it('uses the read watermark when it is newer than the newest stored post', async () => {
    const lastReadAt = NOW - 1 * HOUR;
    const postedAt = NOW - 5 * HOUR;
    const ch = await seedChannel(testDb.db, { lastFetchedAt: NOW, lastReadAt });
    await seedNews(testDb.db, ch.id, { telegramMsgId: 11, postedAt, isRead: 0 });

    await fetchChannelNews(ch.id);

    expect(sinceArgMs()).toBe(lastReadAt * 1000);
  });
});
