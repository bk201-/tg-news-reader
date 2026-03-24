import { enqueueTask } from './downloadManager.js';
import type { TelegramMessage } from './telegram.js';
import type { ChannelType } from '../../shared/types.js';

export interface PostProcessArgs {
  channelId: number;
  channelTelegramId: string;
  messages: TelegramMessage[];
  insertedMap: Map<number, number>; // telegramMsgId → news.id
}

export interface ChannelPostProcessor {
  /** Runs after messages are inserted. */
  postProcess(args: PostProcessArgs): Promise<void>;
  /** Whether the client should expect media tasks to be queued. */
  requiresMediaProcessing(messages: TelegramMessage[]): boolean;
}

// ─── None ─────────────────────────────────────────────────────────────────────

class NoneStrategy implements ChannelPostProcessor {
  async postProcess(): Promise<void> {
    // Plain channel — post text is the content, nothing to queue
  }

  requiresMediaProcessing(): boolean {
    return false;
  }
}

// ─── Link continuation ────────────────────────────────────────────────────────

class LinkContinuationStrategy implements ChannelPostProcessor {
  async postProcess(): Promise<void> {
    // Content is loaded on demand via "Load article" button → download manager
  }

  requiresMediaProcessing(): boolean {
    return false;
  }
}

// ─── Media content ────────────────────────────────────────────────────────────

class MediaContentStrategy implements ChannelPostProcessor {
  async postProcess({ messages, insertedMap }: PostProcessArgs): Promise<void> {
    // Queue all media as background tasks (priority=0); workers will process them.
    // Skip audio — it is never auto-downloaded (user must explicitly request it).
    const toQueue = messages.filter(
      (m) => m.rawMedia !== undefined && m.mediaType !== 'audio' && insertedMap.has(m.id),
    );
    for (const msg of toQueue) {
      const newsId = insertedMap.get(msg.id)!;
      await enqueueTask(newsId, 'media', undefined, 0);
    }
  }

  requiresMediaProcessing(messages: TelegramMessage[]): boolean {
    return messages.some((m) => m.rawMedia !== undefined);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

const strategyMap: Record<ChannelType, ChannelPostProcessor> = {
  none: new NoneStrategy(),
  link_continuation: new LinkContinuationStrategy(),
  media_content: new MediaContentStrategy(),
};

export function getChannelStrategy(channelType: ChannelType): ChannelPostProcessor {
  return strategyMap[channelType] ?? strategyMap.none;
}
