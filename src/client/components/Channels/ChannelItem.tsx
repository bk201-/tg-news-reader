import React from 'react';
import { Button, Space, Tooltip, Badge, Typography } from 'antd';
import { ReloadOutlined, EditOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons';
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
  return (
    <div className={`channel-item ${isSelected ? 'channel-item--active' : ''}`} onClick={onSelect}>
      <div className="channel-item__info">
        <Text strong ellipsis>
          {ch.isUnavailable ? (
            <Tooltip title="Канал недоступен в Telegram (удалён или закрыт)">
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
            Обновлено: {dayjs.unix(ch.lastFetchedAt).format('DD.MM.YY HH:mm')}
          </Text>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <Space className="channel-item__actions" size={4}>
          <Tooltip title="Загрузить новости">
            <Button icon={<ReloadOutlined />} size="small" type="text" loading={isFetchingThis} onClick={onFetch} />
          </Tooltip>
          <Tooltip title="Редактировать">
            <Button icon={<EditOutlined />} size="small" type="text" onClick={onEdit} />
          </Tooltip>
          <Tooltip title="Удалить">
            <Button icon={<DeleteOutlined />} size="small" type="text" danger onClick={onDelete} />
          </Tooltip>
        </Space>
        <Badge count={unreadCount} size="small" />
      </div>
    </div>
  );
}
