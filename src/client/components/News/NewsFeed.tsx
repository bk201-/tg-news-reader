import React, { useMemo, useEffect, useLayoutEffect, useCallback, useRef, useState } from 'react';
import { App, Empty, Grid } from 'antd';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
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
import { DigestDrawer } from './DigestDrawer';
import { useHashTagSync } from './useHashTagSync';
import { useNewsHotkeys } from './useNewsHotkeys';
import { useNewsFeedHotkeys } from './useNewsFeedHotkeys';

const useStyles = createStyles(({ css, token }) => ({
  feed: css`
    display: flex;
    flex-direction: column;
    height: calc(100vh - 64px);
    overflow: hidden;
    /* Below xxl breakpoint, parent Layout.Content controls height */
    @media (max-width: 1599px) {
      height: 100%;
    }
  `,
  body: css`
    display: flex;
    flex: 1;
    overflow: hidden;
  `,
  bodyAccordion: css`
    flex-direction: column;
  `,
  detail: css`
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: ${token.colorBgLayout};
  `,
  detailEmpty: css`
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
  `,
}));

interface NewsFeedProps {
  channel: Channel;
}

export function NewsFeed({ channel }: NewsFeedProps) {
  const { message } = App.useApp();
  const { t } = useTranslation();

  const { selectedNewsId, setSelectedNewsId, showAll, setShowAll, setFilterPanelOpen, newsViewMode, setNewsViewMode } =
    useUIStore();

  const screens = Grid.useBreakpoint();
  const { styles, cx } = useStyles();
  // screens.xl = true when ≥ 1200px → list view available; below → force accordion
  const forceAccordion = !screens.xl;
  const effectiveViewMode = forceAccordion ? 'accordion' : newsViewMode;

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
          .then(() => void message.success(t('news.list.tag_added_toast', { tag })));
      }
    },
    [setHashTagFilter, setShowAll, createFilter, message],
  );

  // ── Digest ────────────────────────────────────────────────────────────
  const [digestOpen, setDigestOpen] = useState(false);

  // ── Fetch period ──────────────────────────────────────────────────────
  const [fetchPeriod, setFetchPeriod] = useState<string>('');
  useEffect(() => {
    setFetchPeriod('');
  }, [channel.id]);

  const handleFetchDefault = useCallback(() => {
    setFetchPeriod('');
    fetchChannel.mutate({ id: channel.id }, { onSuccess: onFetchSuccess });
  }, [channel.id, fetchChannel, onFetchSuccess]);

  // ── Auto-fetch on channel open ────────────────────────────────────────
  // Safe now: NewsFeed stays mounted across breakpoint changes (AppLayout uses
  // single Splitter return), so this fires only when the user picks a different channel.
  useEffect(() => {
    fetchChannel.mutate({ id: channel.id }, { onSuccess: onFetchSuccess });
    // fetchChannel and onFetchSuccess are stable mutation refs — safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

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
        markRead.mutate(
          { id: item.id, isRead: 1, channelId: item.channelId },
          { onSuccess: () => handleMarkedRead(item.id) },
        );
      } else {
        const idx = displayItems.findIndex((n) => n.id === item.id);
        const next = displayItems.slice(idx + 1).find((n) => n.isRead === 0);
        if (next) {
          setSelectedNewsId(next.id);
        } else {
          // No more unread ahead — refresh channel (same as ↻ button)
          handleFetchDefault();
        }
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

  // ── Auto-mark read when selected post gets filtered out ───────────────
  useEffect(() => {
    if (showAll || !selectedNewsId) return;
    if (displayItems.some((n) => n.id === selectedNewsId)) return;
    const item = newsItems.find((n) => n.id === selectedNewsId);
    if (item && item.isRead === 0) markRead.mutate({ id: item.id, isRead: 1, channelId: item.channelId });
    // Navigate to the next unread item AFTER the current one (by newsItems order),
    // falling back to the first unread in displayItems.
    const currentIndex = newsItems.findIndex((n) => n.id === selectedNewsId);
    const nextUnread =
      displayItems.find((n) => newsItems.findIndex((m) => m.id === n.id) > currentIndex && n.isRead === 0) ??
      displayItems.find((n) => n.isRead === 0) ??
      null;
    setSelectedNewsId(nextUnread?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayItems]);

  // ── Scroll selected into view ─────────────────────────────────────────
  const listRef = useRef<HTMLDivElement>(null);
  // useLayoutEffect fires before the browser paints — no visible flash of wrong position.
  // el.offsetTop is the item's distance from .accordion top (which has position:relative,
  // so it's the offsetParent). Setting scrollTop = offsetTop puts the header at the top.
  useLayoutEffect(() => {
    if (!selectedNewsId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-news-id="${selectedNewsId}"]`);
    if (!el) return;
    if (effectiveViewMode === 'accordion') {
      listRef.current.scrollTop = el.offsetTop;
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedNewsId, effectiveViewMode]);

  return (
    <div className={styles.feed}>
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
        isMobile={forceAccordion}
        onOpenDigest={() => setDigestOpen(true)}
        showDigest={channel.supportsDigest}
      />

      <div className={cx(styles.body, effectiveViewMode === 'accordion' && styles.bodyAccordion)}>
        {effectiveViewMode === 'accordion' ? (
          <NewsAccordionList
            isLoading={isLoading}
            items={displayItems}
            filteredIds={filteredIds}
            showAll={showAll}
            selectedNewsId={selectedNewsId}
            hashTagFilter={hashTagFilter}
            activeFilterCount={activeFilterCount}
            channelTelegramId={channel.telegramId}
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
            <div className={styles.detail}>
              {selectedItem ? (
                <NewsDetail
                  key={selectedItem.id}
                  item={selectedItem}
                  channelTelegramId={channel.telegramId}
                  onMarkedRead={handleMarkedRead}
                  onTagClick={handleTagClick}
                />
              ) : (
                <div className={styles.detailEmpty}>
                  <Empty description={t('news.list.select_item')} />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <FilterPanel channelId={channel.id} />
      <DigestDrawer open={digestOpen} params={{ channelIds: [channel.id] }} onClose={() => setDigestOpen(false)} />
    </div>
  );
}
