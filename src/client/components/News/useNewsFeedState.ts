import { useMemo, useEffect, useCallback, useRef, useState } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import type { Channel, NewsItem } from '../../../shared/types';
import { useNews, useMarkAllRead, useMarkRead } from '../../api/news';
import { useFilters, useCreateFilter } from '../../api/filters';
import { useFetchChannel, useChannels } from '../../api/channels';
import { useUIStore } from '../../store/uiStore';
import { applyFilters } from './filterUtils';
import { useHashTagSync } from './useHashTagSync';
import { useNewsHotkeys } from './useNewsHotkeys';
import { useNewsFeedHotkeys } from './useNewsFeedHotkeys';
import { useIsXl } from '../../hooks/breakpoints';
import { useMediaProgressSSE } from '../../api/mediaProgress';
import type { VirtuosoHandle } from 'react-virtuoso';

export function useNewsFeedState(channel: Channel) {
  const { message } = App.useApp();
  const { t } = useTranslation();

  const {
    selectedNewsId,
    setSelectedNewsId,
    showAll,
    setShowAll,
    setFilterPanelOpen,
    newsViewMode,
    setNewsViewMode,
    setSelectedChannelId,
    autoAdvance,
  } = useUIStore();

  const forceAccordion = !useIsXl();
  const effectiveViewMode = forceAccordion ? 'accordion' : newsViewMode;

  const { hashTagFilter, setHashTagFilter } = useHashTagSync(channel.id);
  const { data: allChannels = [] } = useChannels();

  const { data: newsData, isLoading } = useNews(channel.id, !showAll);
  const newsItems = useMemo(() => newsData?.items ?? [], [newsData?.items]);
  const serverFilteredOut = newsData?.filteredOut ?? 0;
  const { data: filters = [] } = useFilters(channel.id);
  const markAllRead = useMarkAllRead();
  const markRead = useMarkRead();
  const fetchChannel = useFetchChannel();
  const createFilter = useCreateFilter(channel.id);

  // Advance to the next channel in order (circular), regardless of unread count.
  const goToNextChannel = useCallback(() => {
    const sameGroup = allChannels
      .filter((ch) => (ch.groupId ?? null) === (channel.groupId ?? null))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const currentIdx = sameGroup.findIndex((ch) => ch.id === channel.id);
    if (currentIdx === -1 || sameGroup.length <= 1) return;

    const next = sameGroup[(currentIdx + 1) % sameGroup.length];
    setSelectedChannelId(next.id);
  }, [allChannels, channel.id, channel.groupId, setSelectedChannelId]);

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

  const unreadCount = displayItems.filter((n) => n.isRead === 0).length;
  const hiddenByFilters = showAll ? newsItems.length - filteredIds.size : serverFilteredOut;
  const totalCount = newsItems.length + (showAll ? 0 : serverFilteredOut);

  const [digestOpen, setDigestOpen] = useState(false);
  const [fetchPeriod, setFetchPeriod] = useState<string>('');
  const [mediaProgressKey, setMediaProgressKey] = useState(0);

  useEffect(() => {
    setFetchPeriod('');
  }, [channel.id]);

  // Called after a USER-TRIGGERED fetch (button, double-space at end).
  // Auto-advance only fires here — NOT on the automatic fetch when opening a channel.
  const onUserFetchSuccess = useCallback(
    (data: { inserted: number; mediaProcessing?: boolean }) => {
      if (data.mediaProcessing) {
        setMediaProgressKey((k) => k + 1);
      }
      if (autoAdvance && data.inserted === 0 && unreadCount === 0) {
        goToNextChannel();
      }
    },
    [goToNextChannel, unreadCount, autoAdvance],
  );

  const handleMarkedRead = useCallback(
    (currentId: number) => {
      const currentIndex = displayItems.findIndex((item) => item.id === currentId);
      const nextUnread = displayItems.slice(currentIndex + 1).find((item) => item.isRead === 0);
      if (nextUnread) {
        setSelectedNewsId(nextUnread.id);
      } else {
        const remainingVisible = displayItems.filter((item) => item.id !== currentId && item.isRead === 0);
        if (!showAll && remainingVisible.length === 0 && serverFilteredOut > 0) markAllRead.mutate(channel.id);
      }
    },
    [displayItems, setSelectedNewsId, showAll, serverFilteredOut, markAllRead, channel.id],
  );

  const handleTagClick = useCallback(
    (tag: string, action: 'show' | 'addFilter') => {
      if (action === 'show') {
        setHashTagFilter(tag);
        setShowAll(false);
      } else {
        void createFilter
          .mutateAsync({ name: tag, type: 'tag', value: tag.toLowerCase() })
          .then(() => void message.success(t('news.list.tag_added_toast', { tag })));
      }
    },
    [setHashTagFilter, setShowAll, createFilter, message, t],
  );

  const handleFetchDefault = useCallback(() => {
    setFetchPeriod('');
    fetchChannel.mutate({ id: channel.id }, { onSuccess: onUserFetchSuccess });
  }, [channel.id, fetchChannel, onUserFetchSuccess]);

  // ── Refs ──────────────────────────────────────────────────────────────
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollTopBtnRef = useRef<HTMLButtonElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  // ── Scroll-to-top FAB visibility via viewport IO on post-toolbar sentinel ─
  useEffect(() => {
    if (!forceAccordion) return;
    const sentinel = topSentinelRef.current;
    const btn = scrollTopBtnRef.current;
    if (!sentinel || !btn) return;
    const show = () => {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      btn.style.transform = 'translateY(0)';
    };
    const hide = () => {
      btn.style.opacity = '0';
      btn.style.pointerEvents = 'none';
      btn.style.transform = 'translateY(8px)';
    };
    const observer = new IntersectionObserver(([entry]) => (entry.isIntersecting ? hide() : show()), {
      root: null,
      threshold: 0,
    });
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      hide();
    };
  }, [forceAccordion]);

  // ── Media progress SSE ─────────────────────────────────────────────────
  useMediaProgressSSE(channel.id, mediaProgressKey);

  // ── Auto-fetch on channel open ────────────────────────────────────────
  useEffect(() => {
    fetchChannel.mutate(
      { id: channel.id },
      {
        onSuccess: (data) => {
          if (data.mediaProcessing) setMediaProgressKey((k) => k + 1);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

  const handleFetchPeriod = useCallback(
    (val: string | number) => {
      const v = String(val);
      setFetchPeriod(v);
      if (v === 'sync') {
        fetchChannel.mutate({ id: channel.id, since: 'lastSync' }, { onSuccess: onUserFetchSuccess });
      } else {
        const since = new Date();
        since.setDate(since.getDate() - parseInt(v, 10));
        since.setHours(0, 0, 0, 0);
        fetchChannel.mutate({ id: channel.id, since: since.toISOString() }, { onSuccess: onUserFetchSuccess });
      }
    },
    [channel.id, fetchChannel, onUserFetchSuccess],
  );

  const handleSpaceKey = useCallback(
    (item: NewsItem) => {
      if (item.isRead === 0) {
        markRead.mutate(
          { id: item.id, isRead: 1, channelId: item.channelId },
          { onSuccess: () => handleMarkedRead(item.id) },
        );
      } else {
        const idx = displayItems.findIndex((n) => n.id === item.id);
        const next = displayItems.slice(idx + 1).find((n) => n.isRead === 0);
        if (next) setSelectedNewsId(next.id);
        else handleFetchDefault();
      }
    },
    [displayItems, markRead, handleMarkedRead, setSelectedNewsId, handleFetchDefault],
  );

  useNewsHotkeys(displayItems, selectedNewsId, setSelectedNewsId, handleSpaceKey);
  useNewsFeedHotkeys({
    onFetch: handleFetchDefault,
    onToggleShowAll: () => setShowAll(!showAll),
    onMarkAllRead: () => markAllRead.mutate(channel.id),
    onOpenFilters: () => setFilterPanelOpen(true),
  });

  // ── Auto-advance selected news when filtered out ───────────────────────
  useEffect(() => {
    if (showAll || !selectedNewsId) return;
    if (displayItems.some((n) => n.id === selectedNewsId)) return;
    const item = newsItems.find((n) => n.id === selectedNewsId);
    if (item && item.isRead === 0) markRead.mutate({ id: item.id, isRead: 1, channelId: item.channelId });
    const currentIndex = newsItems.findIndex((n) => n.id === selectedNewsId);
    const nextUnread =
      displayItems.find((n) => newsItems.findIndex((m) => m.id === n.id) > currentIndex && n.isRead === 0) ??
      displayItems.find((n) => n.isRead === 0) ??
      null;
    setSelectedNewsId(nextUnread?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayItems]);

  // ── Scroll selected item into view ────────────────────────────────────
  useEffect(() => {
    if (!selectedNewsId) return;
    const index = displayItems.findIndex((n) => n.id === selectedNewsId);
    if (index === -1) return;
    if (effectiveViewMode === 'accordion') {
      const id = setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index, behavior: 'smooth', align: 'start' });
      }, 50);
      return () => clearTimeout(id);
    } else {
      virtuosoRef.current?.scrollToIndex({ index, behavior: 'smooth', align: 'center' });
    }
  }, [selectedNewsId, displayItems, effectiveViewMode]);

  const scrollToTop = useCallback(() => {
    if (forceAccordion) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      virtuosoRef.current?.scrollToIndex({ index: 0, behavior: 'smooth', align: 'start' });
    }
  }, [forceAccordion]);

  // ── Toolbar props ─────────────────────────────────────────────────────
  const toolbarProps = {
    fetchPending: fetchChannel.isPending,
    fetchPeriod,
    onFetchDefault: handleFetchDefault,
    onFetchPeriod: handleFetchPeriod,
    showAll,
    onToggleShowAll: () => setShowAll(!showAll),
    markAllPending: markAllRead.isPending,
    onMarkAllRead: () => markAllRead.mutate(channel.id),
    activeFilterCount,
    onOpenFilters: () => setFilterPanelOpen(true),
    hashTagFilter,
    onClearHashTag: () => setHashTagFilter(null),
    shownCount: displayItems.length,
    hiddenCount: hiddenByFilters,
    totalCount,
    unreadCount,
    newsViewMode,
    onSetViewMode: setNewsViewMode,
    isMobile: forceAccordion,
    onOpenDigest: () => setDigestOpen(true),
    showDigest: channel.supportsDigest,
    channelTelegramId: channel.telegramId,
  };

  return {
    // Data
    isLoading,
    displayItems,
    filteredIds,
    selectedNewsId,
    selectedItem,
    showAll,
    hashTagFilter,
    activeFilterCount,
    effectiveViewMode,
    forceAccordion,
    // Digest
    digestOpen,
    setDigestOpen,
    // Toolbar
    toolbarProps,
    // Handlers
    setSelectedNewsId,
    handleMarkedRead,
    handleTagClick,
    scrollToTop,
    // Refs
    virtuosoRef,
    scrollTopBtnRef,
    topSentinelRef,
  };
}
