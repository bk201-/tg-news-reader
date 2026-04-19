/**
 * useNewsFeedData — queries, filtering, derived values for NewsFeed.
 */

import { useMemo, useState } from 'react';
import type { Channel } from '../../../../shared/types';
import { useNews, flattenPaginatedItems } from '../../../api/news';
import { useFilters } from '../../../api/filters';
import { useUIStore } from '../../../store/uiStore';
import { applyFilters } from '../filterUtils';
import { useHashTagSync } from './useHashTagSync';
import { useIsXl } from '../../../hooks/breakpoints';
import { useMediaProgressSSE } from '../../../api/mediaProgress';

export function useNewsFeedData(channel: Channel) {
  const { selectedNewsId, showAll, newsViewMode } = useUIStore();

  const forceAccordion = !useIsXl();
  const effectiveViewMode = forceAccordion ? 'accordion' : newsViewMode;

  const { hashTagFilter, setHashTagFilter } = useHashTagSync(channel.id);

  const { data: newsData, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useNews(channel.id, !showAll);
  const newsItems = useMemo(() => flattenPaginatedItems(newsData), [newsData]);
  const serverFilteredOut = newsData?.pages[0]?.filteredOut ?? 0;
  const { data: filters = [] } = useFilters(channel.id);

  const selectedItem = useMemo(
    () => newsItems.find((n) => n.id === selectedNewsId) || null,
    [newsItems, selectedNewsId],
  );
  const filteredIds = useMemo(() => applyFilters(newsItems, filters), [newsItems, filters]);
  const activeFilterCount = filters.filter((f) => f.isActive === 1).length;

  const displayItems = useMemo(() => {
    const base = showAll ? newsItems : newsItems.filter((item) => filteredIds.has(item.id));
    if (!hashTagFilter) return base;
    const normalized = hashTagFilter.toLowerCase().replace(/^#/, '');
    return base.filter((item) => (item.hashtags || []).some((h) => h.toLowerCase().replace(/^#/, '') === normalized));
  }, [newsItems, filteredIds, showAll, hashTagFilter]);

  const unreadCount = channel.unreadCount;
  const hiddenByFilters = showAll ? newsItems.length - filteredIds.size : serverFilteredOut;
  const totalCount = channel.totalNewsCount;

  const [digestOpen, setDigestOpen] = useState(false);
  const [tagBrowserOpen, setTagBrowserOpen] = useState(false);
  const [mediaProgressKey, setMediaProgressKey] = useState(0);

  // ── Tag counts — computed from all loaded items (not filtered) ─────────────
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of newsItems) {
      for (const rawTag of item.hashtags ?? []) {
        const tag = rawTag.startsWith('#') ? rawTag : `#${rawTag}`;
        const key = tag.toLowerCase();
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [newsItems]);

  // ── Media progress SSE ─────────────────────────────────────────────────
  useMediaProgressSSE(channel.id, mediaProgressKey);

  return {
    newsItems,
    isLoading,
    hasNextPage: hasNextPage ?? false,
    fetchNextPage,
    isFetchingNextPage,
    selectedItem,
    filteredIds,
    activeFilterCount,
    displayItems,
    unreadCount,
    hiddenByFilters,
    totalCount,
    serverFilteredOut,
    hashTagFilter,
    setHashTagFilter,
    effectiveViewMode,
    forceAccordion,
    digestOpen,
    setDigestOpen,
    tagBrowserOpen,
    setTagBrowserOpen,
    tagCounts,
    mediaProgressKey,
    setMediaProgressKey,
  };
}
