import React, { useMemo, useEffect, useCallback, useRef, useState } from 'react';
import { Button, Space, Typography, Spin, Empty, Tooltip, Badge, Tag, App, Segmented } from 'antd';
import {
  FilterOutlined,
  EyeOutlined,
  CheckSquareOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import type { Channel } from '../../../shared/types';
import { useNews, useMarkAllRead } from '../../api/news';
import { useFilters, useCreateFilter } from '../../api/filters';
import { useFetchChannel } from '../../api/channels';
import { useMediaProgressSSE } from '../../api/mediaProgress';
import { useUIStore } from '../../store/uiStore';
import { NewsListItem, applyFilters } from './NewsListItem';
import { NewsDetail } from './NewsDetail';
import { FilterPanel } from '../Filters/FilterPanel';

const { Text } = Typography;

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
  } = useUIStore();

  const { data: newsData, isLoading } = useNews(channel.id, !showAll);
  const newsItems = newsData?.items ?? [];
  const serverFilteredOut = newsData?.filteredOut ?? 0;
  const { data: filters = [] } = useFilters(channel.id);
  const markAllRead = useMarkAllRead();
  const fetchChannel = useFetchChannel();
  const createFilter = useCreateFilter(channel.id);

  const [mediaProgressActive, setMediaProgressActive] = useState(false);
  const [sseKey, setSseKey] = useState(0);
  const [mediaProgress, setMediaProgress] = useState<{ done: number; total: number } | null>(null);

  useMediaProgressSSE(
    mediaProgressActive ? channel.id : null,
    sseKey,
    (done, total) => setMediaProgress({ done, total }),
    () => {
      setMediaProgressActive(false);
      setMediaProgress(null);
    },
  );

  // Reset SSE state when channel changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMediaProgressActive(false);
    setMediaProgress(null);
  }, [channel.id]);

  const onFetchSuccess = useCallback((data: { mediaProcessing?: boolean }) => {
    if (data.mediaProcessing) {
      setMediaProgressActive(true);
      setSseKey((k) => k + 1); // Force SSE reconnect even if already active
      setMediaProgress(null);
    }
  }, []);

  // Reset hash filter when channel changes
  useEffect(() => {
    setHashTagFilter(null);
  }, [channel.id, setHashTagFilter]);

  // Sync URL hash (write)
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

  // Listen for manual hash changes (e.g. user deletes hash from address bar)
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash;
      if (!hash || hash === '#') {
        setHashTagFilter(null);
      } else if (hash.startsWith('#tag=')) {
        setHashTagFilter(decodeURIComponent(hash.slice(5)));
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [setHashTagFilter]);

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
  // When server-side filtering is active (!showAll): server already excluded items, use serverFilteredOut.
  // When showAll: client computes dimmed items via applyFilters.
  const hiddenByFilters = showAll ? newsItems.length - filteredIds.size : serverFilteredOut;
  const totalCount = newsItems.length + (showAll ? 0 : serverFilteredOut);

  const handleMarkedRead = useCallback(
    (currentId: number) => {
      const currentIndex = displayItems.findIndex((item) => item.id === currentId);
      const nextUnread = displayItems.slice(currentIndex + 1).find((item) => item.isRead === 0);
      if (nextUnread) setSelectedNewsId(nextUnread.id);
    },
    [displayItems, setSelectedNewsId],
  );

  const handleTagClick = useCallback(
    (tag: string, action: 'show' | 'addFilter') => {
      if (action === 'show') {
        setHashTagFilter(tag);
        setShowAll(false);
      } else {
        void createFilter.mutateAsync({ name: tag, type: 'tag', value: tag.toLowerCase() }).then(() => {
          void message.success(`Тег ${tag} добавлен в фильтры`);
        });
      }
    },
    [setHashTagFilter, setShowAll, createFilter, message],
  );

  const handleMarkAllRead = () => {
    markAllRead.mutate(channel.id);
  };

  const [fetchPeriod, setFetchPeriod] = useState<string>('');

  // Reset period selection when channel changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        const days = parseInt(v, 10);
        const since = new Date();
        since.setDate(since.getDate() - days);
        since.setHours(0, 0, 0, 0);
        fetchChannel.mutate({ id: channel.id, since: since.toISOString() }, { onSuccess: onFetchSuccess });
      }
    },
    [channel.id, fetchChannel, onFetchSuccess],
  );

  const periodOptions = [
    { value: '3', label: '3д' },
    { value: '5', label: '5д' },
    { value: '7', label: '7д' },
    { value: '14', label: '14д' },
    {
      value: 'sync',
      label: (
        <Tooltip title="С последней синхронизации">
          <HistoryOutlined />
        </Tooltip>
      ),
    },
  ];

  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into center of the list
  useEffect(() => {
    if (!selectedNewsId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-news-id="${selectedNewsId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedNewsId]);

  return (
    <div className="news-feed">
      <div className="news-feed__toolbar">
        <Space wrap>
          <Tooltip title="Выгрузить с последнего прочитанного">
            <Button icon={<SyncOutlined />} onClick={handleFetchDefault} loading={fetchChannel.isPending} />
          </Tooltip>
          <Segmented
            options={periodOptions}
            value={fetchPeriod}
            onChange={handleFetchPeriod}
            disabled={fetchChannel.isPending}
          />
          <Tooltip title={showAll ? 'Скрыть отфильтрованные' : 'Показать все'}>
            <Button icon={<EyeOutlined />} type={showAll ? 'primary' : 'default'} onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Только отфильтрованные' : 'Показать все'}
            </Button>
          </Tooltip>
          <Tooltip title="Отметить все прочитанными и очистить список">
            <Button icon={<CheckSquareOutlined />} onClick={handleMarkAllRead} loading={markAllRead.isPending}>
              Прочитать все
            </Button>
          </Tooltip>
          <Badge count={activeFilterCount} size="small">
            <Tooltip title="Фильтры">
              <Button icon={<FilterOutlined />} onClick={() => setFilterPanelOpen(true)}>
                Фильтр
              </Button>
            </Tooltip>
          </Badge>
          {hashTagFilter && (
            <Tag
              color="blue"
              closeIcon={<CloseCircleOutlined />}
              onClose={() => setHashTagFilter(null)}
              style={{ fontSize: 13, padding: '2px 8px' }}
            >
              {hashTagFilter}
            </Tag>
          )}
        </Space>
        <Space size={12} style={{ fontSize: 12 }}>
          {mediaProgress && (
            <Text type="secondary">
              <LoadingOutlined style={{ marginRight: 4 }} />
              Медиа:{' '}
              <strong>
                {mediaProgress.done}/{mediaProgress.total}
              </strong>
            </Text>
          )}
          <Text type="secondary">
            Показано: <strong>{displayItems.length}</strong>
          </Text>
          {hiddenByFilters > 0 && (
            <Text type="secondary">
              Скрыто: <strong>{hiddenByFilters}</strong>
            </Text>
          )}
          <Text type="secondary">
            Всего: <strong>{totalCount}</strong>
          </Text>
          {unreadCount > 0 && (
            <Text type="secondary">
              Непрочит.: <strong>{unreadCount}</strong>
            </Text>
          )}
        </Space>
      </div>

      <div className="news-feed__body">
        <div className="news-feed__list" ref={listRef}>
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <Spin size="large" />
            </div>
          )}
          {!isLoading && displayItems.length === 0 && (
            <Empty
              description={
                hashTagFilter
                  ? `Нет новостей с тегом ${hashTagFilter}`
                  : activeFilterCount > 0
                    ? 'Нет новостей, соответствующих фильтрам. Нажмите "Показать все".'
                    : 'Нет новостей. Нажмите "Выгрузить".'
              }
              style={{ marginTop: 48 }}
            />
          )}
          {displayItems.map((item) => (
            <NewsListItem
              key={item.id}
              item={item}
              isSelected={selectedNewsId === item.id}
              isFiltered={filteredIds.has(item.id)}
              showAll={showAll}
              onClick={() => setSelectedNewsId(item.id)}
              onTagClick={handleTagClick}
            />
          ))}
        </div>

        <div className="news-feed__detail">
          {selectedItem ? (
            <NewsDetail item={selectedItem} channelType={channel.channelType} onMarkedRead={handleMarkedRead} />
          ) : (
            <div className="news-feed__detail-empty">
              <Empty description="Выберите новость из списка" />
            </div>
          )}
        </div>
      </div>

      <FilterPanel channelId={channel.id} />
    </div>
  );
}
