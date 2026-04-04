import React from 'react';
import { Button, Typography } from 'antd';
import { DownloadOutlined, LoadingOutlined, LeftOutlined, RightOutlined, SoundOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { NewsItem } from '@shared/types.ts';
import { mediaUrl } from '../../api/mediaUrl';
import { formatBytes } from './newsUtils';
import { useUIStore } from '../../store/uiStore';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  media: css`
    text-align: center;
    margin-bottom: 12px;
    width: 100%;
  `,
  mediaAlbum: css`
    text-align: left;
  `,
  mediaFile: css`
    display: block;
    max-width: 100%;
    max-height: calc(100vh - 300px);
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 8px;
    margin: 0 auto;
    cursor: pointer;
  `,
  audioPlayer: css`
    display: block;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
  `,
  audioPlaceholder: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 16px 12px;
    gap: 4px;
    color: ${token.colorTextSecondary};
    font-size: 32px;
  `,
  carousel: css`
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    &:hover .carousel-btn {
      opacity: 1;
    }
  `,
  carouselBtn: css`
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 2;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    border: none;
    border-radius: 50%;
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    cursor: pointer;
    opacity: 0;
    transition:
      opacity 0.18s,
      background 0.18s;
    &:disabled {
      opacity: 0.15 !important;
      cursor: default;
    }
    &:not(:disabled):hover {
      background: rgba(0, 0, 0, 0.65);
    }
  `,
  carouselBtnPrev: css`
    left: 8px;
  `,
  carouselBtnNext: css`
    right: 8px;
  `,
  counter: css`
    text-align: center;
    font-size: 12px;
    color: ${token.colorTextSecondary};
    margin-top: 6px;
  `,
  counterHint: css`
    opacity: 0.6;
  `,
  albumGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 6px;
  `,
  albumImg: css`
    width: 100%;
    height: 180px;
    object-fit: cover;
    border-radius: 6px;
    display: block;
  `,
  download: css`
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
  `,
  mediaError: css`
    font-size: 12px;
    display: block;
    margin-top: 8px;
  `,
}));

interface NewsDetailMediaProps {
  item: NewsItem;
  firstMediaPath?: string;
  isAlbum: boolean;
  isVideo: boolean;
  /** true when the post is an audio message (shows audio player when downloaded) */
  isAudio: boolean;
  albumIndex: number;
  albumLength: number; // downloaded images count (navigation limit)
  albumExpectedLength: number; // expected total from albumMsgIds (counter + Space-hint)
  onAlbumNav: (delta: -1 | 1) => void;
  mediaLoading: boolean;
  mediaQueued: boolean;
  mediaTaskStatus?: string;
  mediaTaskError?: string;
  onDownload: () => void;
}

export function NewsDetailMedia({
  item,
  firstMediaPath,
  isAlbum,
  isVideo,
  isAudio,
  albumIndex,
  albumLength,
  albumExpectedLength,
  onAlbumNav,
  mediaLoading,
  mediaQueued,
  mediaTaskStatus,
  mediaTaskError,
  onDownload,
}: NewsDetailMediaProps) {
  const { styles, cx } = useStyles();
  const { t } = useTranslation();
  const openLightbox = useUIStore((s) => s.openLightbox);

  if (isAlbum) {
    const paths = item.localMediaPaths!;
    return (
      <div className={cx(styles.media, styles.mediaAlbum)}>
        <div className={styles.carousel}>
          <button
            className={cx(styles.carouselBtn, styles.carouselBtnPrev, 'carousel-btn')}
            onClick={() => onAlbumNav(-1)}
            disabled={albumIndex === 0}
            aria-label={t('news.detail.prev')}
          >
            <LeftOutlined />
          </button>
          <img
            src={mediaUrl(paths[albumIndex])}
            alt={t('news.detail.photo_alt', { current: albumIndex + 1, total: albumExpectedLength })}
            className={styles.mediaFile}
            onClick={() => openLightbox(item.id, albumIndex, item.channelId)}
          />
          <button
            className={cx(styles.carouselBtn, styles.carouselBtnNext, 'carousel-btn')}
            onClick={() => onAlbumNav(1)}
            disabled={albumIndex === albumLength - 1}
            aria-label={t('news.detail.next')}
          >
            <RightOutlined />
          </button>
        </div>
        <div className={styles.counter}>
          {/* Show expected total so the user sees e.g. "2 / 10" even when only 2 are downloaded */}
          <span>
            {albumIndex + 1} / {albumExpectedLength}
          </span>
          {albumIndex === albumExpectedLength - 1 && (
            <span className={styles.counterHint}>{t('news.detail.space_hint')}</span>
          )}
        </div>
      </div>
    );
  }

  if (firstMediaPath) {
    return (
      <div className={styles.media}>
        {isAudio ? (
          <>
            <div className={styles.audioPlaceholder}>
              <SoundOutlined />
            </div>
            <audio src={mediaUrl(firstMediaPath)} controls className={styles.audioPlayer} />
          </>
        ) : isVideo ? (
          <video
            src={mediaUrl(firstMediaPath)}
            controls
            muted
            autoPlay
            loop
            className={styles.mediaFile}
            onClick={() => openLightbox(item.id, 0, item.channelId)}
            style={{ cursor: 'pointer' }}
          />
        ) : (
          <img
            src={mediaUrl(firstMediaPath)}
            alt="media"
            className={styles.mediaFile}
            onClick={() => openLightbox(item.id, 0, item.channelId)}
          />
        )}
      </div>
    );
  }

  if (item.mediaType && item.mediaType !== 'webpage' && item.mediaType !== 'other') {
    return (
      <div className={styles.download}>
        <Button
          icon={mediaLoading ? <LoadingOutlined /> : <DownloadOutlined />}
          onClick={onDownload}
          loading={mediaLoading}
          disabled={mediaQueued}
        >
          {mediaQueued
            ? t('news.detail.queued')
            : mediaTaskStatus === 'failed'
              ? t('news.detail.retry_download')
              : item.mediaSize
                ? t('news.detail.download_media_size', { size: formatBytes(item.mediaSize) })
                : t('news.detail.download_media')}
        </Button>
        {mediaTaskStatus === 'failed' && (
          <Text type="danger" className={styles.mediaError}>
            {t('news.detail.error', { error: mediaTaskError })}
          </Text>
        )}
      </div>
    );
  }

  return null;
}
