export type ChannelType = 'none' | 'link_continuation' | 'media_content';

export type DownloadType = 'media' | 'article';
export type DownloadStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface DownloadTask {
  id: number;
  newsId: number;
  type: DownloadType;
  url?: string | null;
  priority: number;
  status: DownloadStatus;
  error?: string | null;
  createdAt: number;
  processedAt?: number | null;
  // Context joined from news + channels
  newsText?: string;
  channelId?: number;
  channelName?: string;
}

export interface Group {
  id: number;
  name: string;
  color: string;
  hasPIN: boolean;
  sortOrder: number;
  createdAt: number;
}

export interface Channel {
  id: number;
  telegramId: string;
  name: string;
  description?: string;
  channelType: ChannelType;
  groupId?: number | null;
  sortOrder: number;
  lastFetchedAt?: number;
  lastReadAt?: number;
  isUnavailable: number;
  unreadCount: number;
  createdAt: number;
}

export interface NewsItem {
  id: number;
  channelId: number;
  telegramMsgId: number;
  text: string;
  links: string[];
  hashtags: string[];
  mediaType?: string;
  isRead: number;
  postedAt: number;
  fullContent?: string;
  localMediaPath?: string;
  localMediaPaths?: string[]; // album: all downloaded paths (JSON-decoded)
  albumMsgIds?: number[]; // album: full list of Telegram msg IDs — length = expected total, even before download
  mediaSize?: number;
}

export interface Filter {
  id: number;
  channelId: number;
  name: string;
  type: 'tag' | 'keyword';
  value: string;
  isActive: number;
  createdAt: number;
}
