import type { NewsViewMode } from '../../../store/uiStore';

export interface NewsFeedToolbarProps {
  fetchPending: boolean;
  fetchPeriod: string;
  onFetchDefault: () => void;
  onFetchPeriod: (val: string | number) => void;
  showAll: boolean;
  onToggleShowAll: () => void;
  markAllPending: boolean;
  onMarkAllRead: () => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  hashTagFilter: string | null;
  onClearHashTag: () => void;
  shownCount: number;
  hiddenCount: number;
  totalCount: number;
  unreadCount: number;
  newsViewMode: NewsViewMode;
  onSetViewMode: (mode: NewsViewMode) => void;
  isMobile?: boolean;
  onOpenDigest: () => void;
  /** Whether to show the Digest button (false for media-only channels) */
  showDigest?: boolean;
  /** Telegram ID of the current channel, used to render an "Open in Telegram" link */
  channelTelegramId?: string;
}
