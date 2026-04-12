import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TelegramMessage } from './telegramParser.js';

// ─── Hoisted mocks (available before vi.mock factories) ──────────────────────

const {
  mockInvoke,
  mockGetMessages,
  mockParseMessageFields,
  mockExtractInstantViewText,
  mockApi,
  MockMessage,
  MockWebPage,
  MockPage,
} = vi.hoisted(() => {
  class _MockMessage {
    id: number;
    message: string;
    date: number;
    entities?: unknown[];
    media?: unknown;
    groupedId?: unknown;
    constructor(o: { id: number; message: string; date: number; media?: unknown }) {
      this.id = o.id;
      this.message = o.message;
      this.date = o.date;
      this.media = o.media;
    }
  }

  class _MockWebPage {
    cachedPage: unknown;
    url: string;
    constructor(cachedPage?: unknown, url = '') {
      this.cachedPage = cachedPage;
      this.url = url;
    }
  }

  class _MockPage {
    blocks: unknown[];
    part: boolean;
    constructor(blocks: unknown[], part = false) {
      this.blocks = blocks;
      this.part = part;
    }
  }

  const _mockInvoke = vi.fn();
  const _mockGetMessages = vi.fn();
  const _mockParseMessageFields = vi.fn();
  const _mockExtractInstantViewText = vi.fn();

  const _mockApi = {
    Message: _MockMessage,
    WebPage: _MockWebPage,
    Page: _MockPage,
    messages: {
      GetWebPage: class {
        url: string;
        hash: number;
        constructor(o: { url: string; hash: number }) {
          this.url = o.url;
          this.hash = o.hash;
        }
      },
    },
  };

  return {
    mockInvoke: _mockInvoke,
    mockGetMessages: _mockGetMessages,
    mockParseMessageFields: _mockParseMessageFields,
    mockExtractInstantViewText: _mockExtractInstantViewText,
    mockApi: _mockApi,
    MockMessage: _MockMessage,
    MockWebPage: _MockWebPage,
    MockPage: _MockPage,
  };
});

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../config.js', () => ({
  MAX_PHOTO_SIZE_BYTES: 5 * 1024 * 1024,
  MAX_VIDEO_SIZE_BYTES: 75 * 1024 * 1024,
  MAX_IMG_DOC_SIZE_BYTES: 5 * 1024 * 1024,
}));

vi.mock('./telegramClient.js', () => ({
  getTelegramClient: vi.fn(() => ({
    invoke: mockInvoke,
    getMessages: mockGetMessages,
  })),
  ensureAndGetApi: vi.fn(() => mockApi),
}));

vi.mock('./telegramCircuitBreaker.js', () => ({
  telegramCircuit: {
    execute: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  },
}));

vi.mock('./telegramParser.js', () => ({
  parseMessageFields: (...args: unknown[]) => mockParseMessageFields(...args),
  extractInstantViewText: (...args: unknown[]) => mockExtractInstantViewText(...args),
}));

import { fetchChannelMessages, fetchMessageById } from './telegramApi.js';
import { logger } from '../logger.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('telegramApi — resolvePartialInstantView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeParsedMsg(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
    return {
      id: 1,
      message: 'hello',
      date: 1700000000,
      links: [],
      hashtags: [],
      ...overrides,
    };
  }

  describe('fetchChannelMessages', () => {
    it('resolves partial IV pages via messages.getWebPage', async () => {
      const msg = new MockMessage({ id: 1, message: 'text', date: 1700000000 });
      mockGetMessages.mockResolvedValueOnce([msg]);

      mockParseMessageFields.mockReturnValueOnce(
        makeParsedMsg({
          instantViewContent: 'Short partial',
          instantViewPartial: true,
          instantViewUrl: 'https://example.com/article',
        }),
      );

      // messages.getWebPage returns full page
      const fullPage = new MockPage([{ text: 'full blocks' }], false);
      const fullWp = new MockWebPage(fullPage, 'https://example.com/article');
      mockInvoke.mockResolvedValueOnce({ webpage: fullWp });
      mockExtractInstantViewText.mockReturnValueOnce('Full article text that is much longer than the partial');

      const results = await fetchChannelMessages('test_channel', { limit: 10 });

      expect(results).toHaveLength(1);
      expect(results[0].instantViewContent).toBe('Full article text that is much longer than the partial');
      expect(results[0].instantViewPartial).toBe(false);
      expect(mockInvoke).toHaveBeenCalledOnce();
    });

    it('keeps partial content when full page text is shorter', async () => {
      const msg = new MockMessage({ id: 1, message: 'text', date: 1700000000 });
      mockGetMessages.mockResolvedValueOnce([msg]);

      mockParseMessageFields.mockReturnValueOnce(
        makeParsedMsg({
          instantViewContent: 'Longer partial content here',
          instantViewPartial: true,
          instantViewUrl: 'https://example.com/article',
        }),
      );

      const fullPage = new MockPage([], false);
      const fullWp = new MockWebPage(fullPage, 'https://example.com/article');
      mockInvoke.mockResolvedValueOnce({ webpage: fullWp });
      mockExtractInstantViewText.mockReturnValueOnce('Short');

      const results = await fetchChannelMessages('test_channel', { limit: 10 });

      expect(results[0].instantViewContent).toBe('Longer partial content here');
      expect(mockInvoke).toHaveBeenCalledOnce();
    });

    it('skips resolution when no messages have partial IV', async () => {
      const msg = new MockMessage({ id: 1, message: 'text', date: 1700000000 });
      mockGetMessages.mockResolvedValueOnce([msg]);

      mockParseMessageFields.mockReturnValueOnce(makeParsedMsg({ instantViewContent: 'Full content' }));

      const results = await fetchChannelMessages('test_channel', { limit: 10 });

      expect(results).toHaveLength(1);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('keeps partial content on getWebPage failure', async () => {
      const msg = new MockMessage({ id: 1, message: 'text', date: 1700000000 });
      mockGetMessages.mockResolvedValueOnce([msg]);

      mockParseMessageFields.mockReturnValueOnce(
        makeParsedMsg({
          instantViewContent: 'Partial fallback',
          instantViewPartial: true,
          instantViewUrl: 'https://example.com/article',
        }),
      );

      mockInvoke.mockRejectedValueOnce(new Error('Telegram API error'));

      const results = await fetchChannelMessages('test_channel', { limit: 10 });

      expect(results[0].instantViewContent).toBe('Partial fallback');
      expect(results[0].instantViewPartial).toBe(true);
      expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
        expect.objectContaining({ module: 'telegram', url: 'https://example.com/article' }),
        'Failed to fetch full Instant View page',
      );
    });

    it('resolves multiple partial IV pages in one batch', async () => {
      const msg1 = new MockMessage({ id: 1, message: 'text1', date: 1700000000 });
      const msg2 = new MockMessage({ id: 2, message: 'text2', date: 1700000001 });
      mockGetMessages.mockResolvedValueOnce([msg1, msg2]);

      mockParseMessageFields
        .mockReturnValueOnce(
          makeParsedMsg({
            id: 1,
            instantViewContent: 'Partial 1',
            instantViewPartial: true,
            instantViewUrl: 'https://example.com/a1',
          }),
        )
        .mockReturnValueOnce(
          makeParsedMsg({
            id: 2,
            instantViewContent: 'Partial 2',
            instantViewPartial: true,
            instantViewUrl: 'https://example.com/a2',
          }),
        );

      const fullPage1 = new MockPage([], false);
      const fullWp1 = new MockWebPage(fullPage1, 'https://example.com/a1');
      mockInvoke.mockResolvedValueOnce({ webpage: fullWp1 });
      mockExtractInstantViewText.mockReturnValueOnce('Full article 1 with a lot of text');

      const fullPage2 = new MockPage([], false);
      const fullWp2 = new MockWebPage(fullPage2, 'https://example.com/a2');
      mockInvoke.mockResolvedValueOnce({ webpage: fullWp2 });
      mockExtractInstantViewText.mockReturnValueOnce('Full article 2 with a lot of text');

      const results = await fetchChannelMessages('test_channel', { limit: 10 });

      expect(results).toHaveLength(2);
      expect(mockInvoke).toHaveBeenCalledTimes(2);
      expect(results.find((r) => r.id === 1)!.instantViewContent).toBe('Full article 1 with a lot of text');
      expect(results.find((r) => r.id === 2)!.instantViewContent).toBe('Full article 2 with a lot of text');
    });
  });

  describe('fetchMessageById', () => {
    it('resolves partial IV for a single message', async () => {
      const msg = new MockMessage({ id: 42, message: 'text', date: 1700000000 });
      mockGetMessages.mockResolvedValueOnce([msg]);

      const parsed = makeParsedMsg({
        id: 42,
        instantViewContent: 'Partial',
        instantViewPartial: true,
        instantViewUrl: 'https://example.com/article',
      });
      mockParseMessageFields.mockReturnValueOnce(parsed);

      const fullPage = new MockPage([], false);
      const fullWp = new MockWebPage(fullPage, 'https://example.com/article');
      mockInvoke.mockResolvedValueOnce({ webpage: fullWp });
      mockExtractInstantViewText.mockReturnValueOnce('Full article content that is longer than partial');

      const result = await fetchMessageById('test_channel', 42);

      expect(result).not.toBeNull();
      expect(result!.instantViewContent).toBe('Full article content that is longer than partial');
      expect(result!.instantViewPartial).toBe(false);
    });

    it('returns message with partial content on resolution failure', async () => {
      const msg = new MockMessage({ id: 42, message: 'text', date: 1700000000 });
      mockGetMessages.mockResolvedValueOnce([msg]);

      const parsed = makeParsedMsg({
        id: 42,
        instantViewContent: 'Partial fallback',
        instantViewPartial: true,
        instantViewUrl: 'https://example.com/article',
      });
      mockParseMessageFields.mockReturnValueOnce(parsed);

      mockInvoke.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchMessageById('test_channel', 42);

      expect(result).not.toBeNull();
      expect(result!.instantViewContent).toBe('Partial fallback');
    });

    it('does not invoke getWebPage when IV is not partial', async () => {
      const msg = new MockMessage({ id: 42, message: 'text', date: 1700000000 });
      mockGetMessages.mockResolvedValueOnce([msg]);

      mockParseMessageFields.mockReturnValueOnce(makeParsedMsg({ id: 42, instantViewContent: 'Full content' }));

      const result = await fetchMessageById('test_channel', 42);

      expect(result).not.toBeNull();
      expect(result!.instantViewContent).toBe('Full content');
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });
});
