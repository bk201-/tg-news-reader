import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../logger.js';
import { telegramCircuit } from './telegramCircuitBreaker.js';
import { MAX_PHOTO_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES, MAX_IMG_DOC_SIZE_BYTES } from '../config.js';

let client: TelegramClient | null = null;

const API_ID = parseInt(process.env.TG_API_ID || '0', 10);
const API_HASH = process.env.TG_API_HASH || '';
const SESSION = process.env.TG_SESSION || '';

export async function getTelegramClient(): Promise<TelegramClient> {
  if (client && client.connected) {
    return client;
  }

  const stringSession = new StringSession(SESSION);
  client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.connect();
  return client;
}

export interface TelegramMessage {
  id: number;
  message: string;
  date: number;
  links: string[];
  hashtags: string[];
  mediaType?: string;
  mediaSizeBytes?: number;
  rawMedia?: Api.TypeMessageMedia;
  // Album support
  groupedId?: string;
  rawMediaItems?: Api.TypeMessageMedia[];
  albumTelegramIds?: number[];
  // Telegram Instant View: full article text extracted from Page blocks at fetch time
  instantViewContent?: string;
}

function extractLinks(text: string, entities?: Api.TypeMessageEntity[]): string[] {
  const links: string[] = [];
  if (entities) {
    for (const entity of entities) {
      if (entity instanceof Api.MessageEntityUrl) {
        links.push(text.substring(entity.offset, entity.offset + entity.length));
      } else if (entity instanceof Api.MessageEntityTextUrl) {
        links.push(entity.url);
      }
    }
  }
  const urlRegex = /https?:\/\/[^\s\]]+/g;
  for (const url of text.match(urlRegex) ?? []) {
    if (!links.includes(url)) links.push(url);
  }
  return links;
}

function extractHashtags(text: string, entities?: Api.TypeMessageEntity[]): string[] {
  const hashtags: string[] = [];
  if (entities) {
    for (const entity of entities) {
      if (entity instanceof Api.MessageEntityHashtag) {
        hashtags.push(text.substring(entity.offset, entity.offset + entity.length).toLowerCase());
      }
    }
  }
  const tagRegex = /#[\wа-яА-Я]+/gu;
  for (const tag of text.match(tagRegex) ?? []) {
    const normalized = tag.toLowerCase();
    if (!hashtags.includes(normalized)) hashtags.push(normalized);
  }
  return hashtags;
}

const BATCH_SIZE = 100;

// ─── Instant View helpers ─────────────────────────────────────────────────────

/** Recursively extracts plain text from a Telegram IV rich-text node. */
function richTextToString(rt: Api.TypeRichText): string {
  if (!rt) return '';
  if (rt instanceof Api.TextEmpty) return '';
  if (rt instanceof Api.TextPlain) return rt.text;
  if (rt instanceof Api.TextConcat) return rt.texts.map(richTextToString).join('');
  if (rt instanceof Api.TextImage) return '';
  // TextBold, TextItalic, TextUnderline, TextStrike, TextFixed,
  // TextUrl, TextEmail, TextSubscript, TextSuperscript, TextMarked, TextPhone, TextAnchor
  // all have a single `.text: TypeRichText` child.
  const wrapped = rt as unknown as { text?: Api.TypeRichText };
  return wrapped.text ? richTextToString(wrapped.text) : '';
}

/** Extracts readable plain text from Telegram Instant View page blocks. */
function extractInstantViewText(blocks: Api.TypePageBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (
      block instanceof Api.PageBlockTitle ||
      block instanceof Api.PageBlockSubtitle ||
      block instanceof Api.PageBlockHeader ||
      block instanceof Api.PageBlockSubheader ||
      block instanceof Api.PageBlockKicker ||
      block instanceof Api.PageBlockParagraph ||
      block instanceof Api.PageBlockPreformatted ||
      block instanceof Api.PageBlockFooter
    ) {
      const text = richTextToString(block.text);
      if (text.trim()) parts.push(text.trim());
    } else if (block instanceof Api.PageBlockBlockquote || block instanceof Api.PageBlockPullquote) {
      const text = richTextToString(block.text);
      if (text.trim()) parts.push(`> ${text.trim()}`);
    } else if (block instanceof Api.PageBlockList) {
      for (const item of block.items) {
        if (item instanceof Api.PageListItemText) {
          const text = richTextToString(item.text);
          if (text.trim()) parts.push(`• ${text.trim()}`);
        } else if (item instanceof Api.PageListItemBlocks) {
          const subText = extractInstantViewText(item.blocks);
          if (subText.trim()) parts.push(`• ${subText.trim()}`);
        }
      }
    } else if (block instanceof Api.PageBlockOrderedList) {
      for (const item of block.items) {
        if (item instanceof Api.PageListOrderedItemText) {
          const text = richTextToString(item.text);
          if (text.trim()) parts.push(`${item.num} ${text.trim()}`);
        } else if (item instanceof Api.PageListOrderedItemBlocks) {
          const subText = extractInstantViewText(item.blocks);
          if (subText.trim()) parts.push(subText.trim());
        }
      }
    } else if (block instanceof Api.PageBlockDetails) {
      const title = richTextToString(block.title);
      if (title.trim()) parts.push(title.trim());
      const subText = extractInstantViewText(block.blocks);
      if (subText.trim()) parts.push(subText.trim());
    }
    // Skip: Divider, Anchor, Photo, Video, Audio, Embed, Channel, Map,
    // RelatedArticles, Cover, Table, AuthorDate, EmbedPost, Collage, Slideshow.
  }
  return parts.join('\n\n');
}

function parseMessageFields(msg: Api.Message, channelUsername: string): TelegramMessage | null {
  void channelUsername;
  if (!msg.message && !msg.media) return null;

  const text = msg.message || '';
  const links = extractLinks(text, msg.entities);
  const hashtags = extractHashtags(text, msg.entities);

  let mediaType: string | undefined;
  let mediaSizeBytes: number | undefined;
  let instantViewContent: string | undefined;

  if (msg.media) {
    if (msg.media instanceof Api.MessageMediaPhoto) {
      mediaType = 'photo';
      const photo = msg.media.photo;
      if (photo instanceof Api.Photo) {
        const photoSizes = photo.sizes.filter((s) => s instanceof Api.PhotoSize);
        const largest = photoSizes.sort((a, b) => b.size - a.size)[0];
        if (largest) mediaSizeBytes = largest.size;
      }
    } else if (msg.media instanceof Api.MessageMediaDocument) {
      const doc = msg.media.document;
      if (doc instanceof Api.Document) {
        mediaSizeBytes = Number(doc.size);
        const mime = doc.mimeType ?? '';
        mediaType = mime.startsWith('audio/') || mime === 'application/ogg' ? 'audio' : 'document';
      } else {
        mediaType = 'document';
      }
    } else if (msg.media instanceof Api.MessageMediaWebPage) {
      mediaType = 'webpage';
      const wp = msg.media.webpage;
      if (wp instanceof Api.WebPage && wp.cachedPage instanceof Api.Page) {
        const text = extractInstantViewText(wp.cachedPage.blocks);
        if (text) instantViewContent = text;
      }
    } else {
      mediaType = 'other';
    }
  }

  return {
    id: msg.id,
    message: text,
    date: msg.date || 0,
    links,
    hashtags,
    mediaType,
    mediaSizeBytes,
    rawMedia: msg.media ?? undefined,
    groupedId: msg.groupedId != null ? String(msg.groupedId) : undefined,
    instantViewContent,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchChannelMessages(
  channelUsername: string,
  options: { sinceDate?: Date; limit?: number; offsetId?: number } = {},
): Promise<TelegramMessage[]> {
  return telegramCircuit.execute(() => _fetchChannelMessages(channelUsername, options), 'fetchChannelMessages');
}

async function _fetchChannelMessages(
  channelUsername: string,
  options: { sinceDate?: Date; limit?: number; offsetId?: number } = {},
): Promise<TelegramMessage[]> {
  const tg = await getTelegramClient();
  const { sinceDate, limit = 500 } = options;
  const allMessages: TelegramMessage[] = [];
  let offsetId = options.offsetId ?? 0;

  try {
    while (true) {
      const result = await tg.getMessages(channelUsername, {
        limit: BATCH_SIZE,
        ...(offsetId ? { offsetId } : {}),
      });

      if (!result || result.length === 0) break;
      let reachedSinceDate = false;

      for (const msg of result) {
        if (!(msg instanceof Api.Message)) continue;
        const msgDate = new Date((msg.date || 0) * 1000);
        if (sinceDate && msgDate <= sinceDate) {
          reachedSinceDate = true;
          break;
        }
        const parsed = parseMessageFields(msg, channelUsername);
        if (parsed) allMessages.push(parsed);
      }

      if (reachedSinceDate) break;
      if (result.length < BATCH_SIZE) break;
      if (allMessages.length >= limit) break;

      const lastMsg = result[result.length - 1];
      if (lastMsg instanceof Api.Message) {
        offsetId = lastMsg.id;
      } else {
        break;
      }
    }
  } catch (err) {
    logger.error({ module: 'telegram', channelUsername, err }, 'Error fetching Telegram messages');
    throw err;
  }

  // ── Album grouping ──────────────────────────────────────────────────────────
  const groupMap = new Map<string, TelegramMessage[]>();
  const singles: TelegramMessage[] = [];

  for (const msg of allMessages) {
    if (msg.groupedId) {
      const bucket = groupMap.get(msg.groupedId) ?? [];
      bucket.push(msg);
      groupMap.set(msg.groupedId, bucket);
    } else {
      singles.push(msg);
    }
  }

  const albumPrimaries: TelegramMessage[] = [];
  for (const group of groupMap.values()) {
    group.sort((a, b) => a.id - b.id);
    const primary = group[0];
    const rawMediaItems = group.map((g) => g.rawMedia).filter((m): m is Api.TypeMessageMedia => m !== undefined);
    const totalSize = group.reduce((sum, g) => sum + (g.mediaSizeBytes ?? 0), 0);
    albumPrimaries.push({
      ...primary,
      rawMediaItems: rawMediaItems.length > 1 ? rawMediaItems : undefined,
      albumTelegramIds: group.length > 1 ? group.map((g) => g.id) : undefined,
      mediaSizeBytes: totalSize > 0 ? totalSize : primary.mediaSizeBytes,
    });
  }

  return [...singles, ...albumPrimaries].sort((a, b) => a.date - b.date);
}

export interface ChannelInfo {
  name: string;
  username: string | null;
  description: string | null;
}

export async function getChannelInfo(username: string): Promise<ChannelInfo> {
  return telegramCircuit.execute(async () => {
    const tg = await getTelegramClient();
    const entity = await tg.getEntity(username);
    let name = 'Unknown';
    let resolvedUsername: string | null = null;
    let description: string | null = null;

    if (entity instanceof Api.Channel || entity instanceof Api.Chat) {
      name = (entity as Api.Channel).title ?? name;
      resolvedUsername = (entity as Api.Channel).username ?? null;
      try {
        const full = await tg.invoke(new Api.channels.GetFullChannel({ channel: entity as Api.Channel }));
        description = (full.fullChat as Api.ChannelFull).about || null;
      } catch {
        // description not critical
      }
    } else if (entity instanceof Api.User) {
      name = [entity.firstName, entity.lastName].filter(Boolean).join(' ') || name;
      resolvedUsername = entity.username ?? null;
    }

    return { name, username: resolvedUsername, description };
  }, 'getChannelInfo');
}

/** Returns the last read message ID for a channel from Telegram (readInboxMaxId) */
export async function getReadInboxMaxId(channelUsername: string): Promise<number | null> {
  try {
    return await telegramCircuit.execute(async () => {
      const tg = await getTelegramClient();
      const inputPeer = await tg.getInputEntity(channelUsername);
      const result = await tg.invoke(
        new Api.messages.GetPeerDialogs({
          peers: [new Api.InputDialogPeer({ peer: inputPeer })],
        }),
      );
      const dialog = result.dialogs[0];
      if (!dialog || !('readInboxMaxId' in dialog)) return null;
      const maxId = dialog.readInboxMaxId;
      return maxId > 0 ? maxId : null;
    }, 'getReadInboxMaxId');
  } catch (err) {
    logger.warn({ module: 'telegram', channelUsername, err }, 'Failed to get readInboxMaxId from Telegram');
    return null;
  }
}

/** Marks all messages up to maxId as read in Telegram (syncs read state across all devices) */
export async function readChannelHistory(channelUsername: string, maxId: number): Promise<void> {
  await telegramCircuit.execute(async () => {
    const tg = await getTelegramClient();
    const entity = await tg.getEntity(channelUsername);
    await tg.invoke(new Api.channels.ReadHistory({ channel: entity, maxId }));
  }, 'readChannelHistory');
}

/** Downloads media for a message. Returns relative path like "channelId/123.jpg" or null.
 *  Pass ignoreLimit=true for user-initiated (on-demand) downloads. */
export async function downloadMessageMedia(
  msg: TelegramMessage,
  channelTelegramId: string,
  options: { ignoreLimit?: boolean } = {},
): Promise<string | null> {
  if (!msg.rawMedia) return null;

  let ext: string;

  if (msg.rawMedia instanceof Api.MessageMediaPhoto) {
    ext = 'jpg';
    if (!options.ignoreLimit && msg.mediaSizeBytes && msg.mediaSizeBytes > MAX_PHOTO_SIZE_BYTES) return null;
  } else if (msg.rawMedia instanceof Api.MessageMediaDocument) {
    const doc = msg.rawMedia.document;
    if (!(doc instanceof Api.Document)) return null;
    const sizeNum = Number(doc.size ?? 0);
    const mime = doc.mimeType ?? '';
    if (mime === 'image/jpeg') ext = 'jpg';
    else if (mime === 'image/png') ext = 'png';
    else if (mime === 'image/gif') ext = 'gif';
    else if (mime === 'image/webp') ext = 'webp';
    else if (mime === 'video/mp4') ext = 'mp4';
    else if (mime === 'video/webm') ext = 'webm';
    // Audio formats — only allow on-demand (user-initiated) downloads
    else if (mime === 'audio/ogg' || mime === 'application/ogg') ext = 'ogg';
    else if (mime === 'audio/mpeg') ext = 'mp3';
    else if (mime === 'audio/mp4' || mime === 'audio/m4a' || mime === 'audio/x-m4a') ext = 'm4a';
    else if (mime === 'audio/flac' || mime === 'audio/x-flac') ext = 'flac';
    else if (mime === 'audio/wav' || mime === 'audio/x-wav' || mime === 'audio/wave') ext = 'wav';
    else return null;

    const isAudio = mime.startsWith('audio/') || mime === 'application/ogg';
    if (!options.ignoreLimit) {
      // Audio is never auto-downloaded — user must explicitly request it
      if (isAudio) return null;
      const isVideo = ext === 'mp4' || ext === 'webm';
      const limit = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMG_DOC_SIZE_BYTES;
      if (sizeNum > limit) return null;
    }
  } else {
    return null;
  }

  const dir = join(process.cwd(), 'data', channelTelegramId);
  mkdirSync(dir, { recursive: true });

  const filename = `${msg.id}.${ext!}`;
  const filepath = join(dir, filename);

  // Skip download if file already exists (idempotent)
  if (existsSync(filepath)) return `${channelTelegramId}/${filename}`;

  // Only the actual network download goes through the circuit breaker
  return telegramCircuit.execute(async () => {
    const tg = await getTelegramClient();
    // Pass outputFile so gramjs writes directly to disk — avoids buffering the whole
    // file in memory (a 75 MB video would otherwise allocate a 75 MB Buffer per worker).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    const result = await tg.downloadMedia(msg.rawMedia!, { outputFile: filepath } as any);
    if (!result) return null;
    return `${channelTelegramId}/${filename}`;
  }, 'downloadMessageMedia');
}

/** Fetches a single message by Telegram message ID (for on-demand media download). */
export async function fetchMessageById(channelUsername: string, msgId: number): Promise<TelegramMessage | null> {
  try {
    return await telegramCircuit.execute(async () => {
      const tg = await getTelegramClient();
      const result = await tg.getMessages(channelUsername, { ids: [msgId] });
      const msg = result[0];
      if (!(msg instanceof Api.Message)) return null;

      const text = msg.message || '';
      const links = extractLinks(text, msg.entities);
      const hashtags = extractHashtags(text, msg.entities);
      let mediaType: string | undefined;
      let mediaSizeBytes: number | undefined;

      if (msg.media) {
        if (msg.media instanceof Api.MessageMediaPhoto) {
          mediaType = 'photo';
          const photo = msg.media.photo;
          if (photo instanceof Api.Photo) {
            const photoSizes = photo.sizes.filter((s) => s instanceof Api.PhotoSize);
            const largest = photoSizes.sort((a, b) => b.size - a.size)[0];
            if (largest) mediaSizeBytes = largest.size;
          }
        } else if (msg.media instanceof Api.MessageMediaDocument) {
          mediaType = 'document';
          const doc = msg.media.document;
          if (doc instanceof Api.Document) mediaSizeBytes = Number(doc.size);
        } else if (msg.media instanceof Api.MessageMediaWebPage) {
          mediaType = 'webpage';
        } else {
          mediaType = 'other';
        }
      }

      return {
        id: msg.id,
        message: text,
        date: msg.date || 0,
        links,
        hashtags,
        mediaType,
        mediaSizeBytes,
        rawMedia: msg.media ?? undefined,
      };
    }, 'fetchMessageById');
  } catch (err) {
    logger.warn({ module: 'telegram', channelUsername, msgId, err }, 'error fetching message by ID');
    return null;
  }
}
