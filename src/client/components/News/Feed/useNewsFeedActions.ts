/**
 * useNewsFeedActions — handlers: mark read, fetch, tag, auto-advance.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import type { Channel, NewsItem } from '../../../../shared/types';
import { useMarkAllRead, useMarkRead } from '../../../api/news';
import { useCreateFilter } from '../../../api/filters';
import { useFetchChannel, useChannels, useMarkReadAndFetch } from '../../../api/channels';
import { useUIStore } from '../../../store/uiStore';

export function useNewsFeedActions(
  channel: Channel,
  displayItems: NewsItem[],
  unreadCount: number,
  serverFilteredOut: number,
  setMediaProgressKey: React.Dispatch<React.SetStateAction<number>>,
) {
  const { message } = App.useApp();
  const { t } = useTranslation();
  const { setSelectedNewsId, showAll, setSelectedChannelId, autoAdvance } = useUIStore();
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
    setSelectedChannelId(next.id);
  }, [allChannels, channel.id, channel.groupId, setSelectedChannelId]);

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
        if (!showAll && remainingVisible.length === 0 && serverFilteredOut > 0) markAllRead.mutate(channel.id);
      }
    },
    [displayItems, setSelectedNewsId, showAll, serverFilteredOut, markAllRead, channel.id],
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
  const handleMarkAllReadAndAdvance = useCallback(() => {
    if (!autoAdvance) {
      markAllRead.mutate(channel.id);
      return;
    }
    markReadAndFetch.mutate(channel.id, {
      onSuccess: (data) => {
        if (data.mediaProcessing) setMediaProgressKey((k) => k + 1);
        if (data.inserted === 0) goToNextChannel();
      },
    });
  }, [autoAdvance, markAllRead, channel.id, markReadAndFetch, goToNextChannel, setMediaProgressKey]);

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
