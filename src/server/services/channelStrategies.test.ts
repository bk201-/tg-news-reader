import { describe, it, expect, vi } from 'vitest';

// Mock downloadManager before importing strategies
vi.mock('./downloadManager.js', () => ({ enqueueTask: vi.fn() }));

import { getChannelStrategy } from './channelStrategies.js';
import type { TelegramMessage } from './telegramParser.js';
import type { ChannelType } from '../../shared/types.js';

function makeTgMsg(partial: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    id: 1,
    message: '',
    date: Date.now(),
    links: [],
    hashtags: [],
    ...partial,
  };
}

describe('getChannelStrategy', () => {
  it('returns a strategy for every known channel type', () => {
    const types: ChannelType[] = ['news', 'news_link', 'media', 'blog'];
    for (const t of types) {
      expect(getChannelStrategy(t)).toBeDefined();
    }
  });

  it('falls back to news strategy for unknown type', () => {
    const strategy = getChannelStrategy('unknown' as ChannelType);
    expect(strategy).toBe(getChannelStrategy('news'));
  });
});

describe('NewsStrategy', () => {
  const strategy = getChannelStrategy('news');

  it('getItemFlags returns textInPanel=false, canLoadArticle=false', () => {
    expect(strategy.getItemFlags(makeTgMsg())).toEqual({ textInPanel: false, canLoadArticle: false });
  });

  it('never skips messages', () => {
    expect(strategy.shouldSkipMessage(makeTgMsg())).toBe(false);
  });

  it('does not require media processing', () => {
    expect(strategy.requiresMediaProcessing([makeTgMsg({ rawMedia: {} as never })])).toBe(false);
  });
});

describe('NewsLinkStrategy', () => {
  const strategy = getChannelStrategy('news_link');

  it('canLoadArticle = true when msg has links', () => {
    expect(strategy.getItemFlags(makeTgMsg({ links: ['https://example.com'] }))).toEqual({
      textInPanel: false,
      canLoadArticle: true,
    });
  });

  it('canLoadArticle = false when msg has no links', () => {
    expect(strategy.getItemFlags(makeTgMsg({ links: [] }))).toEqual({
      textInPanel: false,
      canLoadArticle: false,
    });
  });
});

describe('MediaStrategy', () => {
  const strategy = getChannelStrategy('media');

  it('getItemFlags returns textInPanel=true', () => {
    expect(strategy.getItemFlags(makeTgMsg())).toEqual({ textInPanel: true, canLoadArticle: false });
  });

  it('skips text-only messages (no rawMedia)', () => {
    expect(strategy.shouldSkipMessage(makeTgMsg({ rawMedia: undefined }))).toBe(true);
  });

  it('keeps photo messages', () => {
    expect(strategy.shouldSkipMessage(makeTgMsg({ rawMedia: {} as never, mediaType: 'photo' }))).toBe(false);
  });

  it('keeps document messages', () => {
    expect(strategy.shouldSkipMessage(makeTgMsg({ rawMedia: {} as never, mediaType: 'document' }))).toBe(false);
  });

  it('keeps audio messages', () => {
    expect(strategy.shouldSkipMessage(makeTgMsg({ rawMedia: {} as never, mediaType: 'audio' }))).toBe(false);
  });

  it('skips webpage-only messages', () => {
    expect(strategy.shouldSkipMessage(makeTgMsg({ rawMedia: {} as never, mediaType: 'webpage' }))).toBe(true);
  });

  it('requires media processing when messages contain photos', () => {
    expect(strategy.requiresMediaProcessing([makeTgMsg({ rawMedia: {} as never, mediaType: 'photo' })])).toBe(true);
  });

  it('does not require media processing for text-only messages', () => {
    expect(strategy.requiresMediaProcessing([makeTgMsg()])).toBe(false);
  });
});

describe('BlogStrategy', () => {
  const strategy = getChannelStrategy('blog');

  it('getItemFlags returns textInPanel=false', () => {
    expect(strategy.getItemFlags(makeTgMsg())).toEqual({ textInPanel: false, canLoadArticle: false });
  });

  it('never skips messages', () => {
    expect(strategy.shouldSkipMessage(makeTgMsg())).toBe(false);
  });
});
