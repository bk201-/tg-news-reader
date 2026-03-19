import React from 'react';
import { Button, Typography, Image } from 'antd';
import { DownloadOutlined, LoadingOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import type { NewsItem } from '@shared/types.ts';
import { mediaUrl } from '../../api/mediaUrl';
import { formatBytes } from './newsUtils';

const { Text } = Typography;

interface NewsDetailMediaProps {
  item: NewsItem;
  firstMediaPath?: string;
  isAlbum: boolean;
  isVideo: boolean;
  albumIndex: number;
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
  albumIndex,
  onAlbumNav,
  mediaLoading,
  mediaQueued,
  mediaTaskStatus,
  mediaTaskError,
  onDownload,
}: NewsDetailMediaProps) {
  if (isAlbum) {
    const paths = item.localMediaPaths!;
    const albumLength = paths.length;
    return (
      <div className="news-detail__media news-detail__media--album">
        <div className="news-detail__album-carousel">
          <button
            className="news-detail__album-btn news-detail__album-btn--prev"
            onClick={() => onAlbumNav(-1)}
            disabled={albumIndex === 0}
            aria-label="Предыдущее"
          >
            <LeftOutlined />
          </button>
          <Image
            src={mediaUrl(paths[albumIndex])}
            alt={`Фото ${albumIndex + 1} из ${albumLength}`}
            className="news-detail__media-file"
          />
          <button
            className="news-detail__album-btn news-detail__album-btn--next"
            onClick={() => onAlbumNav(1)}
            disabled={albumIndex === albumLength - 1}
            aria-label="Следующее"
          >
            <RightOutlined />
          </button>
        </div>
        <div className="news-detail__album-counter">
          <span>
            {albumIndex + 1} / {albumLength}
          </span>
          {albumIndex === albumLength - 1 && (
            <span className="news-detail__album-counter-hint"> · Пробел = прочитано</span>
          )}
        </div>
      </div>
    );
  }

  if (firstMediaPath) {
    return (
      <div className="news-detail__media">
        {isVideo ? (
          <video src={mediaUrl(firstMediaPath)} controls muted autoPlay loop className="news-detail__media-file" />
        ) : (
          <img src={mediaUrl(firstMediaPath)} alt="media" className="news-detail__media-file" />
        )}
      </div>
    );
  }

  if (item.mediaType && item.mediaType !== 'webpage' && item.mediaType !== 'other') {
    return (
      <div className="news-detail__media-download">
        <Button
          icon={mediaLoading ? <LoadingOutlined /> : <DownloadOutlined />}
          onClick={onDownload}
          loading={mediaLoading}
          disabled={mediaQueued}
          size="large"
        >
          {mediaQueued
            ? 'В очереди…'
            : mediaTaskStatus === 'failed'
              ? 'Повторить загрузку'
              : `Скачать медиа${item.mediaSize ? ` (${formatBytes(item.mediaSize)})` : ''}`}
        </Button>
        {mediaTaskStatus === 'failed' && (
          <Text type="danger" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
            Ошибка: {mediaTaskError}
          </Text>
        )}
      </div>
    );
  }

  return null;
}
