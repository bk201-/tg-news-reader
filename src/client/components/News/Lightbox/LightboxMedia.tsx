import React, { useCallback, useState, useRef, useEffect } from 'react';
import { Button } from 'antd';
import { LoadingOutlined, DownloadOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { mediaUrl } from '../../../api/mediaUrl';

/** Max number of silent auto-retries before showing error UI */
const MAX_AUTO_RETRIES = 2;
/** Delay between auto-retries (ms) — gives time for file to finish writing */
const AUTO_RETRY_DELAY = 1500;

interface LightboxMediaProps {
  path: string | undefined;
  isVideo: boolean;
  isAlbum: boolean;
  albumIndex: number;
  albumPaths: string[] | undefined;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Called when user wants to queue a download for the missing media */
  onDownload?: () => void;
  /** Called when the image failed to load (e.g. expired URL / stale cache) */
  onRetry?: () => void;
}

const useStyles = createStyles(({ css, token }) => ({
  wrap: css`
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 0;
    height: 100%;
    user-select: none;
    position: relative;
    /* Must be above nav buttons (z-index 3) so Download/Retry buttons are clickable */
    z-index: 4;
    /* Allow touches to pass through to nav buttons underneath, except on interactive children */
    pointer-events: none;
    & > * {
      pointer-events: auto;
    }
  `,
  img: css`
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 4px;
    display: block;
  `,
  video: css`
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 4px;
    display: block;
    outline: none;
  `,
  spinner: css`
    font-size: 40px;
    color: rgba(255, 255, 255, 0.45);
  `,
  // Overlay shown OVER the existing image while the next one loads –
  // the previous image stays visible underneath so there's no blank flash.
  loadingOverlay: css`
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
    border-radius: 4px;
    pointer-events: none;
  `,
  errorOverlay: css`
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: ${token.colorTextSecondary};
    font-size: 13px;
    z-index: 4;
    pointer-events: auto;
  `,
  lightboxBtn: css`
    color: rgba(255, 255, 255, 0.85);
    border-color: rgba(255, 255, 255, 0.35);
    background: transparent;
    &:hover,
    &:focus {
      color: #fff;
      border-color: rgba(255, 255, 255, 0.65);
      background: rgba(255, 255, 255, 0.1);
    }
  `,
}));

export function LightboxMedia({
  path,
  isVideo,
  isAlbum,
  albumIndex,
  albumPaths,
  videoRef,
  onDownload,
  onRetry,
}: LightboxMediaProps) {
  const { styles } = useStyles();

  // Ref callback: fires synchronously when the video element mounts/remounts
  // (key={displayPath} guarantees a fresh element on every navigation).
  // Setting volume and calling play() here is more reliable than autoPlay +
  // a useEffect, which runs after paint and races with the browser's own autoplay.
  const videoRefCallback = useCallback(
    (el: HTMLVideoElement | null) => {
      (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
      if (el) {
        el.volume = 0.5;
        void el.play().catch(() => {
          // Autoplay blocked by browser policy — user can tap to play
        });
      }
    },
    // Re-create the callback when path changes so React replaces the video element
    // and the callback fires again for the new element.
    // oxlint-disable-next-line react/exhaustive-deps
    [path, videoRef],
  );

  const displayPath = isAlbum && albumPaths ? (albumPaths[albumIndex] ?? path) : path;

  // Track loading/error per src — reset when displayPath changes without useEffect
  // (React "adjust state during render" pattern to avoid cascading-render lint error).
  const [trackedPath, setTrackedPath] = useState(displayPath);
  const [imgLoading, setImgLoading] = useState(!!displayPath);
  const [imgError, setImgError] = useState(false);
  // Auto-retry: silently reload the image with a cache-buster before showing error UI
  const [retryCount, setRetryCount] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (trackedPath !== displayPath) {
    setTrackedPath(displayPath);
    setImgLoading(!!displayPath);
    setImgError(false);
    setRetryCount(0);
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  // Cleanup timer on unmount
  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  const handleImgError = useCallback(() => {
    if (retryCount < MAX_AUTO_RETRIES) {
      // Silent retry after a delay — file might still be writing to disk
      retryTimerRef.current = setTimeout(() => {
        setRetryCount((n) => n + 1);
        setImgLoading(true);
        setImgError(false);
      }, AUTO_RETRY_DELAY);
      setImgLoading(false);
      setImgError(false); // don't show error UI during auto-retry wait
    } else {
      setImgLoading(false);
      setImgError(true);
      // After exhausting auto-retries, trigger onRetry to refresh data from server
      onRetry?.();
    }
  }, [retryCount, onRetry]);

  /** Image URL with cache-buster to bypass browser/SW cache on retries */
  const imgSrc = displayPath
    ? retryCount > 0
      ? `${mediaUrl(displayPath)}&_r=${retryCount}`
      : mediaUrl(displayPath)
    : '';

  // No path at all — media not downloaded yet
  if (!path) {
    return (
      <div className={styles.wrap}>
        {onDownload ? (
          <div className={styles.errorOverlay}>
            <LoadingOutlined className={styles.spinner} />
            <Button icon={<DownloadOutlined />} onClick={onDownload} className={styles.lightboxBtn}>
              Download
            </Button>
          </div>
        ) : (
          <LoadingOutlined className={styles.spinner} />
        )}
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {isVideo ? (
        // Video must remount when source changes so the browser reloads it
        <video
          ref={videoRefCallback}
          key={displayPath}
          src={mediaUrl(displayPath!)}
          className={styles.video}
          loop
          controls
          playsInline
        />
      ) : (
        <>
          {/* img intentionally has NO key — reusing the same DOM node lets the
              previous image stay visible while the new src is decoding (Issue 12).
              retryCount in key forces a fresh element after auto-retries. */}
          <img
            key={retryCount}
            src={imgSrc}
            alt=""
            className={styles.img}
            draggable={false}
            onLoad={() => {
              setImgLoading(false);
              setImgError(false);
              setRetryCount(0);
            }}
            onError={handleImgError}
          />
          {/* Spinner overlay while loading — previous image stays visible beneath */}
          {imgLoading && !imgError && (
            <div className={styles.loadingOverlay}>
              <LoadingOutlined className={styles.spinner} />
            </div>
          )}
          {/* Error state — shown only after all auto-retries exhausted */}
          {imgError && (
            <div className={styles.errorOverlay}>
              <span>Failed to load</span>
              {onDownload && (
                <Button icon={<DownloadOutlined />} onClick={onDownload} className={styles.lightboxBtn} size="small">
                  Re-download
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
