import React from 'react';
import { Button, Space, Typography, Tag, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  FilterOutlined,
  EyeOutlined,
  CheckSquareOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  HistoryOutlined,
  BulbOutlined,
  LinkOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { NewsFeedToolbarProps } from './newsFeedToolbarTypes';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  toolbar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    gap: 4px;
    flex-wrap: nowrap;
    flex-shrink: 0;
    background: ${token.colorBgContainer};
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  hashTagCompact: css`
    font-size: 12px;
    padding: 0 6px;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  statsCompact: css`
    font-size: 11px;
    white-space: nowrap;
    flex-shrink: 0;
  `,
}));

export function NewsFeedToolbarMobile({
  fetchPending,
  onFetchDefault,
  onFetchPeriod,
  showAll,
  onToggleShowAll,
  onMarkAllRead,
  onOpenFilters,
  hashTagFilter,
  onClearHashTag,
  hiddenCount,
  totalCount,
  unreadCount,
  onOpenDigest,
  showDigest = true,
  channelTelegramId,
}: NewsFeedToolbarProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  const handleFetchPeriod = (val: string | number) => onFetchPeriod(val);

  const statParts = [
    unreadCount > 0 && t('news.toolbar.unread', { count: unreadCount }),
    t('news.toolbar.total', { count: totalCount }),
    hiddenCount > 0 && t('news.toolbar.hidden', { count: hiddenCount }),
  ].filter(Boolean) as string[];

  const menuItems: MenuProps['items'] = [
    {
      key: 'fetch',
      icon: <SyncOutlined />,
      label: t('news.toolbar.fetch_default_tooltip').replace(' · [U]', ''),
      onClick: onFetchDefault,
    },
    // Period items directly in the flat menu — avoids submenu close bug on mobile
    { type: 'divider' },
    { key: 'period_label', type: 'group', label: t('news.toolbar.fetch_period'), children: [] },
    { key: 'p1', label: t('news.period.1d'), onClick: () => handleFetchPeriod('1') },
    { key: 'p3', label: t('news.period.3d'), onClick: () => handleFetchPeriod('3') },
    { key: 'p5', label: t('news.period.5d'), onClick: () => handleFetchPeriod('5') },
    { key: 'p7', label: t('news.period.7d'), onClick: () => handleFetchPeriod('7') },
    { key: 'p14', label: t('news.period.14d'), onClick: () => handleFetchPeriod('14') },
    {
      key: 'sync',
      icon: <HistoryOutlined />,
      label: t('news.period.sync_tooltip'),
      onClick: () => handleFetchPeriod('sync'),
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
    <div className={styles.toolbar}>
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
        <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
          <Button type="text" icon={<MoreOutlined />} size="middle" />
        </Dropdown>
      </Space>
    </div>
  );
}
