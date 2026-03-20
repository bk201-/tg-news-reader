import React from 'react';
import { Button, Space, Tooltip, Badge, Typography } from 'antd';
import { ReloadOutlined, EditOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { Channel } from '@shared/types.ts';

const { Text } = Typography;

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
  return (
    <div className={`channel-item ${isSelected ? 'channel-item--active' : ''}`} onClick={onSelect}>
      <div className="channel-item__info">
        <Text strong ellipsis>
          {ch.isUnavailable ? (
            <Tooltip title={t('channels.unavailable_tooltip')}>
              <WarningOutlined style={{ color: '#ff4d4f', marginRight: 4 }} />
            </Tooltip>
          ) : null}
          {ch.name}
        </Text>
        <Text type="secondary" style={{ fontSize: 11 }}>
          @{ch.telegramId}
        </Text>
        {ch.lastFetchedAt && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {t('channels.updated', { date: dayjs.unix(ch.lastFetchedAt).format('DD.MM.YY HH:mm') })}
          </Text>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <Space className="channel-item__actions" size={4}>
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
