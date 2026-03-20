import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../logger.js';

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
  groupedId?: string; // BigInt serialised as string
  rawMediaItems?: Api.TypeMessageMedia[]; // all media in album (index 0 = primary)
  albumTelegramIds?: number[]; // telegram msg IDs for every album member
}

function extractLinks(text: string, entities?: Api.TypeMessageEntity[]): string[] {
  const links: string[] = [];

  if (entities) {
    for (const entity of entities) {
      if (entity instanceof Api.MessageEntityUrl) {
        const url = text.substring(entity.offset, entity.offset + entity.length);
        links.push(url);
      } else if (entity instanceof Api.MessageEntityTextUrl) {
        links.push(entity.url);
      }
    }
  }

  // Also extract raw URLs with regex
  const urlRegex = /https?:\/\/[^\s\]]+/g;
  const rawUrls = text.match(urlRegex) || [];
  for (const url of rawUrls) {
    if (!links.includes(url)) {
      links.push(url);
    }
  }

  return links;
}

function extractHashtags(text: string, entities?: Api.TypeMessageEntity[]): string[] {
  const hashtags: string[] = [];

  if (entities) {
    for (const entity of entities) {
      if (entity instanceof Api.MessageEntityHashtag) {
        const tag = text.substring(entity.offset, entity.offset + entity.length);
        hashtags.push(tag.toLowerCase());
      }
    }
  }

  const tagRegex = /#[\wа-яА-Я]+/gu;
  const rawTags = text.match(tagRegex) || [];
  for (const tag of rawTags) {
    const normalized = tag.toLowerCase();
    if (!hashtags.includes(normalized)) {
      hashtags.push(normalized);
    }
  }

  return hashtags;
}

const BATCH_SIZE = 100; // Telegram's practical per-request limit

function parseMessageFields(msg: Api.Message, channelUsername: string): TelegramMessage | null {
  void channelUsername;
  if (!msg.message && !msg.media) return null;

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
    groupedId: msg.groupedId != null ? String(msg.groupedId) : undefined,
  };
}

export async function fetchChannelMessages(
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

        // Messages come newest-first; once we hit sinceDate, stop
        if (sinceDate && msgDate <= sinceDate) {
          reachedSinceDate = true;
          break;
        }

        const parsed = parseMessageFields(msg, channelUsername);
        if (parsed) allMessages.push(parsed);
      }

      if (reachedSinceDate) break;
      if (result.length < BATCH_SIZE) break; // no more messages in channel
      if (allMessages.length >= limit) break; // safety cap

      // Oldest message ID in this batch → next batch starts from there
      const lastMsg = result[result.length - 1];
      if (lastMsg instanceof Api.Message) {
        offsetId = lastMsg.id;
      } else {
        break;
      }
    }
  } catch (err) {
    console.error('Error fetching Telegram messages:', err);
    throw err;
  }

  // ── Album grouping ──────────────────────────────────────────────────────────
  // Messages in the same album share a groupedId. Merge them into one primary
  // message (lowest ID = has the caption) so we store one news row per album.
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
    group.sort((a, b) => a.id - b.id); // lowest id = caption message
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
  const tg = await getTelegramClient();
  try {
    const entity = await tg.getEntity(username);
    let name = 'Unknown';
    let resolvedUsername: string | null = null;
    let description: string | null = null;

    if (entity instanceof Api.Channel || entity instanceof Api.Chat) {
      name = (entity as Api.Channel).title ?? name;
      resolvedUsername = (entity as Api.Channel).username ?? null;
      // Try to fetch full info for description
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
  } catch (err) {
    console.error('Error getting channel info:', err);
    throw err;
  }
}

/** Returns the last read message ID for a channel from Telegram (readInboxMaxId) */
export async function getReadInboxMaxId(channelUsername: string): Promise<number | null> {
  const tg = await getTelegramClient();
  try {
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
  } catch (err) {
    console.warn('Failed to get readInboxMaxId from Telegram:', err);
    return null;
  }
}

/** Marks all messages up to maxId as read in Telegram (syncs read state across all devices) */
export async function readChannelHistory(channelUsername: string, maxId: number): Promise<void> {
  const tg = await getTelegramClient();
  const entity = await tg.getEntity(channelUsername);
  await tg.invoke(
    new Api.channels.ReadHistory({
      channel: entity,
      maxId,
    }),
  );
}

import { MAX_PHOTO_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES, MAX_IMG_DOC_SIZE_BYTES } from '../config.js';

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
    else return null;

    if (!options.ignoreLimit) {
      const isVideo = ext === 'mp4' || ext === 'webm';
      const limit = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMG_DOC_SIZE_BYTES;
      if (sizeNum > limit) return null;
    }
  } else {
    return null;
  }

  const dir = join(process.cwd(), 'data', channelTelegramId);
  mkdirSync(dir, { recursive: true });

  const filename = `${msg.id}.${ext}`;
  const filepath = join(dir, filename);

  if (existsSync(filepath)) return `${channelTelegramId}/${filename}`;

  const tg = await getTelegramClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  const buffer = await tg.downloadMedia(msg.rawMedia, {} as any);
  if (!buffer) return null;

  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as unknown as Uint8Array);
  writeFileSync(filepath, bytes);
  return `${channelTelegramId}/${filename}`;
}

/** Fetches a single message by Telegram message ID (for on-demand media download). */
export async function fetchMessageById(channelUsername: string, msgId: number): Promise<TelegramMessage | null> {
  const tg = await getTelegramClient();
  try {
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
  } catch (err) {
    logger.warn({ module: 'telegram', err }, 'error fetching message by ID');
    return null;
  }
}
