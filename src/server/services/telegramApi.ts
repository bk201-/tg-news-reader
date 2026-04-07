/**
 * Telegram API — public functions: fetch messages, channel info, read history, download media.
 */

import type { Api } from 'telegram';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { logger } from '../logger.js';
import { telegramCircuit } from './telegramCircuitBreaker.js';
import { MAX_PHOTO_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES, MAX_IMG_DOC_SIZE_BYTES } from '../config.js';
import { getTelegramClient, ensureAndGetApi } from './telegramClient.js';
import { parseMessageFields, type TelegramMessage } from './telegramParser.js';

const BATCH_SIZE = 100;

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
  const _Api = await ensureAndGetApi();
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
        if (!(msg instanceof _Api.Message)) continue;
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
      if (lastMsg instanceof _Api.Message) {
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

  return [...singles, ...albumPrimaries].sort((a, b) => a.date - b.date || a.id - b.id);
}

export interface ChannelInfo {
  name: string;
  username: string | null;
  description: string | null;
}

export async function getChannelInfo(username: string): Promise<ChannelInfo> {
  return telegramCircuit.execute(async () => {
    const _Api = await ensureAndGetApi();
    const tg = await getTelegramClient();
    const entity = await tg.getEntity(username);
    let name = 'Unknown';
    let resolvedUsername: string | null = null;
    let description: string | null = null;

    if (entity instanceof _Api.Channel || entity instanceof _Api.Chat) {
      name = (entity as Api.Channel).title ?? name;
      resolvedUsername = (entity as Api.Channel).username ?? null;
      try {
        const full = await tg.invoke(new _Api.channels.GetFullChannel({ channel: entity as Api.Channel }));
        description = (full.fullChat as Api.ChannelFull).about || null;
      } catch {
        // description not critical
      }
    } else if (entity instanceof _Api.User) {
      name = [entity.firstName, entity.lastName].filter(Boolean).join(' ') || name;
      resolvedUsername = entity.username ?? null;
    }

    return { name, username: resolvedUsername, description };
  }, 'getChannelInfo');
}

export async function getReadInboxMaxId(channelUsername: string): Promise<number | null> {
  try {
    return await telegramCircuit.execute(async () => {
      const _Api = await ensureAndGetApi();
      const tg = await getTelegramClient();
      const inputPeer = await tg.getInputEntity(channelUsername);
      const result = await tg.invoke(
        new _Api.messages.GetPeerDialogs({
          peers: [new _Api.InputDialogPeer({ peer: inputPeer })],
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

export async function readChannelHistory(channelUsername: string, maxId: number): Promise<void> {
  await telegramCircuit.execute(async () => {
    const _Api = await ensureAndGetApi();
    const tg = await getTelegramClient();
    const entity = await tg.getEntity(channelUsername);
    await tg.invoke(new _Api.channels.ReadHistory({ channel: entity, maxId }));
  }, 'readChannelHistory');
}

export async function downloadMessageMedia(
  msg: TelegramMessage,
  channelTelegramId: string,
  options: { ignoreLimit?: boolean } = {},
): Promise<string | null> {
  const _Api = await ensureAndGetApi();
  if (!msg.rawMedia) return null;

  let ext: string;

  if (msg.rawMedia instanceof _Api.MessageMediaPhoto) {
    ext = 'jpg';
    if (!options.ignoreLimit && msg.mediaSizeBytes && msg.mediaSizeBytes > MAX_PHOTO_SIZE_BYTES) return null;
  } else if (msg.rawMedia instanceof _Api.MessageMediaDocument) {
    const doc = msg.rawMedia.document;
    if (!(doc instanceof _Api.Document)) return null;
    const sizeNum = Number(doc.size ?? 0);
    const mime = doc.mimeType ?? '';
    if (mime === 'image/jpeg') ext = 'jpg';
    else if (mime === 'image/png') ext = 'png';
    else if (mime === 'image/gif') ext = 'gif';
    else if (mime === 'image/webp') ext = 'webp';
    else if (mime === 'video/mp4') ext = 'mp4';
    else if (mime === 'video/webm') ext = 'webm';
    else if (mime === 'video/quicktime') ext = 'mov';
    else if (mime === 'audio/ogg' || mime === 'application/ogg') ext = 'ogg';
    else if (mime === 'audio/mpeg') ext = 'mp3';
    else if (mime === 'audio/mp4' || mime === 'audio/m4a' || mime === 'audio/x-m4a') ext = 'm4a';
    else if (mime === 'audio/flac' || mime === 'audio/x-flac') ext = 'flac';
    else if (mime === 'audio/wav' || mime === 'audio/x-wav' || mime === 'audio/wave') ext = 'wav';
    else return null;

    const isAudio = mime.startsWith('audio/') || mime === 'application/ogg';
    if (!options.ignoreLimit) {
      if (isAudio) return null;
      const isVideo = ext === 'mp4' || ext === 'webm' || ext === 'mov';
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

  if (existsSync(filepath)) return `${channelTelegramId}/${filename}`;

  return telegramCircuit.execute(async () => {
    const tg = await getTelegramClient();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const result = await tg.downloadMedia(msg.rawMedia!, { outputFile: filepath } as any);
      if (!result) return null;
      return `${channelTelegramId}/${filename}`;
    } catch (err) {
      // Remove partial file so the next retry downloads a clean copy
      if (existsSync(filepath)) {
        try {
          unlinkSync(filepath);
        } catch {
          // best-effort — ignore cleanup errors
        }
      }
      throw err;
    }
  }, 'downloadMessageMedia');
}

export async function fetchMessageById(channelUsername: string, msgId: number): Promise<TelegramMessage | null> {
  try {
    return await telegramCircuit.execute(async () => {
      const _Api = await ensureAndGetApi();
      const tg = await getTelegramClient();
      const result = await tg.getMessages(channelUsername, { ids: [msgId] });
      const msg = result[0];
      if (!(msg instanceof _Api.Message)) return null;
      return parseMessageFields(msg, channelUsername);
    }, 'fetchMessageById');
  } catch (err) {
    logger.warn({ module: 'telegram', channelUsername, msgId, err }, 'error fetching message by ID');
    return null;
  }
}
