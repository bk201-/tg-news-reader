import React from 'react';
import { Button, Tooltip, Space, Tag } from 'antd';
import {
  ReloadOutlined,
  LinkOutlined,
  FileTextOutlined,
  DownloadOutlined,
  LoadingOutlined,
  ExportOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { NewsItem, ChannelType } from '@shared/types.ts';
import { isYouTubeUrl } from './newsUtils';

interface NewsDetailToolbarProps {
  item: NewsItem;
  channelType: ChannelType;
  links: string[];
  topPanel: 'links' | 'text' | null;
  onTogglePanel: (panel: 'links' | 'text') => void;
  articleLoading: boolean;
  articleQueued: boolean;
  onExtractClick: () => void;
  isRead: boolean;
  onMarkRead: () => void;
  markReadPending: boolean;
  onRefresh: () => void;
  firstLink?: string;
}

export function NewsDetailToolbar({
  item,
  channelType,
  links,
  topPanel,
  onTogglePanel,
  articleLoading,
  articleQueued,
  onExtractClick,
  isRead,
  onMarkRead,
  markReadPending,
  onRefresh,
  firstLink,
}: NewsDetailToolbarProps) {
  const hashtags = item.hashtags || [];
  const nonYtLinks = links.filter((l) => !isYouTubeUrl(l));

  return (
    <div className="news-detail__header-top">
      <div>
        <span style={{ fontSize: 12, color: 'var(--tgr-color-text-secondary, #666)' }}>
          {dayjs.unix(item.postedAt).format('DD MMMM YYYY, HH:mm')}
        </span>
        {hashtags.length > 0 && (
          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {hashtags.map((tag) => (
              <Tag key={tag} color="blue" style={{ marginRight: 0 }}>
                {tag}
              </Tag>
            ))}
          </div>
        )}
      </div>

      <Space wrap size={4}>
        {/* ── Left: rarely-used ── */}
        <Tooltip title="Обновить [R]">
          <Button icon={<ReloadOutlined />} size="small" onClick={onRefresh}>
            <span className="nd-btn-text">Обновить</span>
          </Button>
        </Tooltip>

        {/* ── Middle: overlay toggles ── */}
        {links.length > 0 && (
          <Tooltip title="Показать ссылки [L]">
            <Button
              icon={<LinkOutlined />}
              size="small"
              type={topPanel === 'links' ? 'primary' : 'default'}
              onClick={() => onTogglePanel('links')}
            >
              <span className="nd-btn-text">Ссылки{links.length > 1 ? ` (${links.length})` : ''}</span>
            </Button>
          </Tooltip>
        )}
        {item.text && (
          <Tooltip title="Показать текст новости [T]">
            <Button
              icon={<FileTextOutlined />}
              size="small"
              type={topPanel === 'text' ? 'primary' : 'default'}
              onClick={() => onTogglePanel('text')}
            >
              <span className="nd-btn-text">Текст</span>
            </Button>
          </Tooltip>
        )}

        {/* ── Middle: article extraction — link_continuation only ── */}
        {channelType === 'link_continuation' && !item.fullContent && nonYtLinks.length > 0 && (
          <Tooltip title="Загрузить полный текст статьи [F]">
            <Button
              icon={articleLoading ? <LoadingOutlined /> : <DownloadOutlined />}
              size="small"
              onClick={onExtractClick}
              loading={articleLoading}
              disabled={articleQueued}
            >
              <span className="nd-btn-text">{articleQueued ? 'В очереди' : 'Загрузить текст'}</span>
            </Button>
          </Tooltip>
        )}

        {/* ── Right: primary actions ── */}
        {firstLink && (
          <Tooltip title="Открыть в браузере [Enter]">
            <Button icon={<ExportOutlined />} size="small" href={firstLink} target="_blank" rel="noreferrer">
              <span className="nd-btn-text">Открыть</span>
            </Button>
          </Tooltip>
        )}
        <Button
          icon={<CheckOutlined />}
          size="small"
          type={isRead ? 'default' : 'primary'}
          onClick={onMarkRead}
          loading={markReadPending}
        >
          <span className="nd-btn-text">{isRead ? 'Не прочитано' : 'Прочитано'}</span>
        </Button>
      </Space>
    </div>
  );
}
