import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

vi.mock('../config.js', () => ({
  JWT_SECRET: 'test-secret-key',
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() },
}));

import { createTestDb, type TestDb } from '../__tests__/testDb.js';
import { seedChannel, seedNews } from '../__tests__/seed.js';

let testDb: TestDb;

vi.mock('../db/index.js', () => ({
  get client() {
    return testDb.client;
  },
  get db() {
    return testDb.db;
  },
}));

import { applyFiltersToInserted, reprocessChannelFilters } from './filterEngine.js';
import { filters, news } from '../db/schema.js';
import { eq } from 'drizzle-orm';

describe('filterEngine (integration)', () => {
  beforeAll(async () => {
    testDb = await createTestDb();
  });

  beforeEach(async () => {
    await testDb.client.execute('DELETE FROM filter_stats');
    await testDb.client.execute('DELETE FROM filters');
    await testDb.client.execute('DELETE FROM news');
    await testDb.client.execute('DELETE FROM channels');
  });

  describe('applyFiltersToInserted', () => {
    it('does nothing when insertedItems is empty', async () => {
      const ch = await seedChannel(testDb.db);
      await applyFiltersToInserted(ch.id, []);
      // No error = pass
    });

    it('does nothing when no active filters exist', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id, { text: 'crypto news' });

      await applyFiltersToInserted(ch.id, [{ newsId: n.id, text: 'crypto news', hashtags: [] }]);

      // News should NOT be filtered (no filters defined)
      const [row] = await testDb.db.select().from(news).where(eq(news.id, n.id));
      expect(row.isFiltered).toBe(0);
    });

    it('marks matching news as filtered and records stats', async () => {
      const ch = await seedChannel(testDb.db);
      const n1 = await seedNews(testDb.db, ch.id, { text: 'bitcoin pump', telegramMsgId: 1 });
      const n2 = await seedNews(testDb.db, ch.id, { text: 'nice weather', telegramMsgId: 2 });

      // Create a keyword filter
      await testDb.db.insert(filters).values({ channelId: ch.id, name: 'Crypto', type: 'keyword', value: 'bitcoin' });

      await applyFiltersToInserted(ch.id, [
        { newsId: n1.id, text: 'bitcoin pump', hashtags: [] },
        { newsId: n2.id, text: 'nice weather', hashtags: [] },
      ]);

      const [row1] = await testDb.db.select().from(news).where(eq(news.id, n1.id));
      const [row2] = await testDb.db.select().from(news).where(eq(news.id, n2.id));
      expect(row1.isFiltered).toBe(1);
      expect(row2.isFiltered).toBe(0);
    });

    it('matches tag filters on hashtags', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id, { text: 'wow' });

      await testDb.db.insert(filters).values({ channelId: ch.id, name: 'Ad', type: 'tag', value: 'ad' });

      await applyFiltersToInserted(ch.id, [{ newsId: n.id, text: 'wow', hashtags: ['#ad'] }]);

      const [row] = await testDb.db.select().from(news).where(eq(news.id, n.id));
      expect(row.isFiltered).toBe(1);
    });
  });

  describe('reprocessChannelFilters', () => {
    it('sets isFiltered=1 on matching and isFiltered=0 on non-matching', async () => {
      const ch = await seedChannel(testDb.db);
      const n1 = await seedNews(testDb.db, ch.id, { text: 'crypto news', telegramMsgId: 1 });
      const n2 = await seedNews(testDb.db, ch.id, { text: 'sports news', telegramMsgId: 2 });

      await testDb.db.insert(filters).values({ channelId: ch.id, name: 'Crypto', type: 'keyword', value: 'crypto' });

      await reprocessChannelFilters(ch.id);

      const [row1] = await testDb.db.select().from(news).where(eq(news.id, n1.id));
      const [row2] = await testDb.db.select().from(news).where(eq(news.id, n2.id));
      expect(row1.isFiltered).toBe(1);
      expect(row2.isFiltered).toBe(0);
    });

    it('unfilters previously filtered items when filter is removed', async () => {
      const ch = await seedChannel(testDb.db);
      const n = await seedNews(testDb.db, ch.id, { text: 'old news', isFiltered: 1 });

      // No active filters → should unfilter everything
      await reprocessChannelFilters(ch.id);

      const [row] = await testDb.db.select().from(news).where(eq(news.id, n.id));
      expect(row.isFiltered).toBe(0);
    });
  });
});
