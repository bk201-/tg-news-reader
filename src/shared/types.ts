export type ChannelType = 'none' | 'link_continuation' | 'media_content';

export interface Channel {
  id: number;
  telegramId: string;
  name: string;
  description?: string;
  channelType: ChannelType;
  lastFetchedAt?: number;
  lastReadAt?: number;
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

