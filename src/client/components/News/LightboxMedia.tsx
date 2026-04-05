import React, { useCallback, useState } from 'react';
import { Button } from 'antd';
import { LoadingOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { mediaUrl } from '../../api/mediaUrl';

interface LightboxMediaProps {
  path: string | undefined;
  isVideo: boolean;
  isAlbum: boolean;
  albumIndex: number;
  albumPaths: string[] | undefined;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Called when user wants to queue a download for the missing media */
  onDownload?: () => void;
  /** Called when the image failed to load (e.g. expired URL) */
  onRetry?: () => void;
}

const useStyles = createStyles(({ css, token }) => ({
  wrap: css`
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 0;
    user-select: none;
    position: relative;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, videoRef],
  );

  const displayPath = isAlbum && albumPaths ? (albumPaths[albumIndex] ?? path) : path;

  // Track loading/error per src — reset when displayPath changes without useEffect
  // (React "adjust state during render" pattern to avoid cascading-render lint error).
  const [trackedPath, setTrackedPath] = useState(displayPath);
  const [imgLoading, setImgLoading] = useState(!!displayPath);
  const [imgError, setImgError] = useState(false);
  if (trackedPath !== displayPath) {
    setTrackedPath(displayPath);
    setImgLoading(!!displayPath);
    setImgError(false);
  }

  // No path at all — media not downloaded yet
  if (!path) {
    return (
      <div className={styles.wrap}>
        {onDownload ? (
          <div className={styles.errorOverlay} style={{ position: 'static' }}>
            <LoadingOutlined className={styles.spinner} />
            <Button icon={<DownloadOutlined />} onClick={onDownload} ghost>
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
              previous image stay visible while the new src is decoding (Issue 12) */}
          <img
            src={mediaUrl(displayPath!)}
            alt=""
            className={styles.img}
            draggable={false}
            onLoadStart={() => {
              setImgLoading(true);
              setImgError(false);
            }}
            onLoad={() => setImgLoading(false)}
            onError={() => {
              setImgLoading(false);
              setImgError(true);
            }}
          />
          {/* Spinner overlay while loading — previous image stays visible beneath */}
          {imgLoading && !imgError && (
            <div className={styles.loadingOverlay}>
              <LoadingOutlined className={styles.spinner} />
            </div>
          )}
          {/* Error state — broken / expired URL */}
          {imgError && (
            <div className={styles.errorOverlay}>
              <span>Failed to load</span>
              {onRetry && (
                <Button icon={<ReloadOutlined />} onClick={onRetry} ghost size="small">
                  Retry
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
