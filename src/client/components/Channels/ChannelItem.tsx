import React from 'react';
import { Button, Badge, Typography, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';
import {
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  WarningOutlined,
  LinkOutlined,
  MoreOutlined,
} from '@ant-design/icons';
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
    &:hover {
      background: ${token.colorFillTertiary};
    }
    &:focus-visible {
      outline: 2px solid ${token.colorPrimary};
      outline-offset: -2px;
    }
  `,
  itemActive: css`
    background: ${token.colorPrimaryBg};
  `,
  info: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
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
  onFetch: () => void;
  onEdit: () => void;
  onDelete: () => void;
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

  const menuItems: MenuProps['items'] = [
    {
      key: 'open',
      icon: <LinkOutlined />,
      label: (
        <a href={`https://t.me/${ch.telegramId}`} target="_blank" rel="noopener noreferrer">
          {t('channels.open_tg_tooltip')}
        </a>
      ),
    },
    {
      key: 'fetch',
      icon: <ReloadOutlined spin={isFetchingThis} />,
      label: t('channels.fetch_tooltip'),
      disabled: isFetchingThis,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        onFetch();
      },
    },
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: t('channels.edit_tooltip'),
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        onEdit();
      },
    },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: t('channels.delete_tooltip'),
      danger: true,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        onDelete();
      },
    },
  ];

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
        <Badge count={unreadCount} size="small" overflowCount={999} />
        <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
          <Button icon={<MoreOutlined />} size="small" type="text" onClick={(e) => e.stopPropagation()} />
        </Dropdown>
      </div>
    </div>
  );
}
