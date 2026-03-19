import React from 'react';
import { Button, Space, Typography, Tooltip, Badge, Tag, Segmented } from 'antd';
import {
  FilterOutlined,
  EyeOutlined,
  CheckSquareOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  HistoryOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

const PERIOD_OPTIONS = [
  { value: '1', label: '1д' },
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

interface NewsFeedToolbarProps {
  fetchPending: boolean;
  fetchPeriod: string;
  onFetchDefault: () => void;
  onFetchPeriod: (val: string | number) => void;
  showAll: boolean;
  onToggleShowAll: () => void;
  markAllPending: boolean;
  onMarkAllRead: () => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  hashTagFilter: string | null;
  onClearHashTag: () => void;
  shownCount: number;
  hiddenCount: number;
  totalCount: number;
  unreadCount: number;
}

export function NewsFeedToolbar({
  fetchPending,
  fetchPeriod,
  onFetchDefault,
  onFetchPeriod,
  showAll,
  onToggleShowAll,
  markAllPending,
  onMarkAllRead,
  activeFilterCount,
  onOpenFilters,
  hashTagFilter,
  onClearHashTag,
  shownCount,
  hiddenCount,
  totalCount,
  unreadCount,
}: NewsFeedToolbarProps) {
  return (
    <div className="news-feed__toolbar">
      <Space wrap>
        <Tooltip title="Выгрузить с последнего прочитанного">
          <Button icon={<SyncOutlined />} onClick={onFetchDefault} loading={fetchPending} />
        </Tooltip>
        <Segmented options={PERIOD_OPTIONS} value={fetchPeriod} onChange={onFetchPeriod} disabled={fetchPending} />
        <Tooltip title={showAll ? 'Скрыть отфильтрованные' : 'Показать все'}>
          <Button icon={<EyeOutlined />} type={showAll ? 'primary' : 'default'} onClick={onToggleShowAll}>
            {showAll ? 'Только отфильтрованные' : 'Показать все'}
          </Button>
        </Tooltip>
        <Tooltip title="Отметить все прочитанными и очистить список">
          <Button icon={<CheckSquareOutlined />} onClick={onMarkAllRead} loading={markAllPending}>
            Прочитать все
          </Button>
        </Tooltip>
        <Badge count={activeFilterCount} size="small">
          <Tooltip title="Фильтры">
            <Button icon={<FilterOutlined />} onClick={onOpenFilters}>
              Фильтр
            </Button>
          </Tooltip>
        </Badge>
        {hashTagFilter && (
          <Tag
            color="blue"
            closeIcon={<CloseCircleOutlined />}
            onClose={onClearHashTag}
            style={{ fontSize: 13, padding: '2px 8px' }}
          >
            {hashTagFilter}
          </Tag>
        )}
      </Space>

      <Space size={12} style={{ fontSize: 12 }}>
        <Text type="secondary">
          Показано: <strong>{shownCount}</strong>
        </Text>
        {hiddenCount > 0 && (
          <Text type="secondary">
            Скрыто: <strong>{hiddenCount}</strong>
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
  );
}
