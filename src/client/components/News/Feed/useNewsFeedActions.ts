/**
 * useNewsFeedActions — handlers: mark read, fetch, tag, auto-advance.
 */

import { App } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Channel, NewsItem } from '../../../../shared/types';
import { useChannels, useFetchChannel, useMarkReadAndFetch } from '../../../api/channels';
import { useCreateFilter } from '../../../api/filters';
import { useMarkAllRead, useMarkRead } from '../../../api/news';
import type { MarkAllReadResult } from '../../../api/news';
import { useUIStore } from '../../../store/uiStore';

/**
 * Snapshot of the most recent bulk mark-all-read action — used to implement the
 * "click twice to undo" toggle requested by users who accidentally hit the button.
 *
 * The snapshot is invalidated whenever the user changes channel, group, or hashtag
 * filter so that the next click in a new context is always a fresh "mark", never
 * a stray "unmark".
 */
interface BulkMarkSnapshot {
  affectedIds: number[];
  channelId: number;
  groupId: number | null;
  hashTagFilter: string | null;
}

export function useNewsFeedActions(
  channel: Channel,
  displayItems: NewsItem[],
  unreadCount: number,
  serverFilteredOut: number,
  setMediaProgressKey: React.Dispatch<React.SetStateAction<number>>,
) {
  const { message } = App.useApp();
  const { t } = useTranslation();
  const {
    setSelectedNewsId,
    newsFilterMode,
    setSelectedChannelId,
    autoAdvance,
    hashTagFilter,
    requestAutoSelectFirst,
  } = useUIStore();
  const { data: allChannels = [] } = useChannels();

  const markAllRead = useMarkAllRead();
  const markRead = useMarkRead();
  const fetchChannel = useFetchChannel();
  const createFilter = useCreateFilter(channel.id);
  const markReadAndFetch = useMarkReadAndFetch();

  // fetchPeriod resets on channel change: [channelId, period] tuple — React
  // setState in render is fine when gated by a value comparison (see React docs
  // "Adjusting state based on props").
  const [fetchPeriodState, setFetchPeriodState] = useState<[number, string]>([channel.id, '']);
  const fetchPeriod = fetchPeriodState[0] === channel.id ? fetchPeriodState[1] : '';
  const setFetchPeriod = useCallback((v: string) => setFetchPeriodState([channel.id, v]), [channel.id]);

  // Advance to the next channel in order (circular), regardless of unread count.
  const goToNextChannel = useCallback(() => {
    const sameGroup = allChannels
      .filter((ch) => (ch.groupId ?? null) === (channel.groupId ?? null))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const currentIdx = sameGroup.findIndex((ch) => ch.id === channel.id);
    if (currentIdx === -1 || sameGroup.length <= 1) return;

    const next = sameGroup[(currentIdx + 1) % sameGroup.length];
    // Ask the feed to select the first news item once the new channel loads,
    // so auto-advance actually lands the user on something to read.
    requestAutoSelectFirst();
    setSelectedChannelId(next.id);
  }, [allChannels, channel.id, channel.groupId, setSelectedChannelId, requestAutoSelectFirst]);

  // Called after a USER-TRIGGERED fetch (button, double-space at end).
  const onUserFetchSuccess = useCallback(
    (data: { inserted: number; mediaProcessing?: boolean }) => {
      if (data.mediaProcessing) {
        setMediaProgressKey((k) => k + 1);
      }
      if (autoAdvance && data.inserted === 0 && unreadCount === 0) {
        goToNextChannel();
      }
    },
    [goToNextChannel, unreadCount, autoAdvance, setMediaProgressKey],
  );

  const handleMarkedRead = useCallback(
    (currentId: number) => {
      const currentIndex = displayItems.findIndex((item) => item.id === currentId);
      const nextUnread = displayItems.slice(currentIndex + 1).find((item) => item.isRead === 0);
      if (nextUnread) {
        setSelectedNewsId(nextUnread.id);
      } else {
        const remainingVisible = displayItems.filter((item) => item.id !== currentId && item.isRead === 0);
        // When a hashtag filter is active, the items hidden from view are NOT user-filtered junk —
        // they're news that simply don't match the current tag. Marking the whole channel as read
        // here would silently lose all of them. Only "consume" server-filtered items (junk filters)
        // when no tag filter is narrowing the view AND we're in the default 'filtered' mode
        // (not 'all' — user already sees everything, no need to sweep; not 'hidden' — user is
        // intentionally working through hidden items only, don't touch the visible ones).
        if (!hashTagFilter && newsFilterMode === 'filtered' && remainingVisible.length === 0 && serverFilteredOut > 0)
          markAllRead.mutate({ channelId: channel.id });
      }
    },
    [displayItems, setSelectedNewsId, newsFilterMode, serverFilteredOut, markAllRead, channel.id, hashTagFilter],
  );

  const handleTagClick = useCallback(
    (tag: string, action: 'show' | 'addFilter') => {
      if (action === 'show') {
        // setHashTagFilter is managed externally by the caller
      } else {
        void createFilter
          .mutateAsync({ name: tag, type: 'tag', value: tag.toLowerCase() })
          .then(() => void message.success(t('news.list.tag_added_toast', { tag })));
      }
    },
    [createFilter, message, t],
  );

  const handleFetchDefault = useCallback(() => {
    setFetchPeriod('');
    fetchChannel.mutate({ id: channel.id }, { onSuccess: onUserFetchSuccess });
  }, [channel.id, fetchChannel, onUserFetchSuccess, setFetchPeriod]);

  // Stable ref for the auto-fetch callback — avoids re-triggering the effect
  // when fetchChannel/setMediaProgressKey change identity across renders.
  const autoFetchRef = useRef({ fetchChannel, setMediaProgressKey });
  useEffect(() => {
    autoFetchRef.current = { fetchChannel, setMediaProgressKey };
  });

  // ── Auto-fetch on channel open ────────────────────────────────────────
  useEffect(() => {
    const { fetchChannel: fc, setMediaProgressKey: smpk } = autoFetchRef.current;
    fc.mutate(
      { id: channel.id },
      {
        onSuccess: (data) => {
          if (data.mediaProcessing) smpk((k) => k + 1);
        },
      },
    );
  }, [channel.id]);

  const handleFetchPeriod = useCallback(
    (val: string | number) => {
      const v = String(val);
      setFetchPeriod(v);
      const since = new Date();
      since.setDate(since.getDate() - parseInt(v, 10));
      since.setHours(0, 0, 0, 0);
      fetchChannel.mutate({ id: channel.id, since: since.toISOString() }, { onSuccess: onUserFetchSuccess });
    },
    [channel.id, fetchChannel, onUserFetchSuccess, setFetchPeriod],
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

  // ── Mark all read (+ auto-advance when enabled) ─────────────────────
  //
  // Toggle behaviour: if the previous click already bulk-marked items in the
  // current channel/group/hashtag context, this click sends `isRead: 0` for
  // those exact IDs (undo). The snapshot is cleared by an effect below
  // whenever the user changes channel / group / hashtag.
  //
  // Note: the `markReadAndFetch` (autoAdvance) path is NOT toggled — it usually
  // navigates to the next channel, which clears the snapshot anyway.
  const [lastBulkMark, setLastBulkMark] = useState<BulkMarkSnapshot | null>(null);

  // Reset the snapshot whenever the context the user is looking at changes.
  // Watching channel.id covers channel switches; channel.groupId covers a
  // moved-into-group case; hashTagFilter covers the tag-filter pill toggle.
  useEffect(() => {
    setLastBulkMark(null);
  }, [channel.id, channel.groupId, hashTagFilter]);

  const captureBulkMark = useCallback(
    (result: MarkAllReadResult) => {
      if (result.affectedIds.length === 0) {
        // Nothing was actually flipped (everything was already read) — leave the
        // snapshot empty so the next click triggers a normal mark, not a no-op undo.
        setLastBulkMark(null);
        return;
      }
      setLastBulkMark({
        affectedIds: result.affectedIds,
        channelId: channel.id,
        groupId: channel.groupId ?? null,
        hashTagFilter,
      });
    },
    [channel.id, channel.groupId, hashTagFilter],
  );

  const handleMarkAllReadAndAdvance = useCallback(() => {
    // ── Undo: previous click bulk-marked items; this click reverts them ──────
    if (lastBulkMark && lastBulkMark.affectedIds.length > 0) {
      markAllRead.mutate({ newsIds: lastBulkMark.affectedIds, isRead: 0 });
      setLastBulkMark(null);
      return;
    }

    // When tag filter is active — only mark the currently visible items, no auto-advance
    if (hashTagFilter) {
      markAllRead.mutate({ newsIds: displayItems.map((i) => i.id) }, { onSuccess: captureBulkMark });
      return;
    }

    // 'hidden' mode: user is intentionally viewing only the filter-rejected items.
    // Mark just the currently loaded hidden items, don't sweep the whole channel.
    if (newsFilterMode === 'hidden') {
      if (displayItems.length === 0) return;
      markAllRead.mutate({ newsIds: displayItems.map((i) => i.id) }, { onSuccess: captureBulkMark });
      return;
    }

    if (!autoAdvance) {
      markAllRead.mutate({ channelId: channel.id }, { onSuccess: captureBulkMark });
      return;
    }
    markReadAndFetch.mutate(channel.id, {
      onSuccess: (data) => {
        if (data.mediaProcessing) setMediaProgressKey((k) => k + 1);
        if (data.inserted === 0) goToNextChannel();
      },
    });
  }, [
    lastBulkMark,
    hashTagFilter,
    newsFilterMode,
    autoAdvance,
    markAllRead,
    channel.id,
    markReadAndFetch,
    goToNextChannel,
    setMediaProgressKey,
    displayItems,
    captureBulkMark,
  ]);

  return {
    fetchChannel,
    markAllRead,
    markReadAndFetch,
    markRead,
    fetchPeriod,
    handleMarkedRead,
    handleTagClick,
    handleFetchDefault,
    handleFetchPeriod,
    handleSpaceKey,
    handleMarkAllReadAndAdvance,
    goToNextChannel,
  };
}
