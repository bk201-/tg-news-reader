/**
 * useNewsFeedState — thin coordinator composing data, actions, and scroll hooks.
 *
 * Split into:
 *   Feed/useNewsFeedData.ts    — queries, filtering, derived values
 *   Feed/useNewsFeedActions.ts — handlers: mark read, fetch, tag, auto-advance
 *   Feed/useNewsFeedScroll.ts  — FAB, sentinel, scroll-to-index, auto-advance on filter
 */

import { useCallback } from 'react';
import type { Channel } from '../../../shared/types';
import { useUIStore } from '../../store/uiStore';
import { useNewsFeedData } from './Feed/useNewsFeedData';
import { useNewsFeedActions } from './Feed/useNewsFeedActions';
import { useNewsFeedScroll } from './Feed/useNewsFeedScroll';
import { useNewsHotkeys } from './Feed/useNewsHotkeys';
import { useNewsFeedHotkeys } from './Feed/useNewsFeedHotkeys';

export function useNewsFeedState(channel: Channel) {
  const {
    selectedNewsId,
    setSelectedNewsId,
    showAll,
    setShowAll,
    setFilterPanelOpen,
    newsViewMode,
    setNewsViewMode,
    autoAdvance,
  } = useUIStore();

  const data = useNewsFeedData(channel);
  const actions = useNewsFeedActions(
    channel,
    data.displayItems,
    data.unreadCount,
    data.serverFilteredOut,
    data.setMediaProgressKey,
  );

  // Tag click needs setHashTagFilter from data + createFilter from actions
  const { setHashTagFilter } = data;
  const { handleTagClick: actionsHandleTagClick } = actions;
  const handleTagClick = useCallback(
    (tag: string, action: 'show' | 'addFilter') => {
      if (action === 'show') {
        setHashTagFilter(tag);
        setShowAll(false);
      } else {
        actionsHandleTagClick(tag, action);
      }
    },
    [setHashTagFilter, setShowAll, actionsHandleTagClick],
  );

  const scroll = useNewsFeedScroll(
    data.displayItems,
    data.newsItems,
    data.effectiveViewMode,
    data.forceAccordion,
    (args) => actions.markRead.mutate(args),
  );

  useNewsHotkeys(data.displayItems, selectedNewsId, setSelectedNewsId, actions.handleSpaceKey);
  useNewsFeedHotkeys({
    onFetch: actions.handleFetchDefault,
    onToggleShowAll: () => setShowAll(!showAll),
    onMarkAllRead: actions.handleMarkAllReadAndAdvance,
    onOpenFilters: () => setFilterPanelOpen(true),
  });

  // ── Toolbar props ─────────────────────────────────────────────────────
  const toolbarProps = {
    fetchPending: actions.fetchChannel.isPending,
    fetchPeriod: actions.fetchPeriod,
    onFetchDefault: actions.handleFetchDefault,
    onFetchPeriod: actions.handleFetchPeriod,
    showAll,
    onToggleShowAll: () => setShowAll(!showAll),
    markAllPending:
      actions.markAllRead.isPending ||
      actions.markReadAndFetch.isPending ||
      (autoAdvance && actions.fetchChannel.isPending),
    onMarkAllRead: actions.handleMarkAllReadAndAdvance,
    activeFilterCount: data.activeFilterCount,
    onOpenFilters: () => setFilterPanelOpen(true),
    hashTagFilter: data.hashTagFilter,
    onClearHashTag: () => data.setHashTagFilter(null),
    shownCount: data.displayItems.length,
    hiddenCount: data.hiddenByFilters,
    totalCount: data.totalCount,
    unreadCount: data.unreadCount,
    newsViewMode,
    onSetViewMode: setNewsViewMode,
    isMobile: data.forceAccordion,
    onOpenDigest: () => data.setDigestOpen(true),
    showDigest: channel.supportsDigest,
    channelTelegramId: channel.telegramId,
  };

  return {
    // Data
    isLoading: data.isLoading,
    displayItems: data.displayItems,
    filteredIds: data.filteredIds,
    selectedNewsId,
    selectedItem: data.selectedItem,
    showAll,
    hashTagFilter: data.hashTagFilter,
    activeFilterCount: data.activeFilterCount,
    effectiveViewMode: data.effectiveViewMode,
    forceAccordion: data.forceAccordion,
    // Pagination
    hasNextPage: data.hasNextPage,
    fetchNextPage: data.fetchNextPage,
    isFetchingNextPage: data.isFetchingNextPage,
    // Digest
    digestOpen: data.digestOpen,
    setDigestOpen: data.setDigestOpen,
    // Toolbar
    toolbarProps,
    // Handlers
    setSelectedNewsId,
    handleMarkedRead: actions.handleMarkedRead,
    handleTagClick,
    scrollToTop: scroll.scrollToTop,
    // Refs
    virtuosoRef: scroll.virtuosoRef,
    scrollTopBtnRef: scroll.scrollTopBtnRef,
    topSentinelRef: scroll.topSentinelRef,
  };
}
