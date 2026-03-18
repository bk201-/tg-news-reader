export type ChannelType = 'none' | 'link_continuation' | 'media_content';

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
