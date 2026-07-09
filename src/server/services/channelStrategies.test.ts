import { describe, expect, it, vi } from 'vitest';

// Mock downloadManager before importing strategies
vi.mock('./downloadManager.js', () => ({ enqueueTask: vi.fn() }));

// postProcess now queries the DB for hidden (filtered) news — mock it.
const dbMock = vi.hoisted(() => ({ hiddenRows: [] as { id: number }[] }));
vi.mock('../db/index.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(dbMock.hiddenRows),
      }),
    }),
  },
}));

// isVideoMessage needs the live Telegram Api — stub it for unit tests.
vi.mock('./telegramParser.js', () => ({ isVideoMessage: vi.fn(() => false) }));

import type { ChannelType } from '../../shared/types.js';
import { getChannelStrategy } from './channelStrategies.js';
import { enqueueTask } from './downloadManager.js';
import type { TelegramMessage } from './telegramParser.js';
import { isVideoMessage } from './telegramParser.js';

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

  it('keeps video messages (regression: video channels must not be emptied)', () => {
    expect(strategy.shouldSkipMessage(makeTgMsg({ rawMedia: {} as never, mediaType: 'video' }))).toBe(false);
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

describe('MediaStrategy — postProcess', () => {
  const strategy = getChannelStrategy('media');

  it('enqueues tasks for photo and document messages', async () => {
    vi.mocked(enqueueTask).mockClear();
    dbMock.hiddenRows = [];
    const messages: TelegramMessage[] = [
      makeTgMsg({ id: 10, rawMedia: {} as never, mediaType: 'photo' }),
      makeTgMsg({ id: 20, rawMedia: {} as never, mediaType: 'document' }),
      makeTgMsg({ id: 30, rawMedia: {} as never, mediaType: 'audio' }), // not enqueued
      makeTgMsg({ id: 40 }), // no media, not enqueued
    ];
    const insertedMap = new Map([
      [10, 100],
      [20, 200],
      [30, 300],
      [40, 400],
    ]);

    await strategy.postProcess({
      channelId: 1,
      channelTelegramId: 'test',
      messages,
      insertedMap,
    });

    expect(enqueueTask).toHaveBeenCalledTimes(2);
    expect(enqueueTask).toHaveBeenCalledWith(100, 'media', undefined, 0);
    expect(enqueueTask).toHaveBeenCalledWith(200, 'media', undefined, 0);
  });

  it('skips messages not in insertedMap', async () => {
    vi.mocked(enqueueTask).mockClear();
    dbMock.hiddenRows = [];
    const messages: TelegramMessage[] = [makeTgMsg({ id: 10, rawMedia: {} as never, mediaType: 'photo' })];
    const insertedMap = new Map<number, number>(); // empty — nothing inserted

    await strategy.postProcess({
      channelId: 1,
      channelTelegramId: 'test',
      messages,
      insertedMap,
    });

    expect(enqueueTask).not.toHaveBeenCalled();
  });

  it('enqueues tasks for video messages (mediaType="video")', async () => {
    vi.mocked(enqueueTask).mockClear();
    dbMock.hiddenRows = [];
    const messages: TelegramMessage[] = [makeTgMsg({ id: 50, rawMedia: {} as never, mediaType: 'video' })];
    const insertedMap = new Map([[50, 500]]);

    await strategy.postProcess({ channelId: 1, channelTelegramId: 'test', messages, insertedMap });

    expect(enqueueTask).toHaveBeenCalledTimes(1);
    expect(enqueueTask).toHaveBeenCalledWith(500, 'media', undefined, 0);
  });

  it('requiresMediaProcessing returns true for a video message', () => {
    expect(strategy.requiresMediaProcessing([makeTgMsg({ rawMedia: {} as never, mediaType: 'video' })])).toBe(true);
  });

  it('does not auto-download video from hidden (filtered) news, but keeps images', async () => {
    vi.mocked(enqueueTask).mockClear();
    // news 100 (photo) and 200 (video) are hidden; 300 (video) is visible
    dbMock.hiddenRows = [{ id: 100 }, { id: 200 }];
    vi.mocked(isVideoMessage).mockImplementation((m: TelegramMessage) => m.mediaType === 'document');

    const messages: TelegramMessage[] = [
      makeTgMsg({ id: 10, rawMedia: {} as never, mediaType: 'photo' }), // hidden photo → download
      makeTgMsg({ id: 20, rawMedia: {} as never, mediaType: 'document' }), // hidden video → skip
      makeTgMsg({ id: 30, rawMedia: {} as never, mediaType: 'document' }), // visible video → download
    ];
    const insertedMap = new Map([
      [10, 100],
      [20, 200],
      [30, 300],
    ]);

    await strategy.postProcess({ channelId: 1, channelTelegramId: 'test', messages, insertedMap });

    expect(enqueueTask).toHaveBeenCalledTimes(2);
    expect(enqueueTask).toHaveBeenCalledWith(100, 'media', undefined, 0);
    expect(enqueueTask).toHaveBeenCalledWith(300, 'media', undefined, 0);
    expect(enqueueTask).not.toHaveBeenCalledWith(200, 'media', undefined, 0);
    vi.mocked(isVideoMessage).mockReturnValue(false);
  });
});

describe('BlogStrategy — postProcess & requiresMediaProcessing', () => {
  const strategy = getChannelStrategy('blog');

  it('enqueues tasks for photo/document messages (inherits MediaDownloadStrategy)', async () => {
    vi.mocked(enqueueTask).mockClear();
    dbMock.hiddenRows = [];
    const messages: TelegramMessage[] = [makeTgMsg({ id: 1, rawMedia: {} as never, mediaType: 'photo' })];
    const insertedMap = new Map([[1, 10]]);

    await strategy.postProcess({
      channelId: 1,
      channelTelegramId: 'test',
      messages,
      insertedMap,
    });

    expect(enqueueTask).toHaveBeenCalledWith(10, 'media', undefined, 0);
  });

  it('requiresMediaProcessing returns true when messages have document media', () => {
    expect(strategy.requiresMediaProcessing([makeTgMsg({ rawMedia: {} as never, mediaType: 'document' })])).toBe(true);
  });

  it('requiresMediaProcessing returns false when no media messages', () => {
    expect(strategy.requiresMediaProcessing([makeTgMsg()])).toBe(false);
  });
});

describe('NewsLinkStrategy — postProcess & requiresMediaProcessing', () => {
  const strategy = getChannelStrategy('news_link');

  it('postProcess is a no-op', async () => {
    vi.mocked(enqueueTask).mockClear();
    await strategy.postProcess({
      channelId: 1,
      channelTelegramId: 'test',
      messages: [makeTgMsg({ rawMedia: {} as never, mediaType: 'photo' })],
      insertedMap: new Map([[1, 10]]),
    });
    expect(enqueueTask).not.toHaveBeenCalled();
  });

  it('requiresMediaProcessing returns false', () => {
    expect(strategy.requiresMediaProcessing([makeTgMsg({ rawMedia: {} as never, mediaType: 'photo' })])).toBe(false);
  });

  it('shouldSkipMessage returns false', () => {
    expect(strategy.shouldSkipMessage(makeTgMsg())).toBe(false);
  });
});

describe('NewsStrategy — postProcess', () => {
  const strategy = getChannelStrategy('news');

  it('postProcess is a no-op', async () => {
    vi.mocked(enqueueTask).mockClear();
    await strategy.postProcess({
      channelId: 1,
      channelTelegramId: 'test',
      messages: [],
      insertedMap: new Map(),
    });
    expect(enqueueTask).not.toHaveBeenCalled();
  });
});
