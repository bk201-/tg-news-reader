import React, { useCallback } from 'react';
import { App } from 'antd';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { NewsItem } from '@shared/types.ts';
import { useMarkRead, useExtractContent, useDownloadMedia } from '../../api/news';
import { useNewsDownloadTask } from '../../api/downloads';
import { useQueryClient } from '@tanstack/react-query';
import { isYouTubeUrl, getNewsTitle } from './newsUtils';
import { NewsDetailToolbar } from './NewsDetailToolbar';
import { NewsDetailTopPanel } from './NewsDetailTopPanel';
import { NewsDetailBody } from './NewsDetailBody';
import { useNewsDetailHotkeys } from './useNewsDetailHotkeys';

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
    /* Stays sticky within the accordion scroll container so action buttons remain visible */
    position: sticky;
    top: 0;
    z-index: 10;
    background: ${token.colorBgContainer};
  `,
}));

interface NewsDetailProps {
  item: NewsItem;
  /** Telegram channel username — used to build a fallback t.me deep-link when the post has no links */
  channelTelegramId: string;
  onMarkedRead?: (id: number) => void;
  variant?: 'panel' | 'inline';
  onHeaderClick?: () => void;
  /** Tag click handler forwarded to the toolbar (show / addFilter dropdown) */
  onTagClick?: (tag: string, action: 'show' | 'addFilter') => void;
}

export function NewsDetail({
  item,
  channelTelegramId,
  onMarkedRead,
  variant = 'panel',
  onHeaderClick,
  onTagClick,
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
  // albumExpectedLength is used separately for Space-key blocking (see hotkey handler).
  const isAlbum = albumLength > 1;
  const isVideo = /\.(mp4|webm)$/i.test(firstMediaPath ?? '');
  const isAudio = item.mediaType === 'audio';
  const articleLoading = extractContent.isPending || articleTask?.status === 'processing';
  const articleQueued = articleTask?.status === 'pending';
  const mediaLoading = downloadMedia.isPending || mediaTask?.status === 'processing';
  const mediaQueued = mediaTask?.status === 'pending';

  // ── Handlers (stable refs passed to the hotkeys hook) ─────────────────
  const handleRefresh = useCallback(
    () => void qc.invalidateQueries({ queryKey: ['news', item.channelId] }),
    [qc, item.channelId],
  );
  const handleExtract = useCallback(
    (url: string) =>
      extractContent.mutate(
        { newsId: item.id, url },
        { onSuccess: () => void message.success(t('news.detail.article_queued_toast')) },
      ),
    [extractContent, item.id, message, t],
  );
  const handleShare = useCallback(async () => {
    const title = item.text?.split('\n')[0]?.trim().substring(0, 80) || 'News';
    // Use native Web Share API only on touch devices (mobile/tablet).
    // On desktop, Chrome 89+ exposes navigator.share too but shows a dialog we don't want.
    const isTouchDevice = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    if (navigator.share && isTouchDevice) {
      await navigator.share({ title, url: openUrl });
    } else {
      await navigator.clipboard.writeText(openUrl);
      void message.success(t('news.detail.share_copied'));
    }
  }, [openUrl, item.text, message, t]);

  // ── Hotkeys + driven state ────────────────────────────────────────────
  // Registered in the CAPTURE phase so this handler always fires before
  // useNewsHotkeys (which listens in the default bubble phase). Without capture,
  // both listeners sit on `window` and fire in registration order — useNewsHotkeys
  // (from the parent NewsFeed) may be registered first, meaning stopImmediatePropagation()
  // called here would be too late to stop it.
  const {
    albumIndex,
    setAlbumIndex,
    topPanel,
    setTopPanel,
    linkModalOpen,
    setLinkModalOpen,
    selectedUrl,
    setSelectedUrl,
  } = useNewsDetailHotkeys({
    item,
    openUrl,
    articleQueued,
    isAlbum,
    albumLength,
    albumExpectedLength,
    onRefresh: handleRefresh,
    onExtractArticle: handleExtract,
    onShare: () => void handleShare(),
  });

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleMarkRead = () =>
    markRead.mutate(
      { id: item.id, isRead: isRead ? 0 : 1, channelId: item.channelId },
      {
        onSuccess: () => {
          if (!isRead) onMarkedRead?.(item.id);
        },
      },
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
          onTagClick={onTagClick}
          onShare={() => void handleShare()}
        />
      </div>

      {topPanel && (
        <NewsDetailTopPanel panel={topPanel} links={links} text={item.text} onClose={() => setTopPanel(null)} />
      )}

      <NewsDetailBody
        item={item}
        links={links}
        firstMediaPath={firstMediaPath}
        isAlbum={isAlbum}
        isVideo={isVideo}
        isAudio={isAudio}
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
