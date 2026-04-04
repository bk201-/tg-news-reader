import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NewsItem } from '@shared/types.ts';
import type { NewsResponse } from '../../api/news';

/** Media types that appear in the lightbox (photo + document covers images and videos) */
const LIGHTBOX_MEDIA_TYPES = new Set(['photo', 'document']);

export interface LightboxEntry {
  newsId: number;
  item: NewsItem;
}

export interface UseLightboxNavResult {
  /** All media entries in the channel, sorted by postedAt */
  entries: LightboxEntry[];
  /** Index of the current news item in entries[] */
  cursor: number;
  currentEntry: LightboxEntry | null;
  /** True when the current item is a video */
  isVideo: boolean;
  /** True when current item has ≥2 downloaded images */
  isAlbum: boolean;
  /** Number of downloaded images in the current album */
  albumLength: number;
  /** Expected total album size (from albumMsgIds) */
  albumExpectedLength: number;
  /** First media path of the current entry */
  firstMediaPath: string | undefined;
  go: (delta: -1 | 1) => void;
  goToAlbumImage: (delta: -1 | 1) => void;
  totalCount: number;
  /** 1-based position string for display: "3 / 12" */
  positionLabel: string;
}

export function useLightboxNav(
  channelId: number,
  newsId: number,
  albumIndex: number,
  onNavigate: (newsId: number, albumIndex: number) => void,
): UseLightboxNavResult {
  const qc = useQueryClient();

  // Try all possible cache keys — whichever was loaded last is fine for building the media list
  const newsData =
    qc.getQueryData<NewsResponse>(['news', channelId, 'all']) ??
    qc.getQueryData<NewsResponse>(['news', channelId, 'filtered']);

  const entries = useMemo<LightboxEntry[]>(() => {
    const items = newsData?.items ?? [];
    return items
      .filter((item) => item.mediaType && LIGHTBOX_MEDIA_TYPES.has(item.mediaType))
      .map((item) => ({ newsId: item.id, item }));
  }, [newsData]);

  const cursor = useMemo(() => entries.findIndex((e) => e.newsId === newsId), [entries, newsId]);
  const currentEntry = cursor >= 0 ? entries[cursor] : null;

  const item = currentEntry?.item;
  const firstMediaPath = item?.localMediaPaths?.[0] ?? item?.localMediaPath;
  const isVideo = /\.(mp4|webm)$/i.test(firstMediaPath ?? '');
  const albumLength = item?.localMediaPaths?.length ?? 0;
  const albumExpectedLength = item?.albumMsgIds?.length ?? albumLength;
  const isAlbum = albumLength > 1;

  const totalCount = entries.length;
  // Position: "item N / total (image M/K)" for albums
  const positionLabel = useMemo(() => {
    if (cursor < 0) return '';
    const itemPos = `${cursor + 1} / ${totalCount}`;
    if (isAlbum) return `${itemPos} · ${albumIndex + 1}/${albumExpectedLength}`;
    return itemPos;
  }, [cursor, totalCount, isAlbum, albumIndex, albumExpectedLength]);

  const go = (delta: -1 | 1) => {
    if (entries.length === 0) return;
    // Circular navigation
    const next = (cursor + delta + entries.length) % entries.length;
    onNavigate(entries[next].newsId, 0);
  };

  const goToAlbumImage = (delta: -1 | 1) => {
    if (!item) return;
    const maxIdx = albumLength - 1;
    const next = Math.max(0, Math.min(maxIdx, albumIndex + delta));
    if (next !== albumIndex) {
      onNavigate(newsId, next);
    }
  };

  return {
    entries,
    cursor,
    currentEntry,
    isVideo,
    isAlbum,
    albumLength,
    albumExpectedLength,
    firstMediaPath,
    go,
    goToAlbumImage,
    totalCount,
    positionLabel,
  };
}
