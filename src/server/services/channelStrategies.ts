import { enqueueTask } from './downloadManager.js';
import type { TelegramMessage } from './telegram.js';
import type { ChannelType } from '../../shared/types.js';

export interface ItemFlags {
  /** When true, post text goes to collapsible top panel instead of inline body */
  textInPanel: boolean;
  /** When true, "Load article" button is shown for this item */
  canLoadArticle: boolean;
}

export interface PostProcessArgs {
  channelId: number;
  channelTelegramId: string;
  messages: TelegramMessage[];
  insertedMap: Map<number, number>; // telegramMsgId → news.id
}

export interface ChannelStrategy {
  /** Returns per-item flags to persist in the DB. */
  getItemFlags(msg: TelegramMessage): ItemFlags;
  /** Returns true if this message should be excluded from the DB entirely. */
  shouldSkipMessage(msg: TelegramMessage): boolean;
  /** Runs after insertion — e.g. queues background download tasks. */
  postProcess(args: PostProcessArgs): Promise<void>;
  /** Whether the client should open the media-progress SSE after fetch. */
  requiresMediaProcessing(messages: TelegramMessage[]): boolean;
}

// ─── News ─────────────────────────────────────────────────────────────────────
class NewsStrategy implements ChannelStrategy {
  getItemFlags(): ItemFlags {
    return { textInPanel: false, canLoadArticle: false };
  }
  shouldSkipMessage(): boolean {
    return false;
  }
  async postProcess(): Promise<void> {}
  requiresMediaProcessing(): boolean {
    return false;
  }
}

// ─── News with link ───────────────────────────────────────────────────────────
class NewsLinkStrategy implements ChannelStrategy {
  getItemFlags(msg: TelegramMessage): ItemFlags {
    return { textInPanel: false, canLoadArticle: msg.links.length > 0 };
  }
  shouldSkipMessage(): boolean {
    return false;
  }
  async postProcess(): Promise<void> {}
  requiresMediaProcessing(): boolean {
    return false;
  }
}

// ─── Media ────────────────────────────────────────────────────────────────────
class MediaStrategy implements ChannelStrategy {
  getItemFlags(): ItemFlags {
    return { textInPanel: true, canLoadArticle: false };
  }

  shouldSkipMessage(msg: TelegramMessage): boolean {
    // Keep photo, document (videos/files), audio. Drop text-only and webpage-only.
    return !msg.rawMedia || (msg.mediaType !== 'photo' && msg.mediaType !== 'document' && msg.mediaType !== 'audio');
  }

  async postProcess({ messages, insertedMap }: PostProcessArgs): Promise<void> {
    const toQueue = messages.filter(
      (m) => (m.mediaType === 'photo' || m.mediaType === 'document') && insertedMap.has(m.id),
    );
    for (const msg of toQueue) {
      await enqueueTask(insertedMap.get(msg.id)!, 'media', undefined, 0);
    }
  }

  requiresMediaProcessing(messages: TelegramMessage[]): boolean {
    return messages.some((m) => m.mediaType === 'photo' || m.mediaType === 'document');
  }
}

// ─── Blog ─────────────────────────────────────────────────────────────────────
class BlogStrategy implements ChannelStrategy {
  getItemFlags(): ItemFlags {
    return { textInPanel: false, canLoadArticle: false };
  }
  shouldSkipMessage(): boolean {
    return false;
  }

  async postProcess({ messages, insertedMap }: PostProcessArgs): Promise<void> {
    const toQueue = messages.filter(
      (m) => (m.mediaType === 'photo' || m.mediaType === 'document') && insertedMap.has(m.id),
    );
    for (const msg of toQueue) {
      await enqueueTask(insertedMap.get(msg.id)!, 'media', undefined, 0);
    }
  }

  requiresMediaProcessing(messages: TelegramMessage[]): boolean {
    return messages.some((m) => m.mediaType === 'photo' || m.mediaType === 'document');
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

const strategyMap: Record<ChannelType, ChannelStrategy> = {
  news: new NewsStrategy(),
  news_link: new NewsLinkStrategy(),
  media: new MediaStrategy(),
  blog: new BlogStrategy(),
};

export function getChannelStrategy(channelType: ChannelType): ChannelStrategy {
  return strategyMap[channelType] ?? strategyMap.news;
}
