import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import type { NewsItem } from '@shared/types.ts';
import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import React, { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useChannels } from '../../../api/channels';
import { api } from '../../../api/client';
import { updatePaginatedItems, useDownloadMedia } from '../../../api/news';
import type { NewsResponse } from '../../../api/news';
import { useUIStore } from '../../../store/uiStore';
import { LightboxMedia } from './LightboxMedia';
import { useLightboxOverlayStyles } from './LightboxOverlay.styles';
import { LightboxToolbar } from './LightboxToolbar';
import { useLightboxInput } from './useLightboxInput';
import { useLightboxLifecycle } from './useLightboxLifecycle';
import { useLightboxMediaEffects } from './useLightboxMediaEffects';
import { useLightboxNav } from './useLightboxNav';

interface LightboxOverlayProps {
  /** fetchNextPage / hasNextPage forwarded from the parent news feed query.
   *  Avoids mounting a second observer on the same query key, which would
   *  trigger a background refetch and overwrite optimistic isRead updates. */
  fetchNextPage: () => void;
  hasNextPage: boolean;
}

export function LightboxOverlay({ fetchNextPage, hasNextPage }: LightboxOverlayProps) {
  const { styles, cx } = useLightboxOverlayStyles();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { lightbox, closeLightbox, openLightbox } = useUIStore();
  const { data: channels = [] } = useChannels();
  const downloadMedia = useDownloadMedia();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const channelId = lightbox?.channelId ?? 0;
  const newsId = lightbox?.newsId ?? 0;
  const albumIndex = lightbox?.albumIndex ?? 0;
  useLightboxLifecycle(lightbox !== null, closeLightbox);

  const channel = channels.find((c) => c.id === channelId);
  const channelType = channel?.channelType;

  const navigate = useCallback(
    (nextNewsId: number, nextAlbumIndex: number) => {
      // Simple flat list: forward → first image (0), backward → last image (passed by go())
      openLightbox(nextNewsId, nextAlbumIndex, channelId);
    },
    [openLightbox, channelId],
  );

  const nav = useLightboxNav(
    channelId,
    newsId,
    albumIndex,
    navigate,
    () => {
      fetchNextPage();
    },
    hasNextPage,
  );

  useLightboxMediaEffects(lightbox, channelType, nav);
  useLightboxInput(lightbox, nav, closeLightbox, overlayRef, videoRef);

  // Stable callbacks — must be before any conditional return (rules-of-hooks)
  // nav.currentEntry is available even before the early return
  const currentItem = nav.currentEntry?.item ?? null;

  const handleDownload = useCallback(() => {
    if (currentItem) downloadMedia.mutate(currentItem.id);
  }, [currentItem, downloadMedia]);

  const handleRetry = useCallback(() => {
    if (!currentItem) return;
    void api.get<NewsItem>(`/news/${currentItem.id}`).then((updated) => {
      qc.setQueriesData<InfiniteData<NewsResponse>>({ queryKey: ['news', channelId] }, (old) =>
        updatePaginatedItems(old, (items) =>
          items.map((n) => (n.id === updated.id ? { ...n, ...updated, isRead: n.isRead } : n)),
        ),
      );
      const freshPath = updated.localMediaPaths?.[0] ?? updated.localMediaPath;
      if (!freshPath) downloadMedia.mutate(currentItem.id);
    });
  }, [currentItem, qc, channelId, downloadMedia]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) closeLightbox();
    },
    [closeLightbox],
  );

  const handleNavPrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      nav.go(-1);
    },
    [nav],
  );

  const handleNavNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      nav.go(1);
    },
    [nav],
  );

  if (!lightbox || !channel) return null;

  const { currentEntry, isAlbum, firstMediaPath } = nav;
  const item = currentEntry?.item;
  const albumPaths = item?.localMediaPaths;
  const currentMediaPath = isAlbum && albumPaths ? (albumPaths[albumIndex] ?? firstMediaPath) : firstMediaPath;

  return createPortal(
    <div
      ref={overlayRef}
      className={styles.overlay}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t('lightbox.title')}
      onClick={handleOverlayClick}
    >
      <LightboxToolbar
        item={item}
        channelName={channel.name}
        channelTelegramId={channel.telegramId}
        positionLabel={nav.positionLabel}
        currentMediaPath={currentMediaPath}
        onClose={closeLightbox}
      />

      {/* Image fills the full area; nav buttons are positioned on top */}
      <div className={styles.mediaArea} onClick={handleOverlayClick}>
        <button className={cx(styles.navBtn, styles.navPrev)} onClick={handleNavPrev} title={t('lightbox.prev')}>
          <LeftOutlined />
        </button>

        <LightboxMedia
          path={firstMediaPath}
          isAlbum={isAlbum}
          albumIndex={albumIndex}
          albumPaths={albumPaths}
          videoRef={videoRef}
          onDownload={handleDownload}
          onRetry={handleRetry}
        />

        <button className={cx(styles.navBtn, styles.navNext)} onClick={handleNavNext} title={t('lightbox.next')}>
          <RightOutlined />
        </button>
      </div>

      <div className={styles.counter}>{nav.positionLabel}</div>
    </div>,
    document.body,
  );
}
