import React, { useState } from 'react';
import { Button, Space, Typography, Tag, Segmented, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
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
  BulbOutlined,
  LinkOutlined,
  MoreOutlined,
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
  toolbarCompact: css`
    padding: 6px 10px;
    gap: 4px;
    flex-wrap: nowrap;
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
  hashTagCompact: css`
    font-size: 12px;
    padding: 0 6px;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  stats: css`
    font-size: 12px;
  `,
  statsCompact: css`
    font-size: 11px;
    white-space: nowrap;
    flex-shrink: 0;
  `,
  periodCompact: css`
    display: none; /* kept for compatibility */
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
  onOpenDigest: () => void;
  /** Whether to show the Digest button (false for media-only channels) */
  showDigest?: boolean;
  /** Telegram ID of the current channel, used to render an "Open in Telegram" link */
  channelTelegramId?: string;
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
  activeFilterCount: _activeFilterCount,
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
  onOpenDigest,
  showDigest = true,
  channelTelegramId,
}: NewsFeedToolbarProps) {
  const { t } = useTranslation();
  const { styles, cx } = useStyles();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleFetchPeriod = (val: string | number) => {
    setMenuOpen(false);
    onFetchPeriod(val);
  };

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

  // ── Compact mobile toolbar ───────────────────────────────────────────
  if (isMobile) {
    const statParts = [
      unreadCount > 0 && t('news.toolbar.unread', { count: unreadCount }),
      t('news.toolbar.total', { count: totalCount }),
      hiddenCount > 0 && t('news.toolbar.hidden', { count: hiddenCount }),
    ].filter(Boolean) as string[];

    const periodItems: MenuProps['items'] = [
      { key: 'p1', label: t('news.period.1d'), onClick: () => handleFetchPeriod('1') },
      { key: 'p3', label: t('news.period.3d'), onClick: () => handleFetchPeriod('3') },
      { key: 'p5', label: t('news.period.5d'), onClick: () => handleFetchPeriod('5') },
      { key: 'p7', label: t('news.period.7d'), onClick: () => handleFetchPeriod('7') },
      { key: 'p14', label: t('news.period.14d'), onClick: () => handleFetchPeriod('14') },
      { key: 'sync', label: t('news.period.sync_tooltip'), onClick: () => handleFetchPeriod('sync') },
    ];

    const menuItems: MenuProps['items'] = [
      {
        key: 'fetch',
        icon: <SyncOutlined />,
        label: t('news.toolbar.fetch_default_tooltip').replace(' · [U]', ''),
        onClick: onFetchDefault,
      },
      {
        key: 'fetch_period',
        icon: <HistoryOutlined />,
        label: t('news.toolbar.fetch_period'),
        children: periodItems,
      },
      { type: 'divider' },
      {
        key: 'toggle_all',
        icon: <EyeOutlined />,
        label: showAll ? t('news.toolbar.hide_filtered') : t('news.toolbar.show_all'),
        onClick: onToggleShowAll,
      },
      {
        key: 'mark_read',
        icon: <CheckSquareOutlined />,
        label: t('news.toolbar.mark_all_read'),
        onClick: onMarkAllRead,
      },
      {
        key: 'filters',
        icon: <FilterOutlined />,
        label: t('news.toolbar.filter'),
        onClick: onOpenFilters,
      },
      ...(channelTelegramId
        ? [
            {
              key: 'open_tg',
              icon: <LinkOutlined />,
              label: (
                <a href={`https://t.me/${channelTelegramId}`} target="_blank" rel="noopener noreferrer">
                  {t('channels.open_tg_tooltip')}
                </a>
              ),
            } as NonNullable<MenuProps['items']>[number],
          ]
        : []),
      ...(showDigest
        ? [{ key: 'digest', icon: <BulbOutlined />, label: t('digest.button'), onClick: onOpenDigest }]
        : []),
      ...(hashTagFilter
        ? [
            { type: 'divider' } as NonNullable<MenuProps['items']>[number],
            {
              key: 'clear_tag',
              icon: <CloseCircleOutlined />,
              label: t('news.toolbar.clear_tag', { tag: hashTagFilter }),
              onClick: onClearHashTag,
            } as NonNullable<MenuProps['items']>[number],
          ]
        : []),
    ];

    return (
      <div className={cx(styles.toolbar, styles.toolbarCompact)}>
        <Space size={6}>
          {hashTagFilter && (
            <Tag
              color="blue"
              closeIcon={<CloseCircleOutlined />}
              onClose={onClearHashTag}
              className={styles.hashTagCompact}
            >
              #{hashTagFilter}
            </Tag>
          )}
          <Text type="secondary" className={styles.statsCompact}>
            {statParts.join(' · ')}
          </Text>
        </Space>

        <Space size={4}>
          {/* Always-visible fetch button so loading state is obvious on mobile */}
          <Button type="text" icon={<SyncOutlined />} size="middle" loading={fetchPending} onClick={onFetchDefault} />
          <Dropdown
            open={menuOpen}
            onOpenChange={setMenuOpen}
            menu={{ items: menuItems }}
            trigger={['click']}
            placement="bottomRight"
          >
            <Button type="text" icon={<MoreOutlined />} size="middle" />
          </Dropdown>
        </Space>
      </div>
    );
  }

  // ── Default desktop toolbar ───────────────────────────────────────────
  return (
    <div className={styles.toolbar}>
      <Space wrap>
        <Tooltip title={t('news.toolbar.fetch_default_tooltip')}>
          <Button icon={<SyncOutlined />} onClick={onFetchDefault} loading={fetchPending} />
        </Tooltip>
        <Segmented options={periodOptions} value={fetchPeriod} onChange={onFetchPeriod} disabled={fetchPending} />
        {channelTelegramId && (
          <Tooltip title={t('channels.open_tg_tooltip')}>
            <Button
              size="small"
              icon={<LinkOutlined />}
              href={`https://t.me/${channelTelegramId}`}
              target="_blank"
              rel="noopener noreferrer"
            />
          </Tooltip>
        )}
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
        <Tooltip title={t('news.toolbar.filter_tooltip')}>
          <Button icon={<FilterOutlined />} onClick={onOpenFilters}>
            {t('news.toolbar.filter')}
          </Button>
        </Tooltip>
        {showDigest && (
          <Tooltip title={t('digest.tooltip')}>
            <Button icon={<BulbOutlined />} onClick={onOpenDigest}>
              {t('digest.button')}
            </Button>
          </Tooltip>
        )}
        {hashTagFilter && (
          <Tag color="blue" closeIcon={<CloseCircleOutlined />} onClose={onClearHashTag} className={styles.hashTag}>
            {hashTagFilter}
          </Tag>
        )}
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
