import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import type { NewsItem } from '@shared/types.ts';
import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { createStyles } from 'antd-style';
import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useChannels } from '../../../api/channels';
import { api } from '../../../api/client';
import { mediaUrl } from '../../../api/mediaUrl';
import { updatePaginatedItems, useDownloadMedia, useMarkRead } from '../../../api/news';
import type { NewsResponse } from '../../../api/news';
import { useUIStore } from '../../../store/uiStore';
import { LightboxMedia } from './LightboxMedia';
import { LightboxToolbar } from './LightboxToolbar';
import { useLightboxNav } from './useLightboxNav';

/** History state key pushed when the lightbox opens */
const HISTORY_KEY = '_lightboxOpen';

const useStyles = createStyles(({ css }) => ({
  overlay: css`
    position: fixed;
    inset: 0;
    z-index: 1050;
    background: rgba(0, 0, 0, 0.93);
    display: flex;
    flex-direction: column;
    outline: none;
    /* Prevent scroll/zoom gestures from passing through to the page */
    touch-action: none;
    overscroll-behavior: contain;
  `,
  // Image takes full area; nav buttons are absolutely positioned on top.
  mediaArea: css`
    flex: 1;
    min-height: 0;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  `,
  navBtn: css`
    position: absolute;
    top: 0;
    bottom: 48px; /* leave room for video controls at the bottom */
    z-index: 5; /* above LightboxMedia wrap (z-index: 4) */
    width: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    font-size: 20px;
    cursor: pointer;
    outline: none;
    padding: 0;

    /* Circle around the chevron icon */
    .anticon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: transparent;
      transition:
        background 0.15s,
        color 0.15s;
    }

    &:hover .anticon,
    &:active .anticon {
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
    }
    &:disabled {
      opacity: 0.15;
      cursor: default;
    }
    &:disabled:hover .anticon {
      background: transparent;
    }
  `,
  navPrev: css`
    left: 0;
  `,
  navNext: css`
    right: 0;
  `,
  counter: css`
    flex-shrink: 0;
    text-align: center;
    color: rgba(255, 255, 255, 0.45);
    font-size: 12px;
    padding: 8px 16px;
    min-height: 28px;
  `,
}));

interface LightboxOverlayProps {
  /** fetchNextPage / hasNextPage forwarded from the parent news feed query.
   *  Avoids mounting a second observer on the same query key, which would
   *  trigger a background refetch and overwrite optimistic isRead updates. */
  fetchNextPage: () => void;
  hasNextPage: boolean;
}

export function LightboxOverlay({ fetchNextPage, hasNextPage }: LightboxOverlayProps) {
  const { styles, cx } = useStyles();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { lightbox, closeLightbox, openLightbox } = useUIStore();
  const { data: channels = [] } = useChannels();
  const markRead = useMarkRead();
  const downloadMedia = useDownloadMedia();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const channelId = lightbox?.channelId ?? 0;
  const newsId = lightbox?.newsId ?? 0;
  const albumIndex = lightbox?.albumIndex ?? 0;
  const isLightboxOpen = lightbox !== null;
  const markReadMutate = markRead.mutate;

  // ── History API ───────────────────────────────────────────────────────
  const closedByBackRef = useRef(false);
  useEffect(() => {
    if (!isLightboxOpen) return;
    closedByBackRef.current = false;
    history.pushState({ [HISTORY_KEY]: true }, '');

    const onPop = () => {
      closedByBackRef.current = true;
      closeLightbox();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (!closedByBackRef.current) {
        history.replaceState(null, '', window.location.href);
      }
    };
  }, [isLightboxOpen, closeLightbox]);

  // ── Lock body scroll while lightbox is open ──────────────────────────
  useEffect(() => {
    if (!isLightboxOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // iOS Safari ignores overflow:hidden on body — block touchmove at document level
    const preventScroll = (e: TouchEvent) => {
      // Allow touch on video controls
      if ((e.target as HTMLElement)?.closest?.('video')) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('touchmove', preventScroll);
    };
  }, [isLightboxOpen]);

  const channel = channels.find((c) => c.id === channelId);
  const channelType = channel?.channelType;
  const lightboxNewsId = lightbox?.newsId ?? null;
  const lightboxChannelId = lightbox?.channelId ?? null;

  const navigate = useCallback(
    (nextNewsId: number, nextAlbumIndex: number) => {
      // Simple flat list: forward → first image (0), backward → last image (passed by go())
      openLightbox(nextNewsId, nextAlbumIndex, channelId);

      const ch = channels.find((c) => c.id === channelId);
      if (ch?.channelType === 'media' || ch?.channelType === 'blog') {
        // Find the item in cache to verify media is downloaded before marking as read
        const allData =
          qc.getQueryData<InfiniteData<NewsResponse>>(['news', channelId, 'all']) ??
          qc.getQueryData<InfiniteData<NewsResponse>>(['news', channelId, 'filtered']);
        const items = allData?.pages.flatMap((p) => p.items) ?? [];
        const nextItem = items.find((it) => it.id === nextNewsId);
        const hasMedia = !!(nextItem?.localMediaPaths?.[0] ?? nextItem?.localMediaPath);
        if (hasMedia) {
          markRead.mutate({ id: nextNewsId, isRead: 1, channelId });
        }
      }
    },
    [openLightbox, channelId, channels, markRead, qc],
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

  // ── Prefetch adjacent images: 1 behind + 2 ahead ────────────────────
  useEffect(() => {
    const { entries, cursor } = nav;
    [entries[cursor - 1], entries[cursor + 1], entries[cursor + 2]].forEach((e) => {
      const p = e?.item.localMediaPaths?.[0] ?? e?.item.localMediaPath;
      // Skip videos — no point preloading them
      if (p && !/\.(mp4|webm|mov)$/i.test(p)) {
        const img = new Image();
        img.src = mediaUrl(p);
      }
    });
  }, [nav]);

  // Auto-mark as read on open (media channels) — only when media is already downloaded
  useEffect(() => {
    if (!isLightboxOpen || lightboxNewsId === null || lightboxChannelId === null) return;
    if (channelType !== 'media' && channelType !== 'blog') return;
    // Don't mark read if media hasn't been downloaded yet
    if (!nav.firstMediaPath) return;
    markReadMutate({ id: lightboxNewsId, isRead: 1, channelId: lightboxChannelId });
  }, [isLightboxOpen, lightboxNewsId, lightboxChannelId, channelType, markReadMutate, nav.firstMediaPath]);

  // Focus overlay so keyboard events are received
  useEffect(() => {
    if (lightbox) overlayRef.current?.focus();
  }, [lightbox]);

  // ── Keyboard handler ──────────────────────────────────────────────────
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          e.stopImmediatePropagation();
          closeLightbox();
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopImmediatePropagation();
          nav.go(-1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          e.stopImmediatePropagation();
          nav.go(1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          e.stopImmediatePropagation();
          if (nav.isVideo) {
            if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
          } else if (nav.isAlbum) nav.goToAlbumImage(-1);
          else nav.go(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          e.stopImmediatePropagation();
          if (nav.isVideo) {
            if (videoRef.current)
              videoRef.current.currentTime = Math.min(
                videoRef.current.duration || Infinity,
                videoRef.current.currentTime + 10,
              );
          } else if (nav.isAlbum) nav.goToAlbumImage(1);
          else nav.go(1);
          break;
        case ' ':
          e.preventDefault();
          e.stopImmediatePropagation();
          if (nav.isVideo) {
            if (videoRef.current) {
              if (videoRef.current.paused) void videoRef.current.play();
              else videoRef.current.pause();
            }
          } else nav.go(1);
          break;
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [lightbox, closeLightbox, nav]);

  // ── Wheel handler ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!lightbox) return;
    const THRESHOLD = 80;
    const RESET_DELAY = 150;
    let accumulated = 0;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    let navigated = false;
    // ── Wheel handler — uses unified go() which steps through album images ──
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      accumulated += e.deltaY;
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        accumulated = 0;
        navigated = false;
      }, RESET_DELAY);
      if (navigated) return;
      if (accumulated > THRESHOLD) {
        navigated = true;
        nav.go(1);
      } else if (accumulated < -THRESHOLD) {
        navigated = true;
        nav.go(-1);
      }
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener('wheel', onWheel, { capture: true });
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [lightbox, nav]);

  // ── Touch swipe handler (Issue 6) ────────────────────────────────────
  useEffect(() => {
    if (!lightbox) return;
    const SWIPE_THRESHOLD = 50;
    let startX = 0;
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
        // Horizontal swipe — album image or next/prev item
        if (nav.isAlbum) nav.goToAlbumImage(dx < 0 ? 1 : -1);
        else nav.go(dx < 0 ? 1 : -1);
      } else if (Math.abs(dy) > SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
        // Vertical swipe — navigate items
        nav.go(dy < 0 ? 1 : -1);
      }
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [lightbox, nav]);

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
