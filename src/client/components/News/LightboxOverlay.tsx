import React, { useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '../../store/uiStore';
import { useChannels, channelKeys } from '../../api/channels';
import { useMarkRead } from '../../api/news';
import { useDownloadMedia } from '../../api/news';
import { useLightboxNav } from './useLightboxNav';
import { LightboxMedia } from './LightboxMedia';
import { LightboxToolbar } from './LightboxToolbar';
import { mediaUrl } from '../../api/mediaUrl';

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
  `,
  // ── Media row: [navPrev][media][navNext] — no absolute positioning ───
  // Buttons are flex siblings of the media, so they never overlap it.
  mediaArea: css`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
  `,
  navBtn: css`
    flex-shrink: 0;
    width: 56px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.4);
    font-size: 20px;
    cursor: pointer;
    transition:
      color 0.15s,
      background 0.15s;
    outline: none;
    padding: 0;
    @container (max-width: 360px) {
      width: 36px;
      font-size: 16px;
    }
    &:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.07);
    }
    &:disabled {
      opacity: 0.15;
      cursor: default;
    }
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

export function LightboxOverlay() {
  const { styles } = useStyles();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { lightbox, closeLightbox, openLightbox, setLightboxAlbumIndex } = useUIStore();
  const { data: channels = [] } = useChannels();
  const markRead = useMarkRead();
  const downloadMedia = useDownloadMedia();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // ── Album index memory (Issue 10) ────────────────────────────────────
  // Remembers the last-viewed album image index per newsId so that navigating
  // back to a previously viewed item restores position instead of jumping to 0.
  const albumHistory = useRef<Map<number, number>>(new Map());

  // ── History API ───────────────────────────────────────────────────────
  const closedByBackRef = useRef(false);
  useEffect(() => {
    if (!lightbox) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!lightbox]);

  const channelId = lightbox?.channelId ?? 0;
  const newsId = lightbox?.newsId ?? 0;
  const albumIndex = lightbox?.albumIndex ?? 0;

  const channel = channels.find((c) => c.id === channelId);

  // Track albumIndex per newsId
  useEffect(() => {
    if (newsId) albumHistory.current.set(newsId, albumIndex);
  }, [newsId, albumIndex]);

  const navigate = useCallback(
    (nextNewsId: number, nextAlbumIndex: number) => {
      // Restore last-viewed album position if navigating back to a known item
      const restoredIndex = nextAlbumIndex !== 0 ? nextAlbumIndex : (albumHistory.current.get(nextNewsId) ?? 0);
      openLightbox(nextNewsId, restoredIndex, channelId);

      const ch = channels.find((c) => c.id === channelId);
      if (ch?.channelType === 'media' || ch?.channelType === 'blog') {
        markRead.mutate({ id: nextNewsId, isRead: 1, channelId });
      }
    },
    [openLightbox, channelId, channels, markRead],
  );

  const nav = useLightboxNav(channelId, newsId, albumIndex, navigate);

  // ── Prefetch adjacent images (Issue 8) ───────────────────────────────
  useEffect(() => {
    const { entries, cursor } = nav;
    [entries[cursor - 1], entries[cursor + 1]].forEach((e) => {
      const p = e?.item.localMediaPaths?.[0] ?? e?.item.localMediaPath;
      if (p) {
        const img = new Image();
        img.src = mediaUrl(p);
      }
    });
  }, [nav]);

  // Auto-mark as read on open (media channels)
  useEffect(() => {
    if (!lightbox || !channel) return;
    if (channel.channelType === 'media' || channel.channelType === 'blog') {
      markRead.mutate({ id: lightbox.newsId, isRead: 1, channelId: lightbox.channelId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox?.newsId, lightbox?.channelId]);

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

  if (!lightbox || !channel) return null;

  const { currentEntry, isVideo, isAlbum, albumLength, firstMediaPath } = nav;
  const item = currentEntry?.item;
  const albumPaths = item?.localMediaPaths;
  const currentMediaPath = isAlbum && albumPaths ? (albumPaths[albumIndex] ?? firstMediaPath) : firstMediaPath;

  const handleDownload = () => {
    if (item) downloadMedia.mutate(item.id);
  };

  const handleRetry = () => {
    // Invalidate news cache to refresh signed URLs, then re-open at same position
    void qc.invalidateQueries({ queryKey: ['news', channelId] });
    void qc.invalidateQueries({ queryKey: channelKeys.all });
  };

  return createPortal(
    <div
      ref={overlayRef}
      className={styles.overlay}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t('lightbox.title')}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeLightbox();
      }}
    >
      <LightboxToolbar
        item={item}
        channelName={channel.name}
        channelTelegramId={channel.telegramId}
        positionLabel={nav.positionLabel}
        currentMediaPath={currentMediaPath}
        onClose={closeLightbox}
      />

      {/* Issue 11: flex-row layout — buttons are siblings, never overlap image */}
      <div className={styles.mediaArea}>
        <button
          className={styles.navBtn}
          onClick={(e) => {
            e.stopPropagation();
            if (nav.isAlbum && albumIndex > 0) setLightboxAlbumIndex(albumIndex - 1);
            else nav.go(-1);
          }}
          title={t('lightbox.prev')}
        >
          <LeftOutlined />
        </button>

        <LightboxMedia
          path={firstMediaPath}
          isVideo={isVideo}
          isAlbum={isAlbum}
          albumIndex={albumIndex}
          albumPaths={albumPaths}
          videoRef={videoRef}
          onDownload={handleDownload}
          onRetry={handleRetry}
        />

        <button
          className={styles.navBtn}
          onClick={(e) => {
            e.stopPropagation();
            if (nav.isAlbum && albumIndex < albumLength - 1) setLightboxAlbumIndex(albumIndex + 1);
            else nav.go(1);
          }}
          title={t('lightbox.next')}
        >
          <RightOutlined />
        </button>
      </div>

      <div className={styles.counter}>{nav.positionLabel}</div>
    </div>,
    document.body,
  );
}
