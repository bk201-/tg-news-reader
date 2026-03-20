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
    hashTagFilter,
    setHashTagFilter,
    newsViewMode,
    setNewsViewMode,
  } = useUIStore();

  const { data: newsData, isLoading } = useNews(channel.id, !showAll);
  const newsItems = newsData?.items ?? [];
  const serverFilteredOut = newsData?.filteredOut ?? 0;
  const { data: filters = [] } = useFilters(channel.id);
  const markAllRead = useMarkAllRead();
  const markRead = useMarkRead();
  const fetchChannel = useFetchChannel();
  const createFilter = useCreateFilter(channel.id);

  const onFetchSuccess = useCallback((_data: { mediaProcessing?: boolean }) => {}, []);

  // ── URL hash sync ─────────────────────────────────────────────────────
  useEffect(() => {
    setHashTagFilter(null);
  }, [channel.id, setHashTagFilter]);

  useEffect(() => {
    if (hashTagFilter) {
      history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#tag=${encodeURIComponent(hashTagFilter)}`,
      );
    } else {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }, [hashTagFilter]);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash;
      if (!hash || hash === '#') setHashTagFilter(null);
      else if (hash.startsWith('#tag=')) setHashTagFilter(decodeURIComponent(hash.slice(5)));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [setHashTagFilter]);

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
  useEffect(() => {
    setFetchPeriod('');
  }, [channel.id]);

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

  // ── Hotkeys: ↑/↓ navigate, Space = mark read + advance ───────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement).isContentEditable) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (displayItems.length === 0) return;
        if (!selectedNewsId) {
          setSelectedNewsId(displayItems[0].id);
          return;
        }
        const idx = displayItems.findIndex((n) => n.id === selectedNewsId);
        if (e.key === 'ArrowDown' && idx < displayItems.length - 1) setSelectedNewsId(displayItems[idx + 1].id);
        if (e.key === 'ArrowUp' && idx > 0) setSelectedNewsId(displayItems[idx - 1].id);
        return;
      }
      if (e.key === ' ' && selectedNewsId) {
        e.preventDefault();
        const item = displayItems.find((n) => n.id === selectedNewsId);
        if (!item) return;
        if (item.isRead === 0) {
          markRead.mutate({ id: item.id, isRead: 1 }, { onSuccess: () => handleMarkedRead(item.id) });
        } else {
          const idx = displayItems.findIndex((n) => n.id === selectedNewsId);
          const next = displayItems.slice(idx + 1).find((n) => n.isRead === 0);
          if (next) setSelectedNewsId(next.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [displayItems, selectedNewsId, setSelectedNewsId, markRead, handleMarkedRead]);

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
      ?.scrollIntoView({ behavior: 'smooth', block: newsViewMode === 'accordion' ? 'start' : 'center' });
  }, [selectedNewsId, newsViewMode]);

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
      />

      <div className={`news-feed__body${newsViewMode === 'accordion' ? ' news-feed__body--accordion' : ''}`}>
        {newsViewMode === 'accordion' ? (
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
                <NewsDetail
                  key={selectedItem.id}
                  item={selectedItem}
                  channelType={channel.channelType}
                  onMarkedRead={handleMarkedRead}
                />
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
