import React from 'react';
import { Button, Space, Typography, Badge, Tag, Segmented } from 'antd';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';
import {
  FilterOutlined,
  EyeOutlined,
  CheckSquareOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  HistoryOutlined,
  LayoutOutlined,
  ProfileOutlined,
} from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { NewsViewMode } from '../../store/uiStore';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  toolbar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 16px;
    flex-shrink: 0;
    background: ${token.colorBgContainer};
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  divider: css`
    width: 1px;
    height: 1.4em;
    background: ${token.colorBorderSecondary};
    margin: 0 2px;
    flex-shrink: 0;
    align-self: center;
  `,
  hashTag: css`
    font-size: 13px;
    padding: 2px 8px;
  `,
  stats: css`
    font-size: 12px;
  `,
}));

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
  newsViewMode: NewsViewMode;
  onSetViewMode: (mode: NewsViewMode) => void;
  isMobile?: boolean;
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
  newsViewMode,
  onSetViewMode,
  isMobile = false,
}: NewsFeedToolbarProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  const periodOptions = [
    { value: '1', label: t('news.period.1d') },
    { value: '3', label: t('news.period.3d') },
    { value: '5', label: t('news.period.5d') },
    { value: '7', label: t('news.period.7d') },
    { value: '14', label: t('news.period.14d') },
    {
      value: 'sync',
      label: (
        <Tooltip title={t('news.period.sync_tooltip')}>
          <HistoryOutlined />
        </Tooltip>
      ),
    },
  ];

  return (
    <div className={styles.toolbar}>
      <Space wrap>
        <Tooltip title={t('news.toolbar.fetch_default_tooltip')}>
          <Button icon={<SyncOutlined />} onClick={onFetchDefault} loading={fetchPending} />
        </Tooltip>
        <Segmented options={periodOptions} value={fetchPeriod} onChange={onFetchPeriod} disabled={fetchPending} />
        <Tooltip title={t('news.toolbar.show_all_tooltip')}>
          <Button icon={<EyeOutlined />} type={showAll ? 'primary' : 'default'} onClick={onToggleShowAll}>
            {showAll ? t('news.toolbar.hide_filtered') : t('news.toolbar.show_all')}
          </Button>
        </Tooltip>
        <Tooltip title={t('news.toolbar.mark_all_read_tooltip')}>
          <Button icon={<CheckSquareOutlined />} onClick={onMarkAllRead} loading={markAllPending}>
            {t('news.toolbar.mark_all_read')}
          </Button>
        </Tooltip>
        <Badge count={activeFilterCount} size="small">
          <Tooltip title={t('news.toolbar.filter_tooltip')}>
            <Button icon={<FilterOutlined />} onClick={onOpenFilters}>
              {t('news.toolbar.filter')}
            </Button>
          </Tooltip>
        </Badge>
        {hashTagFilter && (
          <Tag color="blue" closeIcon={<CloseCircleOutlined />} onClose={onClearHashTag} className={styles.hashTag}>
            {hashTagFilter}
          </Tag>
        )}
        {!isMobile && (
          <>
            <div className={styles.divider} />
            <Tooltip title={t('news.toolbar.view_list')}>
              <Button
                size="small"
                icon={<LayoutOutlined />}
                type={newsViewMode === 'list' ? 'primary' : 'default'}
                onClick={() => onSetViewMode('list')}
              />
            </Tooltip>
            <Tooltip title={t('news.toolbar.view_accordion')}>
              <Button
                size="small"
                icon={<ProfileOutlined />}
                type={newsViewMode === 'accordion' ? 'primary' : 'default'}
                onClick={() => onSetViewMode('accordion')}
              />
            </Tooltip>
          </>
        )}
      </Space>

      <Space size={12} className={styles.stats}>
        <Text type="secondary">{t('news.toolbar.shown', { count: shownCount })}</Text>
        {hiddenCount > 0 && <Text type="secondary">{t('news.toolbar.hidden', { count: hiddenCount })}</Text>}
        <Text type="secondary">{t('news.toolbar.total', { count: totalCount })}</Text>
        {unreadCount > 0 && <Text type="secondary">{t('news.toolbar.unread', { count: unreadCount })}</Text>}
      </Space>
    </div>
  );
}
