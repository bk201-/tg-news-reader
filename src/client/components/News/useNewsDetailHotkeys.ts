import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { NewsItem, ChannelType } from '@shared/types.ts';
import { isYouTubeUrl } from './newsUtils';

interface UseNewsDetailHotkeysOptions {
  item: NewsItem;
  channelType: ChannelType;
  openUrl: string;
  articleQueued: boolean;
  isAlbum: boolean;
  albumLength: number;
  albumExpectedLength: number;
  /** Called on R — refresh news list */
  onRefresh: () => void;
  /** Called on F (single non-YT link) — queue article extraction */
  onExtractArticle: (url: string) => void;
}

export interface UseNewsDetailHotkeysResult {
  albumIndex: number;
  setAlbumIndex: Dispatch<SetStateAction<number>>;
  topPanel: 'links' | 'text' | null;
  setTopPanel: Dispatch<SetStateAction<'links' | 'text' | null>>;
  linkModalOpen: boolean;
  setLinkModalOpen: Dispatch<SetStateAction<boolean>>;
  selectedUrl: string;
  setSelectedUrl: Dispatch<SetStateAction<string>>;
}

/**
 * Manages keyboard hotkeys for the news detail view (capture phase so it fires
 * before useNewsHotkeys which listens in the bubble phase).
 *
 * Also owns the UI state driven by those hotkeys so NewsDetail stays lean.
 * State is reset automatically when the viewed item changes (item.id).
 *
 * R             — refresh news list
 * L             — toggle links panel
 * T             — toggle text panel
 * F             — fetch/queue article (link_continuation channels)
 * Enter         — open URL in new tab
 * Escape        — close top panel
 * ArrowLeft/Right — navigate album images
 * Space         — advance album (blocks mark-as-read while album has unseen images)
 *
 * All letter keys use e.code so they work regardless of keyboard layout
 * (Russian, Czech, etc.).
 */
export function useNewsDetailHotkeys({
  item,
  channelType,
  openUrl,
  articleQueued,
  isAlbum,
  albumLength,
  albumExpectedLength,
  onRefresh,
  onExtractArticle,
}: UseNewsDetailHotkeysOptions): UseNewsDetailHotkeysResult {
  const [topPanel, setTopPanel] = useState<'links' | 'text' | null>(null);
  const [albumIndex, setAlbumIndex] = useState(0);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState('');

  // Reset all state when the viewed item changes (accordion mode reuses the component)
  useEffect(() => {
    setTopPanel(null);
    setAlbumIndex(0);
    setLinkModalOpen(false);
    setSelectedUrl('');
  }, [item.id]);

  const links = item.links || [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'button' ||
        tag === 'a' ||
        (e.target as HTMLElement).isContentEditable
      )
        return;

      // Use e.code for letter keys so hotkeys work regardless of keyboard layout
      // (Russian, Czech, etc. produce different e.key values for the same physical key).
      // e.code always reflects physical key position: 'KeyR', 'KeyL', 'KeyT', 'KeyF'.
      // Arrow keys, Space, Enter, Escape are layout-independent — e.key is fine there.
      switch (e.code) {
        case 'KeyR':
          e.preventDefault();
          onRefresh();
          break;
        case 'KeyL':
          if (links.length > 0) {
            e.preventDefault();
            setTopPanel((p) => (p === 'links' ? null : 'links'));
          }
          break;
        case 'KeyT':
          if (item.text) {
            e.preventDefault();
            setTopPanel((p) => (p === 'text' ? null : 'text'));
          }
          break;
        case 'KeyF': {
          const nonYt = links.filter((l) => !isYouTubeUrl(l));
          if (channelType === 'link_continuation' && !item.fullContent && nonYt.length > 0 && !articleQueued) {
            e.preventDefault();
            if (nonYt.length === 1) {
              onExtractArticle(nonYt[0]);
            } else {
              setSelectedUrl(nonYt[0]);
              setLinkModalOpen(true);
            }
          }
          break;
        }
        case 'Enter':
          e.preventDefault();
          window.open(openUrl, '_blank', 'noopener,noreferrer');
          break;
        case 'Escape':
          if (topPanel) {
            e.preventDefault();
            setTopPanel(null);
          }
          break;
        case 'ArrowLeft':
          if (isAlbum && albumIndex > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setAlbumIndex((i) => i - 1);
          }
          break;
        case 'ArrowRight':
          if (isAlbum && albumIndex < albumLength - 1) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setAlbumIndex((i) => i + 1);
          }
          break;
        case 'Space':
          // Block Space → mark-as-read while there are more album images to view.
          // Gated on albumExpectedLength (not isAlbum) so it works even when only
          // 0–1 images are downloaded but the album is known to have more.
          if (albumExpectedLength > 1 && albumIndex < albumExpectedLength - 1) {
            e.preventDefault();
            e.stopImmediatePropagation();
            // Navigate only within already-downloaded images
            if (albumIndex < albumLength - 1) setAlbumIndex((i) => i + 1);
          }
          break;
      }
    };

    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [
    links,
    item.text,
    item.fullContent,
    channelType,
    openUrl,
    topPanel,
    articleQueued,
    isAlbum,
    albumIndex,
    albumLength,
    albumExpectedLength,
    onRefresh,
    onExtractArticle,
  ]);

  return { albumIndex, setAlbumIndex, topPanel, setTopPanel, linkModalOpen, setLinkModalOpen, selectedUrl, setSelectedUrl };
}

