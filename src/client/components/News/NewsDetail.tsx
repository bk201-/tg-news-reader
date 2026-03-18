import React from 'react';
import { Button, Tooltip, Typography, Space, Divider, Tag } from 'antd';
import { LinkOutlined, DownloadOutlined, CheckOutlined, ExportOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { NewsItem, ChannelType } from '@shared/types.ts';
import { useMarkRead, useExtractContent, useDownloadMedia } from '../../api/news';
import { useQueryClient } from '@tanstack/react-query';
import { mediaUrl } from '../../api/mediaUrl';

const { Text, Paragraph } = Typography;

interface NewsDetailProps {
  item: NewsItem;
  channelType: ChannelType;
  onMarkedRead?: (id: number) => void;
}

export function NewsDetail({ item, channelType, onMarkedRead }: NewsDetailProps) {
  const qc = useQueryClient();
  const markRead = useMarkRead();
  const extractContent = useExtractContent();
  const downloadMedia = useDownloadMedia();

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
  const handleExtract = async () => {
    await extractContent.mutateAsync(item.id);
  };
  const handleDownloadMedia = () => {
    downloadMedia.mutate(item.id);
  };

  const firstLink = links[0];
  const isVideo = /\.(mp4|webm)$/i.test(item.localMediaPath ?? '');

  const formatBytes = (bytes: number) =>
    bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} МБ` : `${(bytes / 1024).toFixed(0)} КБ`;

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
                icon={<DownloadOutlined />}
                size="small"
                onClick={handleExtract}
                loading={extractContent.isPending}
              >
                Загрузить текст
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
              icon={<DownloadOutlined />}
              onClick={handleDownloadMedia}
              loading={downloadMedia.isPending}
              size="large"
            >
              Скачать медиа{item.mediaSize ? ` (${formatBytes(item.mediaSize)})` : ''}
            </Button>
            {downloadMedia.isError && (
              <Text type="danger" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                Не удалось скачать: {downloadMedia.error?.message}
              </Text>
            )}
          </div>
        ) : null}

        {/* For link_continuation: show fullContent if available, original text as fallback */}
        {channelType === 'link_continuation' ? (
          item.fullContent ? (
            <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.8 }}>{item.fullContent}</Paragraph>
          ) : (
            <>
              <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>
                {item.text || <Text type="secondary">(нет текста)</Text>}
              </Paragraph>
              {firstLink && (
                <Button
                  icon={<DownloadOutlined />}
                  onClick={handleExtract}
                  loading={extractContent.isPending}
                  style={{ marginTop: 8 }}
                >
                  Загрузить полный текст
                </Button>
              )}
              {extractContent.isError && (
                <Text type="danger" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                  Не удалось загрузить: {extractContent.error?.message}
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

        {/* Links */}
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

        {/* Extra fullContent for non-link_continuation channels */}
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

        {/* Extra error for non-link_continuation channels */}
        {channelType !== 'link_continuation' && extractContent.isError && (
          <Text type="danger" style={{ fontSize: 12 }}>
            Не удалось загрузить текст: {extractContent.error?.message}
          </Text>
        )}
      </div>
    </div>
  );
}
