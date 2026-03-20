import React, { useMemo, useEffect, useCallback, useRef, useState } from 'react';
import { App, Empty } from 'antd';
import type { Channel } from '../../../shared/types';
import { useNews, useMarkAllRead, useMarkRead } from '../../api/news';
import { useFilters, useCreateFilter } from '../../api/filters';
import { useFetchChannel } from '../../api/channels';
import { useUIStore } from '../../store/uiStore';
import { applyFilters } from './NewsListItem';
import { NewsDetail } from './NewsDetail';
import { FilterPanel } from '../Filters/FilterPanel';
import { NewsFeedToolbar } from './NewsFeedToolbar';
import { NewsFeedList } from './NewsFeedList';
import { NewsAccordionList } from './NewsAccordionList';
import { useHashTagSync } from './useHashTagSync';
import { useMobileBreakpoint } from './useMobileBreakpoint';
import { useNewsHotkeys } from './useNewsHotkeys';

interface NewsFeedProps {
  channel: Channel;
}

export function NewsFeed({ channel }: NewsFeedProps) {
  const { message } = App.useApp();

  const {
    selectedNewsId,
    setSelectedNewsId,
    showAll,
    setShowAll,
    setFilterPanelOpen,
    newsViewMode,
    setNewsViewMode,
  } = useUIStore();

  const isMobile = useMobileBreakpoint(768);
  const effectiveViewMode = isMobile ? 'accordion' : newsViewMode;

  const { hashTagFilter, setHashTagFilter } = useHashTagSync(channel.id);

  const { data: newsData, isLoading } = useNews(channel.id, !showAll);
  const newsItems = newsData?.items ?? [];
  const serverFilteredOut = newsData?.filteredOut ?? 0;
  const { data: filters = [] } = useFilters(channel.id);
  const markAllRead = useMarkAllRead();
  const markRead = useMarkRead();
  const fetchChannel = useFetchChannel();
  const createFilter = useCreateFilter(channel.id);

  const onFetchSuccess = useCallback((_data: { mediaProcessing?: boolean }) => {}, []);

  // ── Derived values ────────────────────────────────────────────────────
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

  // ── Handlers ─────────────────────────────────────────────────────────
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
          .then(() => void message.success(`Тег ${tag} добавлен в фильтры`));
      }
    },
    [setHashTagFilter, setShowAll, createFilter, message],
  );

  // ── Fetch period ──────────────────────────────────────────────────────
  const [fetchPeriod, setFetchPeriod] = useState<string>('');
  useEffect(() => { setFetchPeriod(''); }, [channel.id]);

  const handleFetchDefault = useCallback(() => {
    setFetchPeriod('');
    fetchChannel.mutate({ id: channel.id }, { onSuccess: onFetchSuccess });
  }, [channel.id, fetchChannel, onFetchSuccess]);

  const handleFetchPeriod = useCallback(
    (val: string | number) => {
      const v = String(val);
      setFetchPeriod(v);
      if (v === 'sync') {
        fetchChannel.mutate({ id: channel.id, since: 'lastSync' }, { onSuccess: onFetchSuccess });
      } else {
        const since = new Date();
        since.setDate(since.getDate() - parseInt(v, 10));
        since.setHours(0, 0, 0, 0);
        fetchChannel.mutate({ id: channel.id, since: since.toISOString() }, { onSuccess: onFetchSuccess });
      }
    },
    [channel.id, fetchChannel, onFetchSuccess],
  );

  // ── Keyboard navigation (↑/↓/Space) ──────────────────────────────────
  const handleSpaceKey = useCallback(
    (item: (typeof displayItems)[number]) => {
      if (item.isRead === 0) {
        markRead.mutate({ id: item.id, isRead: 1 }, { onSuccess: () => handleMarkedRead(item.id) });
      } else {
        const idx = displayItems.findIndex((n) => n.id === item.id);
        const next = displayItems.slice(idx + 1).find((n) => n.isRead === 0);
        if (next) setSelectedNewsId(next.id);
      }
    },
    [displayItems, markRead, handleMarkedRead, setSelectedNewsId],
  );
  useNewsHotkeys(displayItems, selectedNewsId, setSelectedNewsId, handleSpaceKey);

  // ── Auto-mark read when selected post gets filtered out ───────────────
  useEffect(() => {
    if (showAll || !selectedNewsId) return;
    if (displayItems.some((n) => n.id === selectedNewsId)) return;
    const item = newsItems.find((n) => n.id === selectedNewsId);
    if (item && item.isRead === 0) markRead.mutate({ id: item.id, isRead: 1 });
    setSelectedNewsId(displayItems.find((n) => n.isRead === 0)?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayItems]);

  // ── Scroll selected into view ─────────────────────────────────────────
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedNewsId || !listRef.current) return;
    listRef.current
      .querySelector<HTMLElement>(`[data-news-id="${selectedNewsId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: effectiveViewMode === 'accordion' ? 'start' : 'center' });
  }, [selectedNewsId, effectiveViewMode]);

  return (
    <div className="news-feed">
      <NewsFeedToolbar
        fetchPending={fetchChannel.isPending}
        fetchPeriod={fetchPeriod}
        onFetchDefault={handleFetchDefault}
        onFetchPeriod={handleFetchPeriod}
        showAll={showAll}
        onToggleShowAll={() => setShowAll(!showAll)}
        markAllPending={markAllRead.isPending}
        onMarkAllRead={() => markAllRead.mutate(channel.id)}
        activeFilterCount={activeFilterCount}
        onOpenFilters={() => setFilterPanelOpen(true)}
        hashTagFilter={hashTagFilter}
        onClearHashTag={() => setHashTagFilter(null)}
        shownCount={displayItems.length}
        hiddenCount={hiddenByFilters}
        totalCount={totalCount}
        unreadCount={unreadCount}
        newsViewMode={newsViewMode}
        onSetViewMode={setNewsViewMode}
        isMobile={isMobile}
      />

      <div className={`news-feed__body${effectiveViewMode === 'accordion' ? ' news-feed__body--accordion' : ''}`}>
        {effectiveViewMode === 'accordion' ? (
          <NewsAccordionList
            isLoading={isLoading}
            items={displayItems}
            filteredIds={filteredIds}
            showAll={showAll}
            selectedNewsId={selectedNewsId}
            hashTagFilter={hashTagFilter}
            activeFilterCount={activeFilterCount}
            channelType={channel.channelType}
            onSelect={setSelectedNewsId}
            onTagClick={handleTagClick}
            onMarkedRead={handleMarkedRead}
            listRef={listRef}
          />
        ) : (
          <>
            <NewsFeedList
              isLoading={isLoading}
              items={displayItems}
              filteredIds={filteredIds}
              showAll={showAll}
              selectedNewsId={selectedNewsId}
              hashTagFilter={hashTagFilter}
              activeFilterCount={activeFilterCount}
              onSelect={setSelectedNewsId}
              onTagClick={handleTagClick}
              listRef={listRef}
            />
            <div className="news-feed__detail">
              {selectedItem ? (
                <NewsDetail key={selectedItem.id} item={selectedItem} channelType={channel.channelType} onMarkedRead={handleMarkedRead} />
              ) : (
                <div className="news-feed__detail-empty">
                  <Empty description="Выберите новость из списка" />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <FilterPanel channelId={channel.id} />
    </div>
  );
}
