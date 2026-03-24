import React from 'react';
import { Button, Space, Badge, Typography } from 'antd';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';
import { ReloadOutlined, EditOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { Channel } from '@shared/types.ts';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  item: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    margin: 2px 6px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
    --actions-opacity: 0;
    &:hover {
      background: ${token.colorFillTertiary};
      --actions-opacity: 1;
    }
    &:focus-visible {
      outline: 2px solid ${token.colorPrimary};
      outline-offset: -2px;
      --actions-opacity: 1;
    }
    &:focus-within {
      --actions-opacity: 1;
    }
  `,
  itemActive: css`
    background: ${token.colorPrimaryBg};
    --actions-opacity: 1;
  `,
  info: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  `,
  actions: css`
    flex-shrink: 0;
    opacity: var(--actions-opacity, 0);
    transition: opacity 0.15s;
  `,
  rightSide: css`
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  `,
  warningIcon: css`
    color: ${token.colorError};
    margin-right: 4px;
  `,
  metaText: css`
    font-size: 11px;
  `,
}));

interface ChannelItemProps {
  channel: Channel;
  isSelected: boolean;
  isFetchingThis: boolean;
  unreadCount: number;
  onSelect: () => void;
  onFetch: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

export function ChannelItem({
  channel: ch,
  isSelected,
  isFetchingThis,
  unreadCount,
  onSelect,
  onFetch,
  onEdit,
  onDelete,
}: ChannelItemProps) {
  const { t } = useTranslation();
  const { styles, cx } = useStyles();

  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      className={cx(styles.item, isSelected && styles.itemActive)}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className={styles.info}>
        <Text strong ellipsis>
          {ch.isUnavailable ? (
            <Tooltip title={t('channels.unavailable_tooltip')}>
              <WarningOutlined className={styles.warningIcon} />
            </Tooltip>
          ) : null}
          {ch.name}
        </Text>
        <Text type="secondary" className={styles.metaText}>
          @{ch.telegramId}
        </Text>
        {ch.lastFetchedAt && (
          <Text type="secondary" className={styles.metaText}>
            {t('channels.updated', { date: dayjs.unix(ch.lastFetchedAt).format('DD.MM.YY HH:mm') })}
          </Text>
        )}
      </div>
      <div className={styles.rightSide}>
        <Space className={styles.actions} size={4}>
          <Tooltip title={t('channels.fetch_tooltip')}>
            <Button icon={<ReloadOutlined />} size="small" type="text" loading={isFetchingThis} onClick={onFetch} />
          </Tooltip>
          <Tooltip title={t('channels.edit_tooltip')}>
            <Button icon={<EditOutlined />} size="small" type="text" onClick={onEdit} />
          </Tooltip>
          <Tooltip title={t('channels.delete_tooltip')}>
            <Button icon={<DeleteOutlined />} size="small" type="text" danger onClick={onDelete} />
          </Tooltip>
        </Space>
        <Badge count={unreadCount} size="small" />
      </div>
    </div>
  );
}
