/**
 * Telegram Parser — message field extraction, link/hashtag parsing, Instant View.
 */

import type { Api } from 'telegram';
import { getApi } from './telegramClient.js';

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

export function extractLinks(text: string, entities?: Api.TypeMessageEntity[]): string[] {
  const _Api = getApi();
  const links: string[] = [];
  if (entities) {
    for (const entity of entities) {
      if (entity instanceof _Api.MessageEntityUrl) {
        links.push(text.substring(entity.offset, entity.offset + entity.length));
      } else if (entity instanceof _Api.MessageEntityTextUrl) {
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

export function extractHashtags(text: string, entities?: Api.TypeMessageEntity[]): string[] {
  const _Api = getApi();
  const hashtags: string[] = [];
  if (entities) {
    for (const entity of entities) {
      if (entity instanceof _Api.MessageEntityHashtag) {
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

// ─── Instant View helpers ─────────────────────────────────────────────────────

function richTextToString(rt: Api.TypeRichText): string {
  const _Api = getApi();
  if (!rt) return '';
  if (rt instanceof _Api.TextEmpty) return '';
  if (rt instanceof _Api.TextPlain) return rt.text;
  if (rt instanceof _Api.TextConcat) return rt.texts.map(richTextToString).join('');
  if (rt instanceof _Api.TextImage) return '';
  const wrapped = rt as unknown as { text?: Api.TypeRichText };
  return wrapped.text ? richTextToString(wrapped.text) : '';
}

function extractInstantViewText(blocks: Api.TypePageBlock[]): string {
  const _Api = getApi();
  const parts: string[] = [];
  for (const block of blocks) {
    if (block instanceof _Api.PageBlockTitle) {
      const text = richTextToString(block.text);
      if (text.trim()) parts.push(`# ${text.trim()}`);
    } else if (block instanceof _Api.PageBlockSubtitle || block instanceof _Api.PageBlockKicker) {
      const text = richTextToString(block.text);
      if (text.trim()) parts.push(`*${text.trim()}*`);
    } else if (block instanceof _Api.PageBlockHeader) {
      const text = richTextToString(block.text);
      if (text.trim()) parts.push(`## ${text.trim()}`);
    } else if (block instanceof _Api.PageBlockSubheader) {
      const text = richTextToString(block.text);
      if (text.trim()) parts.push(`### ${text.trim()}`);
    } else if (block instanceof _Api.PageBlockParagraph || block instanceof _Api.PageBlockFooter) {
      const text = richTextToString(block.text);
      if (text.trim()) parts.push(text.trim());
    } else if (block instanceof _Api.PageBlockPreformatted) {
      const text = richTextToString(block.text);
      if (text.trim()) parts.push('```\n' + text.trim() + '\n```');
    } else if (block instanceof _Api.PageBlockDivider) {
      parts.push('---');
    } else if (block instanceof _Api.PageBlockBlockquote || block instanceof _Api.PageBlockPullquote) {
      const text = richTextToString(block.text);
      if (text.trim()) parts.push(`> ${text.trim()}`);
    } else if (block instanceof _Api.PageBlockList) {
      for (const item of block.items) {
        if (item instanceof _Api.PageListItemText) {
          const text = richTextToString(item.text);
          if (text.trim()) parts.push(`- ${text.trim()}`);
        } else if (item instanceof _Api.PageListItemBlocks) {
          const subText = extractInstantViewText(item.blocks);
          if (subText.trim()) parts.push(`- ${subText.trim()}`);
        }
      }
    } else if (block instanceof _Api.PageBlockOrderedList) {
      let idx = 1;
      for (const item of block.items) {
        if (item instanceof _Api.PageListOrderedItemText) {
          const text = richTextToString(item.text);
          if (text.trim()) parts.push(`${idx++}. ${text.trim()}`);
        } else if (item instanceof _Api.PageListOrderedItemBlocks) {
          const subText = extractInstantViewText(item.blocks);
          if (subText.trim()) parts.push(`${idx++}. ${subText.trim()}`);
        }
      }
    } else if (block instanceof _Api.PageBlockDetails) {
      const title = richTextToString(block.title);
      if (title.trim()) parts.push(`### ${title.trim()}`);
      const subText = extractInstantViewText(block.blocks);
      if (subText.trim()) parts.push(subText.trim());
    }
  }
  return parts.join('\n\n');
}

export function parseMessageFields(msg: Api.Message, channelUsername: string): TelegramMessage | null {
  const _Api = getApi();
  void channelUsername;
  if (!msg.message && !msg.media) return null;

  const text = msg.message || '';
  const links = extractLinks(text, msg.entities);
  const hashtags = extractHashtags(text, msg.entities);

  let mediaType: string | undefined;
  let mediaSizeBytes: number | undefined;
  let instantViewContent: string | undefined;

  if (msg.media) {
    if (msg.media instanceof _Api.MessageMediaPhoto) {
      mediaType = 'photo';
      const photo = msg.media.photo;
      if (photo instanceof _Api.Photo) {
        const photoSizes = photo.sizes.filter((s) => s instanceof _Api.PhotoSize);
        const largest = photoSizes.sort((a, b) => b.size - a.size)[0];
        if (largest) mediaSizeBytes = largest.size;
      }
    } else if (msg.media instanceof _Api.MessageMediaDocument) {
      const doc = msg.media.document;
      if (doc instanceof _Api.Document) {
        mediaSizeBytes = Number(doc.size);
        const mime = doc.mimeType ?? '';
        mediaType = mime.startsWith('audio/') || mime === 'application/ogg' ? 'audio' : 'document';
      } else {
        mediaType = 'document';
      }
    } else if (msg.media instanceof _Api.MessageMediaWebPage) {
      mediaType = 'webpage';
      const wp = msg.media.webpage;
      if (wp instanceof _Api.WebPage && wp.cachedPage instanceof _Api.Page) {
        const text = extractInstantViewText(wp.cachedPage.blocks);
        if (text) instantViewContent = text;
      }
    } else {
      // Unsupported media types (poll, geo, contact, game, dice, giveaway, etc.)
      // — skip entirely, not useful in a news reader
      return null;
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
