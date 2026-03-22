import React, { useState, useEffect } from 'react';
import { App } from 'antd';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { NewsItem, ChannelType } from '../../../shared/types';
import { useMarkRead, useExtractContent, useDownloadMedia } from '../../api/news';
import { useNewsDownloadTask } from '../../api/downloads';
import { useQueryClient } from '@tanstack/react-query';
import { isYouTubeUrl, getNewsTitle } from './newsUtils';
import { NewsDetailToolbar } from './NewsDetailToolbar';
import { NewsDetailTopPanel } from './NewsDetailTopPanel';
import { NewsDetailBody } from './NewsDetailBody';

const useStyles = createStyles(({ css, token }) => ({
  detail: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    position: relative;
  `,
  detailInline: css`
    height: auto;
    overflow: visible;
  `,
  header: css`
    flex-shrink: 0;
    background: ${token.colorBgLayout};
    border-bottom: 1px solid ${token.colorBorderSecondary};
    position: sticky;
    top: 0;
    z-index: 10;
    container-type: inline-size;
  `,
  headerInline: css`
    position: static;
    background: ${token.colorBgContainer};
  `,
}));

interface NewsDetailProps {
  item: NewsItem;
  channelType: ChannelType;
  /** Telegram channel username — used to build a fallback t.me deep-link when the post has no links */
  channelTelegramId: string;
  onMarkedRead?: (id: number) => void;
  variant?: 'panel' | 'inline';
  onHeaderClick?: () => void;
}

export function NewsDetail({
  item,
  channelType,
  channelTelegramId,
  onMarkedRead,
  variant = 'panel',
  onHeaderClick,
}: NewsDetailProps) {
  const { message } = App.useApp();
  const { t } = useTranslation();
  const { styles, cx } = useStyles();
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

  // ── Derived values ────────────────────────────────────────────────────
  const links = item.links || [];
  const isRead = item.isRead === 1;
  const firstLink = links[0];
  // openUrl: prefer the post's first link; fall back to the channel's Telegram message permalink
  const openUrl = firstLink ?? `https://t.me/${channelTelegramId}/${item.telegramMsgId}`;
  const isExternalLink = !!firstLink;
  const firstMediaPath = item.localMediaPaths?.[0] ?? item.localMediaPath;
  // albumLength: how many images are already downloaded (can be less than expected)
  const albumLength = item.localMediaPaths?.length ?? 0;
  // albumExpectedLength: total images in the album per Telegram (known even before download completes)
  const albumExpectedLength = item.albumMsgIds?.length ?? albumLength;
  // isAlbum controls the carousel UI — only active when ≥2 images are actually downloaded.
  // albumExpectedLength is used separately for Space-key blocking (see hotkey handler below).
  const isAlbum = albumLength > 1;
  const isVideo = /\.(mp4|webm)$/i.test(firstMediaPath ?? '');
  const articleLoading = extractContent.isPending || articleTask?.status === 'processing';
  const articleQueued = articleTask?.status === 'pending';
  const mediaLoading = downloadMedia.isPending || mediaTask?.status === 'processing';
  const mediaQueued = mediaTask?.status === 'pending';

  // ── Hotkeys ──────────────────────────────────────────────────────────
  // Registered in the CAPTURE phase so this handler always fires before
  // useNewsHotkeys (which listens in the default bubble phase). Without capture,
  // both listeners sit on `window` and fire in registration order — useNewsHotkeys
  // (from the parent NewsFeed) may be registered first, meaning stopImmediatePropagation()
  // called here would be too late to stop it.
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
            if (nonYt.length === 1)
              extractContent.mutate(
                { newsId: item.id, url: nonYt[0] },
                { onSuccess: () => void message.success(t('news.detail.article_queued_toast')) },
              );
            else {
              setSelectedUrl(nonYt[0]);
              setLinkModalOpen(true);
            }
          }
          break;
        }
        case 'Enter':
          e.preventDefault();
          window.open(openUrl, '_blank', 'noopener,noreferrer');
          break;
        case 'Escape':
          if (topPanel) {
            e.preventDefault();
            setTopPanel(null);
          }
          break;
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
          // Block Space → mark-as-read while there are more album images to view.
          // Gated on albumExpectedLength (not isAlbum) so it works even when only
          // 0–1 images are downloaded but the album is known to have more.
          if (albumExpectedLength > 1 && albumIndex < albumExpectedLength - 1) {
            e.preventDefault();
            e.stopImmediatePropagation();
            // Navigate only within already-downloaded images
            if (albumIndex < albumLength - 1) setAlbumIndex((i) => i + 1);
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [
    links,
    item.text,
    item.fullContent,
    item.channelId,
    item.id,
    channelType,
    openUrl,
    topPanel,
    articleQueued,
    qc,
    extractContent,
    message,
    isAlbum,
    albumIndex,
    albumLength,
    albumExpectedLength,
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
      { onSuccess: () => void message.success(t('news.detail.article_queued_toast')) },
    );
  const handleExtractClick = () => {
    const nonYtLinks = links.filter((l) => !isYouTubeUrl(l));
    if (nonYtLinks.length === 0) return;
    if (nonYtLinks.length === 1) handleExtract(nonYtLinks[0]);
    else {
      setSelectedUrl(nonYtLinks[0]);
      setLinkModalOpen(true);
    }
  };

  return (
    <div className={cx(styles.detail, variant === 'inline' && styles.detailInline)}>
      <div className={cx(styles.header, variant === 'inline' && styles.headerInline)}>
        <NewsDetailToolbar
          item={item}
          channelType={channelType}
          links={links}
          topPanel={topPanel}
          onTogglePanel={(p) => setTopPanel((prev) => (prev === p ? null : p))}
          articleLoading={articleLoading}
          articleQueued={articleQueued}
          onExtractClick={handleExtractClick}
          isRead={isRead}
          onMarkRead={handleMarkRead}
          markReadPending={markRead.isPending}
          onRefresh={handleRefresh}
          openUrl={openUrl}
          isExternalLink={isExternalLink}
          variant={variant}
          title={variant === 'inline' ? getNewsTitle(item) : undefined}
          onHeaderClick={onHeaderClick}
        />
      </div>

      {topPanel && (
        <NewsDetailTopPanel panel={topPanel} links={links} text={item.text} onClose={() => setTopPanel(null)} />
      )}

      <NewsDetailBody
        item={item}
        channelType={channelType}
        links={links}
        firstMediaPath={firstMediaPath}
        isAlbum={isAlbum}
        isVideo={isVideo}
        albumIndex={albumIndex}
        albumLength={albumLength}
        albumExpectedLength={albumExpectedLength}
        onAlbumNav={(delta) => setAlbumIndex((i) => Math.max(0, Math.min(albumLength - 1, i + delta)))}
        mediaLoading={mediaLoading}
        mediaQueued={mediaQueued}
        mediaTaskStatus={mediaTask?.status}
        mediaTaskError={mediaTask?.error ?? undefined}
        onDownload={() =>
          downloadMedia.mutate(item.id, {
            onSuccess: () => void message.success(t('news.detail.media_queued_toast')),
          })
        }
        articleLoading={articleLoading}
        articleQueued={articleQueued}
        articleTaskStatus={articleTask?.status}
        articleTaskError={articleTask?.error ?? undefined}
        onExtractClick={handleExtractClick}
        linkModalOpen={linkModalOpen}
        selectedUrl={selectedUrl}
        onSelectedUrlChange={setSelectedUrl}
        onModalConfirm={() => {
          setLinkModalOpen(false);
          handleExtract(selectedUrl);
        }}
        onModalCancel={() => setLinkModalOpen(false)}
      />
    </div>
  );
}
