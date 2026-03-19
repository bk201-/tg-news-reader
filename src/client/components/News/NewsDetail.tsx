import React, { useState, useEffect } from 'react';
import { Button, Typography, Divider, Modal, Radio, App } from 'antd';
import { DownloadOutlined, LoadingOutlined } from '@ant-design/icons';
import type { NewsItem, ChannelType } from '../../../shared/types';
import { useMarkRead, useExtractContent, useDownloadMedia } from '../../api/news';
import { useNewsDownloadTask } from '../../api/downloads';
import { useQueryClient } from '@tanstack/react-query';
import { isYouTubeUrl } from './newsUtils';
import { NewsDetailToolbar } from './NewsDetailToolbar';
import { NewsDetailTopPanel } from './NewsDetailTopPanel';
import { NewsDetailMedia } from './NewsDetailMedia';

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
  const [topPanel, setTopPanel] = useState<'links' | 'text' | null>(null);
  const [albumIndex, setAlbumIndex] = useState(0);

  // State is reset automatically via key={item.id} on this component in NewsFeed

  // ── Derived values ────────────────────────────────────────────────────
  const links = item.links || [];
  const isRead = item.isRead === 1;
  const firstLink = links[0];
  const firstMediaPath = item.localMediaPaths?.[0] ?? item.localMediaPath;
  const isAlbum = (item.localMediaPaths?.length ?? 0) > 1;
  const albumLength = item.localMediaPaths?.length ?? 0;
  const isVideo = /\.(mp4|webm)$/i.test(firstMediaPath ?? '');
  const articleLoading = extractContent.isPending || articleTask?.status === 'processing';
  const articleQueued = articleTask?.status === 'pending';
  const mediaLoading = downloadMedia.isPending || mediaTask?.status === 'processing';
  const mediaQueued = mediaTask?.status === 'pending';

  // ── Hotkeys ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'button' ||
        tag === 'a' ||
        (e.target as HTMLElement).isContentEditable
      )
        return;

      switch (e.key) {
        case 'r':
        case 'R':
          e.preventDefault();
          void qc.invalidateQueries({ queryKey: ['news', item.channelId] });
          break;
        case 'l':
        case 'L':
          if (links.length > 0) {
            e.preventDefault();
            setTopPanel((p) => (p === 'links' ? null : 'links'));
          }
          break;
        case 't':
        case 'T':
          if (item.text) {
            e.preventDefault();
            setTopPanel((p) => (p === 'text' ? null : 'text'));
          }
          break;
        case 'f':
        case 'F': {
          const nonYt = links.filter((l) => !isYouTubeUrl(l));
          if (channelType === 'link_continuation' && !item.fullContent && nonYt.length > 0 && !articleQueued) {
            e.preventDefault();
            if (nonYt.length === 1) {
              extractContent.mutate(
                { newsId: item.id, url: nonYt[0] },
                { onSuccess: () => void message.success('Статья поставлена в очередь загрузки') },
              );
            } else {
              setSelectedUrl(nonYt[0]);
              setLinkModalOpen(true);
            }
          }
          break;
        }
        case 'Enter':
          if (firstLink) {
            e.preventDefault();
            window.open(firstLink, '_blank', 'noopener,noreferrer');
          }
          break;
        case 'Escape':
          if (topPanel) {
            e.preventDefault();
            setTopPanel(null);
          }
          break;
        // ── Album navigation ──────────────────────────────────────────
        case 'ArrowLeft':
          if (isAlbum && albumIndex > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setAlbumIndex((i) => i - 1);
          }
          break;
        case 'ArrowRight':
          if (isAlbum && albumIndex < albumLength - 1) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setAlbumIndex((i) => i + 1);
          }
          break;
        case ' ':
          // On non-last album image: advance image and block NewsFeed's Space handler.
          // On last image (or non-album): let NewsFeed's handler mark as read.
          if (isAlbum && albumIndex < albumLength - 1) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setAlbumIndex((i) => i + 1);
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    links,
    item.text,
    item.fullContent,
    item.channelId,
    item.id,
    channelType,
    firstLink,
    topPanel,
    articleQueued,
    qc,
    extractContent,
    message,
    isAlbum,
    albumIndex,
    albumLength,
  ]);

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleRefresh = () => void qc.invalidateQueries({ queryKey: ['news', item.channelId] });

  const handleMarkRead = () =>
    markRead.mutate(
      { id: item.id, isRead: isRead ? 0 : 1 },
      {
        onSuccess: () => {
          if (!isRead) onMarkedRead?.(item.id);
        },
      },
    );

  const handleExtract = (url: string) =>
    extractContent.mutate(
      { newsId: item.id, url },
      { onSuccess: () => void message.success('Статья поставлена в очередь загрузки') },
    );

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

  const handleTogglePanel = (panel: 'links' | 'text') => setTopPanel((p) => (p === panel ? null : panel));

  return (
    <div className="news-detail">
      <div className="news-detail__header">
        <NewsDetailToolbar
          item={item}
          channelType={channelType}
          links={links}
          topPanel={topPanel}
          onTogglePanel={handleTogglePanel}
          articleLoading={articleLoading}
          articleQueued={articleQueued}
          onExtractClick={handleExtractClick}
          isRead={isRead}
          onMarkRead={handleMarkRead}
          markReadPending={markRead.isPending}
          onRefresh={handleRefresh}
          firstLink={firstLink}
        />
      </div>

      {topPanel && (
        <NewsDetailTopPanel panel={topPanel} links={links} text={item.text} onClose={() => setTopPanel(null)} />
      )}

      <div className="news-detail__content">
        <NewsDetailMedia
          item={item}
          firstMediaPath={firstMediaPath}
          isAlbum={isAlbum}
          isVideo={isVideo}
          albumIndex={albumIndex}
          onAlbumNav={(delta) => setAlbumIndex((i) => Math.max(0, Math.min(albumLength - 1, i + delta)))}
          mediaLoading={mediaLoading}
          mediaQueued={mediaQueued}
          mediaTaskStatus={mediaTask?.status}
          mediaTaskError={mediaTask?.error ?? undefined}
          onDownload={() =>
            downloadMedia.mutate(item.id, {
              onSuccess: () => void message.success('Медиа поставлено в очередь загрузки'),
            })
          }
        />

        {/* ── Text body ─────────────────────────────────────────────── */}
        <div className="news-detail__text-body">
          {channelType === 'link_continuation' ? (
            item.fullContent ? (
              <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.8 }}>
                {item.fullContent}
              </Paragraph>
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
          ) : channelType === 'media_content' ? null : (
            <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>
              {item.text || <Text type="secondary">(нет текста)</Text>}
            </Paragraph>
          )}

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
      </div>

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
