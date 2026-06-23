import {
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  MoreOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { Channel } from '@shared/types.ts';
import { Badge, Button, Dropdown, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { createStyles } from 'antd-style';
import dayjs from 'dayjs';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';
import { formatUnreadBadgeCount } from './formatUnreadBadgeCount';

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

const ICON_MORE = <MoreOutlined />;
const ICON_LINK = <LinkOutlined />;
const ICON_EDIT = <EditOutlined />;
const ICON_DELETE = <DeleteOutlined />;
const DROPDOWN_TRIGGER: ('click' | 'hover' | 'contextMenu')[] = ['click'];

const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

interface ChannelItemProps {
  channel: Channel;
  isSelected: boolean;
  isFetchingThis: boolean;
  unreadCount: number;
  onSelect: (id: number) => void;
  onFetch: (channel: Channel) => void;
  onEdit: (channel: Channel) => void;
  onDelete: (channel: Channel) => void;
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

  const reloadIcon = useMemo(() => <ReloadOutlined spin={isFetchingThis} />, [isFetchingThis]);

  const handleSelect = useCallback(() => onSelect(ch.id), [onSelect, ch.id]);
  const handleFetch = useCallback(() => onFetch(ch), [onFetch, ch]);
  const handleEdit = useCallback(() => onEdit(ch), [onEdit, ch]);
  const handleDelete = useCallback(() => onDelete(ch), [onDelete, ch]);

  const menuItems: MenuProps['items'] = useMemo(
    () => [
      {
        key: 'open',
        icon: ICON_LINK,
        label: (
          <a href={`https://t.me/${ch.telegramId}`} target="_blank" rel="noopener noreferrer">
            {t('channels.open_tg_tooltip')}
          </a>
        ),
      },
      {
        key: 'fetch',
        icon: reloadIcon,
        label: t('channels.fetch_tooltip'),
        disabled: isFetchingThis,
        onClick: ({ domEvent }: { domEvent: React.MouseEvent | React.KeyboardEvent }) => {
          domEvent.stopPropagation();
          handleFetch();
        },
      },
      {
        key: 'edit',
        icon: ICON_EDIT,
        label: t('channels.edit_tooltip'),
        onClick: ({ domEvent }: { domEvent: React.MouseEvent | React.KeyboardEvent }) => {
          domEvent.stopPropagation();
          handleEdit();
        },
      },
      {
        key: 'delete',
        icon: ICON_DELETE,
        label: t('channels.delete_tooltip'),
        danger: true,
        onClick: ({ domEvent }: { domEvent: React.MouseEvent | React.KeyboardEvent }) => {
          domEvent.stopPropagation();
          handleDelete();
        },
      },
    ],
    [ch.telegramId, isFetchingThis, reloadIcon, t, handleFetch, handleEdit, handleDelete],
  );

  const dropdownMenu = useMemo(() => ({ items: menuItems }), [menuItems]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSelect();
      }
    },
    [handleSelect],
  );

  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      className={cx(styles.item, isSelected && styles.itemActive)}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
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
        <Badge count={formatUnreadBadgeCount(unreadCount)} overflowCount={9999} size="small" />
        <Dropdown menu={dropdownMenu} trigger={DROPDOWN_TRIGGER} placement="bottomRight">
          <Button icon={ICON_MORE} size="small" type="text" onClick={stopPropagation} />
        </Dropdown>
      </div>
    </div>
  );
}
