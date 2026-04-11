import { describe, it, expect } from 'vitest';
import { getNewsTitle, getLinkLabel, isYouTubeUrl, getYouTubeEmbedId, formatBytes } from './newsUtils';
import type { NewsItem } from '@shared/types';

function makeItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: 1,
    channelId: 1,
    telegramMsgId: 100,
    text: '',
    links: [],
    hashtags: [],
    mediaType: null,
    mediaSize: null,
    localMediaPath: null,
    localMediaPaths: null,
    albumMsgIds: null,
    fullContent: null,
    fullContentFormat: null,
    isRead: 0,
    isFiltered: 0,
    postedAt: 1700000000,
    createdAt: 1700000000,
    textInPanel: 0,
    canLoadArticle: 0,
    ...overrides,
  };
}

describe('getNewsTitle', () => {
  it('returns first line of text', () => {
    expect(getNewsTitle(makeItem({ text: 'Hello World\nMore content' }))).toBe('Hello World');
  });

  it('returns fallback when text is empty', () => {
    expect(getNewsTitle(makeItem({ text: '' }), 'No content')).toBe('No content');
  });

  it('returns Message #id when no text and no fallback', () => {
    expect(getNewsTitle(makeItem({ text: '', telegramMsgId: 42 }))).toBe('Message #42');
  });
});

describe('getLinkLabel', () => {
  it('extracts hostname without www', () => {
    expect(getLinkLabel('https://www.example.com/path', 0)).toBe('example.com');
  });

  it('handles t.me links with channel path', () => {
    expect(getLinkLabel('https://t.me/channel_name/123', 0)).toBe('t.me/channel_name');
  });

  it('returns fallback on invalid URL', () => {
    expect(getLinkLabel('not a url', 0, 'Ссылка 1')).toBe('Ссылка 1');
  });

  it('returns generic fallback when no custom fallback', () => {
    expect(getLinkLabel('not a url', 2)).toBe('Link 3');
  });
});

describe('isYouTubeUrl', () => {
  it('detects youtu.be short links', () => {
    expect(isYouTubeUrl('https://youtu.be/abc123')).toBe(true);
  });

  it('detects youtube.com/watch', () => {
    expect(isYouTubeUrl('https://youtube.com/watch?v=abc')).toBe(true);
  });

  it('detects youtube.com/shorts', () => {
    expect(isYouTubeUrl('https://www.youtube.com/shorts/abc')).toBe(true);
  });

  it('returns false for non-youtube', () => {
    expect(isYouTubeUrl('https://example.com/watch')).toBe(false);
  });
});

describe('getYouTubeEmbedId', () => {
  it('extracts id from youtu.be', () => {
    expect(getYouTubeEmbedId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts id from youtube.com/watch', () => {
    expect(getYouTubeEmbedId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts id from youtube.com/shorts', () => {
    expect(getYouTubeEmbedId('https://www.youtube.com/shorts/abc123')).toBe('abc123');
  });

  it('extracts id from youtube.com/embed', () => {
    expect(getYouTubeEmbedId('https://www.youtube.com/embed/abc123')).toBe('abc123');
  });

  it('returns null for non-youtube URL', () => {
    expect(getYouTubeEmbedId('https://example.com')).toBeNull();
  });

  it('returns null for invalid URL', () => {
    expect(getYouTubeEmbedId('not a url')).toBeNull();
  });
});

describe('formatBytes', () => {
  it('formats KB', () => {
    expect(formatBytes(500 * 1024)).toBe('500 KB');
  });

  it('formats MB', () => {
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('formats small bytes as KB', () => {
    expect(formatBytes(1024)).toBe('1 KB');
  });
});
