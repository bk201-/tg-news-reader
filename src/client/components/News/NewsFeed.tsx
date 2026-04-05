import React, { useMemo, useEffect, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { App, Empty, Button } from 'antd';
import { ArrowDownOutlined, VerticalAlignTopOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { Channel } from '../../../shared/types';
import { useNews, useMarkAllRead, useMarkRead } from '../../api/news';
import { useFilters, useCreateFilter } from '../../api/filters';
import { useFetchChannel, useChannels } from '../../api/channels';
import { useUIStore } from '../../store/uiStore';
import { applyFilters } from './NewsListItem';
import { NewsDetail } from './NewsDetail';
import { FilterPanel } from '../Filters/FilterPanel';
import { NewsFeedToolbar } from './NewsFeedToolbar';
import { NewsFeedList } from './NewsFeedList';
import { NewsAccordionList } from './NewsAccordionList';
import { DigestDrawer } from './DigestDrawer';
import { LightboxOverlay } from './LightboxOverlay';
import { useHashTagSync } from './useHashTagSync';
import { useNewsHotkeys } from './useNewsHotkeys';
import { useNewsFeedHotkeys } from './useNewsFeedHotkeys';
import { useIsXl, BP_XL } from '../../hooks/breakpoints';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useMediaProgressSSE } from '../../api/mediaProgress';
import type { VirtuosoHandle } from 'react-virtuoso';

const useStyles = createStyles(({ css, token }) => ({
  feed: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    /* Mobile: parent is the scroll container */
    @media (max-width: ${BP_XL - 1}px) {
      height: auto;
      overflow: visible;
    }
  `,
  // Toolbar wrapper: sticky on mobile so it pins to top after header scrolls away
  toolbarWrapper: css`
    flex-shrink: 0;
    @media (max-width: ${BP_XL - 1}px) {
      position: sticky;
      top: 0;
      z-index: 50;
      background: ${token.colorBgContainer};
    }
  `,
  // 1px sentinel placed AFTER toolbar — IO watches it to decide when to show the FAB
  topSentinel: css`
    height: 1px;
    flex-shrink: 0;
    pointer-events: none;
  `,
  body: css`
    display: flex;
    flex: 1;
    overflow: hidden;
    @media (max-width: ${BP_XL - 1}px) {
      flex: none;
      overflow: visible;
    }
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
  // Scroll-to-top FAB: initially hidden, DOM-mutated when sentinel exits viewport
  scrollTopBtn: css`
    position: fixed;
    bottom: 24px;
    right: 16px;
    z-index: 99;
    opacity: 0;
    pointer-events: none;
    transform: translateY(8px);
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
    box-shadow: ${token.boxShadow};
  `,
  // Pull-to-refresh indicator — slides down from above the viewport.
  // Initial transform is set programmatically by usePullToRefresh (translateY(-height)).
  ptrIndicator: css`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1001;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 16px;
    background: ${token.colorBgElevated};
    border-bottom: 1px solid ${token.colorBorderSecondary};
    color: ${token.colorText};
    font-size: 13px;
    opacity: 0;
    pointer-events: none;
    box-shadow: ${token.boxShadowSecondary};
  `,
}));

interface NewsFeedProps {
  channel: Channel;
  /** Passed from AppLayout in mobile mode — the single scroll container */
  mobileScrollContainerRef?: React.RefObject<HTMLElement | null>;
}

export function NewsFeed({ channel, mobileScrollContainerRef }: NewsFeedProps) {
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
  } = useUIStore();

  const { styles, cx } = useStyles();
  const forceAccordion = !useIsXl();
  const effectiveViewMode = forceAccordion ? 'accordion' : newsViewMode;

  const { hashTagFilter, setHashTagFilter } = useHashTagSync(channel.id);

  const { data: allChannels = [] } = useChannels();

  const { data: newsData, isLoading } = useNews(channel.id, !showAll);
  const newsItems = newsData?.items ?? [];
  const serverFilteredOut = newsData?.filteredOut ?? 0;
  const { data: filters = [] } = useFilters(channel.id);
  const markAllRead = useMarkAllRead();
  const markRead = useMarkRead();
  const fetchChannel = useFetchChannel();
  const createFilter = useCreateFilter(channel.id);

  // Advance to the next channel with unread items, cycling within the same group.
  const goToNextChannelWithUnread = useCallback(() => {
    // All channels in the same group, sorted by sortOrder
    const sameGroup = allChannels
      .filter((ch) => (ch.groupId ?? null) === (channel.groupId ?? null))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const currentIdx = sameGroup.findIndex((ch) => ch.id === channel.id);
    if (currentIdx === -1 || sameGroup.length <= 1) return;

    // Circular search forward for a channel with unread
    for (let i = 1; i < sameGroup.length; i++) {
      const ch = sameGroup[(currentIdx + i) % sameGroup.length];
      if (ch.unreadCount > 0) {
        setSelectedChannelId(ch.id);
        return;
      }
    }
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

  // Called after fetch completes: if mediaProcessing → reconnect SSE; if no new + no unread → go next.
  const onFetchSuccess = useCallback(
    (data: { inserted: number; mediaProcessing?: boolean }) => {
      if (data.mediaProcessing) {
        setMediaProgressKey((k) => k + 1);
      }
      if (data.inserted === 0 && unreadCount === 0) {
        goToNextChannelWithUnread();
      }
    },
    [goToNextChannelWithUnread, unreadCount],
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
    [setHashTagFilter, setShowAll, createFilter, message],
  );

  const [digestOpen, setDigestOpen] = useState(false);
  const [fetchPeriod, setFetchPeriod] = useState<string>('');
  const [mediaProgressKey, setMediaProgressKey] = useState(0);
  useEffect(() => {
    setFetchPeriod('');
  }, [channel.id]);

  const handleFetchDefault = useCallback(() => {
    setFetchPeriod('');
    fetchChannel.mutate({ id: channel.id }, { onSuccess: onFetchSuccess });
  }, [channel.id, fetchChannel, onFetchSuccess]);

  // ── Refs ──────────────────────────────────────────────────────────────
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const ptrBaseRef = useRef<HTMLElement>(null); // dummy fallback when mobileScrollContainerRef absent
  const scrollTopBtnRef = useRef<HTMLButtonElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const ptrRef = useRef<HTMLDivElement>(null);

  // ── Scroll-to-top FAB visibility via viewport IO on post-toolbar sentinel ─
  // Fires when the 1px sentinel (placed after the sticky toolbar) exits the viewport.
  // This means header + toolbar have scrolled off → show the FAB.
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

  // ── Pull-to-refresh: attaches to mobile scroll container ──────────────
  usePullToRefresh(
    mobileScrollContainerRef ?? ptrBaseRef,
    ptrRef,
    handleFetchDefault,
    forceAccordion,
    t('news.ptr.pull'),
    t('news.ptr.release'),
  );

  // ── Media progress SSE: real-time localMediaPath updates during bulk download ──
  useMediaProgressSSE(channel.id, mediaProgressKey);

  // ── Auto-fetch on channel open ────────────────────────────────────────
  // Always fetch latest messages when switching to a channel — the server
  // uses lastFetchedAt as the boundary so only truly new messages are loaded.
  useEffect(() => {
    fetchChannel.mutate({ id: channel.id }, { onSuccess: onFetchSuccess });
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
  // In accordion mode the item expands AFTER the state update, so we must delay
  // the scroll until after the expansion paint to avoid the browser re-settling
  // in the middle. We also use align:'start' since we always want item at the top.
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
    if (forceAccordion && mobileScrollContainerRef?.current) {
      mobileScrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      virtuosoRef.current?.scrollToIndex({ index: 0, behavior: 'smooth', align: 'start' });
    }
  }, [forceAccordion, mobileScrollContainerRef]);

  // ── Shared toolbar props ──────────────────────────────────────────────
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

  return (
    <div className={styles.feed}>
      {/* Toolbar wrapper: sticky top:0 on mobile via CSS @media */}
      <div className={styles.toolbarWrapper}>
        <NewsFeedToolbar {...toolbarProps} />
      </div>

      {/* Sentinel: 1px after toolbar — IO watches this to show/hide scroll-to-top FAB */}
      {forceAccordion && <div ref={topSentinelRef} className={styles.topSentinel} />}

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
            virtuosoRef={virtuosoRef}
            mobileScrollContainerRef={mobileScrollContainerRef}
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
              virtuosoRef={virtuosoRef}
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

      {/* PTR + FAB portaled to body — bypasses any transform ancestor */}
      {forceAccordion &&
        createPortal(
          <>
            <div ref={ptrRef} className={styles.ptrIndicator}>
              <ArrowDownOutlined data-ptr-icon />
              <span data-ptr-text>{t('news.ptr.pull')}</span>
            </div>
            <Button
              ref={scrollTopBtnRef}
              type="primary"
              shape="circle"
              size="large"
              icon={<VerticalAlignTopOutlined />}
              className={styles.scrollTopBtn}
              onClick={scrollToTop}
              aria-label="Scroll to top"
            />
          </>,
          document.body,
        )}

      <FilterPanel channelId={channel.id} />
      <DigestDrawer open={digestOpen} params={{ channelIds: [channel.id] }} onClose={() => setDigestOpen(false)} />
      <LightboxOverlay />
    </div>
  );
}
