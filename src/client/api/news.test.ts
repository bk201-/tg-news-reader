import { describe, it, expect } from 'vitest';
import type { InfiniteData } from '@tanstack/react-query';
import { updatePaginatedItems, flattenPaginatedItems, newsKeys, type NewsResponse } from './news';
import type { NewsItem } from '@shared/types';

function makeItem(id: number, overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id,
    channelId: 1,
    telegramMsgId: id * 10,
    text: `item-${id}`,
    links: [],
    hashtags: [],
    isRead: 0,
    postedAt: 1700000000 + id,
    ...overrides,
  };
}

function makePaginatedData(pages: NewsItem[][]): InfiniteData<NewsResponse> {
  return {
    pages: pages.map((items) => ({
      items,
      filteredOut: 0,
      nextCursor: null,
      hasMore: false,
    })),
    pageParams: [undefined],
  };
}

describe('newsKeys', () => {
  it('generates unfiltered key', () => {
    expect(newsKeys.byChannel(5)).toEqual(['news', 5, 'all']);
  });

  it('generates filtered key', () => {
    expect(newsKeys.byChannel(5, true)).toEqual(['news', 5, 'filtered']);
  });
});

describe('updatePaginatedItems', () => {
  it('returns undefined when old is undefined', () => {
    expect(updatePaginatedItems(undefined, (items) => items)).toBeUndefined();
  });

  it('applies updater to items in all pages', () => {
    const data = makePaginatedData([[makeItem(1), makeItem(2)], [makeItem(3)]]);
    const result = updatePaginatedItems(data, (items) => items.map((i) => ({ ...i, isRead: 1 })));
    expect(result!.pages[0].items[0].isRead).toBe(1);
    expect(result!.pages[0].items[1].isRead).toBe(1);
    expect(result!.pages[1].items[0].isRead).toBe(1);
  });

  it('preserves page metadata (filteredOut, hasMore, nextCursor)', () => {
    const data: InfiniteData<NewsResponse> = {
      pages: [{ items: [makeItem(1)], filteredOut: 5, nextCursor: 10, hasMore: true }],
      pageParams: [undefined],
    };
    const result = updatePaginatedItems(data, (items) => items);
    expect(result!.pages[0].filteredOut).toBe(5);
    expect(result!.pages[0].nextCursor).toBe(10);
    expect(result!.pages[0].hasMore).toBe(true);
  });
});

describe('flattenPaginatedItems', () => {
  it('returns empty array when data is undefined', () => {
    expect(flattenPaginatedItems(undefined)).toEqual([]);
  });

  it('flattens items from multiple pages', () => {
    const data = makePaginatedData([[makeItem(1), makeItem(2)], [makeItem(3)]]);
    const flat = flattenPaginatedItems(data);
    expect(flat).toHaveLength(3);
    expect(flat.map((i) => i.id)).toEqual([1, 2, 3]);
  });

  it('handles empty pages', () => {
    const data = makePaginatedData([[], [makeItem(1)], []]);
    expect(flattenPaginatedItems(data)).toHaveLength(1);
  });
});
