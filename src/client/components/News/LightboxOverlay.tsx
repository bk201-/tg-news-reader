import React, { useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/uiStore';
import { useChannels } from '../../api/channels';
import { useMarkRead } from '../../api/news';
import { useLightboxNav } from './useLightboxNav';
import { LightboxMedia } from './LightboxMedia';
import { LightboxToolbar } from './LightboxToolbar';

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
  navBtn: css`
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
    font-size: 18px;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
    outline: none;
    padding: 0;
    &:hover {
      background: rgba(255, 255, 255, 0.22);
      color: #fff;
    }
    &:disabled {
      opacity: 0.2;
      cursor: default;
    }
  `,
  navPrev: css`
    left: 16px;
  `,
  navNext: css`
    right: 16px;
  `,
  mediaArea: css`
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 0 72px;
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
  const { styles, cx } = useStyles();
  const { t } = useTranslation();

  const { lightbox, closeLightbox, openLightbox, setLightboxAlbumIndex } = useUIStore();
  const { data: channels = [] } = useChannels();
  const markRead = useMarkRead();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const channelId = lightbox?.channelId ?? 0;
  const newsId = lightbox?.newsId ?? 0;
  const albumIndex = lightbox?.albumIndex ?? 0;

  const channel = channels.find((c) => c.id === channelId);

  const navigate = useCallback(
    (nextNewsId: number, nextAlbumIndex: number) => {
      openLightbox(nextNewsId, nextAlbumIndex, channelId);

      // Auto-mark as read for media channels
      const ch = channels.find((c) => c.id === channelId);
      if (ch?.channelType === 'media' || ch?.channelType === 'blog') {
        markRead.mutate({ id: nextNewsId, isRead: 1, channelId });
      }
    },
    [openLightbox, channelId, channels, markRead],
  );

  const nav = useLightboxNav(channelId, newsId, albumIndex, navigate);

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
    if (lightbox) {
      overlayRef.current?.focus();
    }
  }, [lightbox]);

  // Keyboard handler
  useEffect(() => {
    if (!lightbox) return;

    const onKey = (e: KeyboardEvent) => {
      // Always capture when lightbox is open
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
          } else if (nav.isAlbum) {
            nav.goToAlbumImage(-1);
          } else {
            nav.go(-1);
          }
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
          } else if (nav.isAlbum) {
            nav.goToAlbumImage(1);
          } else {
            nav.go(1);
          }
          break;

        case ' ':
          e.preventDefault();
          e.stopImmediatePropagation();
          if (nav.isVideo) {
            if (videoRef.current) {
              if (videoRef.current.paused) void videoRef.current.play();
              else videoRef.current.pause();
            }
          } else {
            nav.go(1);
          }
          break;
      }
    };

    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [lightbox, closeLightbox, nav]);

  // Scroll / wheel handler — accumulates deltaY to handle trackpad smoothly.
  // A single trackpad swipe fires many small events; we only navigate once the
  // accumulated delta crosses a threshold, then reset and ignore further events
  // until the gesture pauses (no wheel events for 150ms).
  useEffect(() => {
    if (!lightbox) return;

    const THRESHOLD = 80; // px accumulated before navigating
    const RESET_DELAY = 150; // ms without events → reset accumulator

    let accumulated = 0;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    let navigated = false; // block further nav after threshold crossed until reset

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      accumulated += e.deltaY;

      // Reset timer: after RESET_DELAY ms of silence, allow next gesture
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

  if (!lightbox || !channel) return null;

  const { currentEntry, isVideo, isAlbum, albumLength, firstMediaPath } = nav;
  const item = currentEntry?.item;
  const albumPaths = item?.localMediaPaths;

  return createPortal(
    <div
      ref={overlayRef}
      className={styles.overlay}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t('lightbox.title')}
      onClick={(e) => {
        // Close when clicking the backdrop (not on toolbar/buttons)
        if (e.target === e.currentTarget) closeLightbox();
      }}
    >
      <LightboxToolbar
        item={item}
        channelName={channel.name}
        channelTelegramId={channel.telegramId}
        positionLabel={nav.positionLabel}
        onClose={closeLightbox}
      />

      <div className={styles.mediaArea}>
        {/* Prev button */}
        <button
          className={cx(styles.navBtn, styles.navPrev)}
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
        />

        {/* Next button */}
        <button
          className={cx(styles.navBtn, styles.navNext)}
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
