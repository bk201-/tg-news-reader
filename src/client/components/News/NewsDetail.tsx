import React, { useState } from 'react';
import { Button, Tooltip, Typography, Space, Divider, Tag, Modal, Radio, App } from 'antd';
import {
  LinkOutlined,
  DownloadOutlined,
  CheckOutlined,
  ExportOutlined,
  ReloadOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { NewsItem, ChannelType } from '@shared/types.ts';
import { useMarkRead, useExtractContent, useDownloadMedia } from '../../api/news';
import { useNewsDownloadTask } from '../../api/downloads';
import { useQueryClient } from '@tanstack/react-query';
import { mediaUrl } from '../../api/mediaUrl';

const { Text, Paragraph } = Typography;

interface NewsDetailProps {
  item: NewsItem;
  channelType: ChannelType;
  onMarkedRead?: (id: number) => void;
}

export function NewsDetail({ item, channelType, onMarkedRead }: NewsDetailProps) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const markRead = useMarkRead();
  const extractContent = useExtractContent();
  const downloadMedia = useDownloadMedia();

  const mediaTask = useNewsDownloadTask(item.id, 'media');
  const articleTask = useNewsDownloadTask(item.id, 'article');

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string>('');

  const links = item.links || [];
  const hashtags = item.hashtags || [];
  const isRead = item.isRead === 1;

  const handleRefresh = () => {
    void qc.invalidateQueries({ queryKey: ['news', item.channelId] });
  };

  const handleMarkRead = () => {
    markRead.mutate(
      { id: item.id, isRead: isRead ? 0 : 1 },
      {
        onSuccess: () => {
          if (!isRead) onMarkedRead?.(item.id);
        },
      },
    );
  };

  const handleExtract = (url: string) => {
    extractContent.mutate(
      { newsId: item.id, url },
      {
        onSuccess: () => void message.success('Статья поставлена в очередь загрузки'),
      },
    );
  };

  const handleExtractClick = () => {
    const nonYtLinks = links.filter((l) => !isYouTubeUrl(l));
    if (nonYtLinks.length === 0) return;
    if (nonYtLinks.length === 1) {
      handleExtract(nonYtLinks[0]);
    } else {
      setSelectedUrl(nonYtLinks[0]);
      setLinkModalOpen(true);
    }
  };

  const handleDownloadMedia = () => {
    downloadMedia.mutate(item.id, {
      onSuccess: () => void message.success('Медиа поставлено в очередь загрузки'),
    });
  };

  const firstLink = links[0];
  const isVideo = /\.(mp4|webm)$/i.test(item.localMediaPath ?? '');

  const formatBytes = (bytes: number) =>
    bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} МБ` : `${(bytes / 1024).toFixed(0)} КБ`;

  // Determine article button state
  const articleLoading = extractContent.isPending || articleTask?.status === 'processing';
  const articleQueued = articleTask?.status === 'pending';
  // Media button state
  const mediaLoading = downloadMedia.isPending || mediaTask?.status === 'processing';
  const mediaQueued = mediaTask?.status === 'pending';

  return (
    <div className="news-detail">
      <div className="news-detail__header">
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs.unix(item.postedAt).format('DD MMMM YYYY, HH:mm')}
          </Text>
          <div style={{ marginTop: 4 }}>
            {hashtags.map((tag) => (
              <Tag key={tag} color="blue">
                {tag}
              </Tag>
            ))}
          </div>
        </div>
        <Space>
          <Tooltip title="Обновить">
            <Button icon={<ReloadOutlined />} size="small" onClick={handleRefresh} />
          </Tooltip>
          {firstLink && (
            <Tooltip title="Открыть в браузере">
              <Button icon={<ExportOutlined />} size="small" href={firstLink} target="_blank" rel="noreferrer">
                Открыть
              </Button>
            </Tooltip>
          )}
          {firstLink && !item.fullContent && channelType !== 'link_continuation' && (
            <Tooltip title="Загрузить полный текст статьи">
              <Button
                icon={articleLoading ? <LoadingOutlined /> : <DownloadOutlined />}
                size="small"
                onClick={handleExtractClick}
                loading={articleLoading}
                disabled={articleQueued}
              >
                {articleQueued ? 'В очереди' : 'Загрузить текст'}
              </Button>
            </Tooltip>
          )}
          <Button
            icon={<CheckOutlined />}
            size="small"
            type={isRead ? 'default' : 'primary'}
            onClick={handleMarkRead}
            loading={markRead.isPending}
          >
            {isRead ? 'Не прочитано' : 'Прочитано'}
          </Button>
        </Space>
      </div>

      <div className="news-detail__content">
        {/* Media content */}
        {item.localMediaPath ? (
          <div className="news-detail__media">
            {isVideo ? (
              <video
                src={mediaUrl(item.localMediaPath)}
                controls
                muted
                autoPlay
                loop
                style={{ maxHeight: '80vh', maxWidth: '100%', display: 'block', margin: '0 auto', borderRadius: 8 }}
              />
            ) : (
              <img
                src={mediaUrl(item.localMediaPath)}
                alt="media"
                style={{
                  maxHeight: '80vh',
                  maxWidth: '100%',
                  objectFit: 'contain',
                  display: 'block',
                  margin: '0 auto',
                  borderRadius: 8,
                }}
              />
            )}
          </div>
        ) : item.mediaType && item.mediaType !== 'webpage' && item.mediaType !== 'other' ? (
          <div className="news-detail__media-download">
            <Button
              icon={mediaLoading ? <LoadingOutlined /> : <DownloadOutlined />}
              onClick={handleDownloadMedia}
              loading={mediaLoading}
              disabled={mediaQueued}
              size="large"
            >
              {mediaQueued
                ? 'В очереди…'
                : mediaTask?.status === 'failed'
                  ? 'Повторить загрузку'
                  : `Скачать медиа${item.mediaSize ? ` (${formatBytes(item.mediaSize)})` : ''}`}
            </Button>
            {mediaTask?.status === 'failed' && (
              <Text type="danger" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                Ошибка: {mediaTask.error}
              </Text>
            )}
          </div>
        ) : null}

        {/* For link_continuation: show fullContent if available, otherwise text + load button */}
        {channelType === 'link_continuation' ? (
          item.fullContent ? (
            <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.8 }}>{item.fullContent}</Paragraph>
          ) : (
            <>
              <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>
                {item.text || <Text type="secondary">(нет текста)</Text>}
              </Paragraph>
              {links.filter((l) => !isYouTubeUrl(l)).length > 0 && (
                <Button
                  icon={articleLoading ? <LoadingOutlined /> : <DownloadOutlined />}
                  onClick={handleExtractClick}
                  loading={articleLoading}
                  disabled={articleQueued}
                  style={{ marginTop: 8 }}
                >
                  {articleQueued ? 'В очереди…' : 'Загрузить полный текст'}
                </Button>
              )}
              {articleTask?.status === 'failed' && (
                <Text type="danger" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                  Ошибка: {articleTask.error}
                </Text>
              )}
            </>
          )
        ) : channelType === 'media_content' ? (
          item.text ? (
            <Paragraph
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: 13,
                lineHeight: 1.6,
                color: 'var(--tgr-color-text-secondary, #666)',
                marginTop: 8,
              }}
            >
              {item.text}
            </Paragraph>
          ) : null
        ) : (
          <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>
            {item.text || <Text type="secondary">(нет текста)</Text>}
          </Paragraph>
        )}

        {/* Links panel */}
        {links.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" strong style={{ fontSize: 12 }}>
              Ссылки:
            </Text>
            {links.map((link, i) => (
              <div key={i} style={{ marginTop: 4 }}>
                <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                  <LinkOutlined /> {link.length > 60 ? link.substring(0, 60) + '…' : link}
                </a>
              </div>
            ))}
          </div>
        )}

        {/* Extra fullContent for non-link_continuation */}
        {channelType !== 'link_continuation' && item.fullContent && (
          <>
            <Divider>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Полный текст статьи
              </Text>
            </Divider>
            <div className="news-detail__full-content">
              <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.8 }}>
                {item.fullContent}
              </Paragraph>
            </div>
          </>
        )}
      </div>

      {/* Multi-link selection modal for link_continuation */}
      <Modal
        open={linkModalOpen}
        title="Выберите ссылку для загрузки"
        okText="Загрузить"
        cancelText="Отмена"
        onOk={() => {
          setLinkModalOpen(false);
          handleExtract(selectedUrl);
        }}
        onCancel={() => setLinkModalOpen(false)}
      >
        <Radio.Group
          value={selectedUrl}
          onChange={(e) => setSelectedUrl(e.target.value as string)}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {links
            .filter((l) => !isYouTubeUrl(l))
            .map((link) => (
              <Radio key={link} value={link}>
                <Text style={{ fontSize: 12 }}>{link.length > 70 ? link.substring(0, 70) + '…' : link}</Text>
              </Radio>
            ))}
        </Radio.Group>
      </Modal>
    </div>
  );
}

function isYouTubeUrl(url: string): boolean {
  return /youtu\.be\/|youtube\.com\/(watch|shorts|embed)/i.test(url);
}
