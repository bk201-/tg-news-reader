import type { ChannelType } from '@shared/types';
import { useEffect } from 'react';
import { mediaUrl } from '../../../api/mediaUrl';
import { useMarkRead } from '../../../api/news';
import type { LightboxState } from '../../../store/uiStore';
import type { UseLightboxNavResult } from './useLightboxNav';

export function useLightboxMediaEffects(
  lightbox: LightboxState | null,
  channelType: ChannelType | undefined,
  nav: UseLightboxNavResult,
) {
  const { mutate: markRead } = useMarkRead();
  const albumIndex = lightbox?.albumIndex ?? 0;
  const isOpen = lightbox !== null;
  const newsId = lightbox?.newsId ?? null;
  const channelId = lightbox?.channelId ?? null;

  // Prefetch adjacent images: 1 behind + 2 ahead (full albums).
  useEffect(() => {
    const { entries, cursor } = nav;
    const entryPaths = (e: (typeof entries)[number] | undefined): string[] => {
      if (!e) return [];
      const paths = e.item.localMediaPaths ?? (e.item.localMediaPath ? [e.item.localMediaPath] : []);
      return paths.filter((p) => !/\.(mp4|webm|mov)$/i.test(p));
    };

    const toPreload: string[] = [
      ...entryPaths(entries[cursor]).slice(albumIndex + 1),
      ...entryPaths(entries[cursor - 1]),
      ...entryPaths(entries[cursor + 1]),
      ...entryPaths(entries[cursor + 2]),
    ];

    toPreload.forEach((p) => {
      const img = new Image();
      img.src = mediaUrl(p);
    });
  }, [nav, albumIndex]);

  // Read only downloaded, unread posts — never album-image changes or revisits.
  useEffect(() => {
    if (!isOpen || newsId === null || channelId === null) return;
    if (channelType !== 'media' && channelType !== 'blog') return;
    if (!nav.firstMediaPath || nav.currentEntry?.item.isRead !== 0) return;
    markRead({ id: newsId, isRead: 1, channelId });
  }, [isOpen, newsId, channelId, channelType, markRead, nav.firstMediaPath, nav.currentEntry?.item.isRead]);
}
