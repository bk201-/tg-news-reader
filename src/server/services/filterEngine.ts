import { db, client } from '../db/index.js';
import { news, filters } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from '../logger.js';

type FilterRow = { id: number; type: string; value: string };
type NewsCheck = { text: string; hashtags: string[] };

/** Returns true if the filter matches the given news item. */
export function checkFilterMatch(filter: FilterRow, item: NewsCheck): boolean {
  const value = filter.value.replace(/^#/, '').toLowerCase();
  if (filter.type === 'tag') {
    return item.hashtags.some((h) => h.replace(/^#/, '').toLowerCase() === value);
  }
  return item.text.toLowerCase().includes(value);
}

/** Upsert per-day hit counts into filter_stats (increments). */
async function recordFilterHits(hits: Map<number, number>): Promise<void> {
  if (hits.size === 0) return;
  const today = new Date().toISOString().slice(0, 10);
  for (const [filterId, count] of hits) {
    await client.execute({
      sql: `INSERT INTO filter_stats (filter_id, date, hit_count)
            VALUES (?, ?, ?)
            ON CONFLICT(filter_id, date) DO UPDATE SET hit_count = hit_count + excluded.hit_count`,
      args: [filterId, today, count],
    });
  }
}

/**
 * Called right after fetching new news for a channel.
 * Sets is_filtered=1 on matched items and records stats.
 */
export async function applyFiltersToInserted(
  channelId: number,
  insertedItems: Array<{ newsId: number; text: string; hashtags: string[] }>,
): Promise<void> {
  if (insertedItems.length === 0) return;

  const activeFilters = await db
    .select()
    .from(filters)
    .where(and(eq(filters.channelId, channelId), eq(filters.isActive, 1)));

  if (activeFilters.length === 0) return;

  const toFilter: number[] = [];
  const hits = new Map<number, number>();

  for (const item of insertedItems) {
    for (const filter of activeFilters) {
      if (checkFilterMatch(filter, item)) {
        if (!toFilter.includes(item.newsId)) toFilter.push(item.newsId);
        hits.set(filter.id, (hits.get(filter.id) ?? 0) + 1);
      }
    }
  }

  if (toFilter.length > 0) {
    await db.update(news).set({ isFiltered: 1 }).where(inArray(news.id, toFilter));
  }

  await recordFilterHits(hits);

  logger.debug(
    { module: 'filterEngine', channelId, filtered: toFilter.length, total: insertedItems.length },
    'filters applied to inserted news',
  );
}

/**
 * Recompute is_filtered for ALL existing news of a channel.
 * Called when a filter is created, updated, or deleted.
 * Does NOT modify filter_stats — historical data is immutable.
 */
export async function reprocessChannelFilters(channelId: number): Promise<void> {
  const activeFilters = await db
    .select()
    .from(filters)
    .where(and(eq(filters.channelId, channelId), eq(filters.isActive, 1)));

  const allNews = await db
    .select({ id: news.id, text: news.text, hashtags: news.hashtags })
    .from(news)
    .where(eq(news.channelId, channelId));

  const toFilter: number[] = [];
  const toUnfilter: number[] = [];

  for (const row of allNews) {
    const isFiltered = activeFilters.some((f) => checkFilterMatch(f, { text: row.text, hashtags: row.hashtags }));
    if (isFiltered) toFilter.push(row.id);
    else toUnfilter.push(row.id);
  }

  if (toFilter.length > 0) {
    await db.update(news).set({ isFiltered: 1 }).where(inArray(news.id, toFilter));
  }
  if (toUnfilter.length > 0) {
    await db.update(news).set({ isFiltered: 0 }).where(inArray(news.id, toUnfilter));
  }

  logger.debug(
    { module: 'filterEngine', channelId, filtered: toFilter.length, unfiltered: toUnfilter.length },
    'channel filters reprocessed',
  );
}
