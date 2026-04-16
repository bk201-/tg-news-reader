import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import React from 'react';

vi.mock('./client', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ items: [], filteredOut: 0, nextCursor: null, hasMore: false }),
    post: vi.fn().mockResolvedValue({ success: true }),
    patch: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

import { api } from './client';
import {
  updatePaginatedItems,
  flattenPaginatedItems,
  newsKeys,
  useMarkRead,
  useMarkAllRead,
  useExtractContent,
  useDownloadMedia,
  useRefreshNewsItem,
  type NewsResponse,
} from './news';
import type { NewsItem, Channel } from '@shared/types';

const mockedApi = vi.mocked(api);

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

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper, queryClient: qc };
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

describe('useMarkRead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('patches news read status and updates news cache', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const data = makePaginatedData([[makeItem(1, { isRead: 0 }), makeItem(2, { isRead: 0 })]]);
    queryClient.setQueryData(newsKeys.byChannel(1), data);
    queryClient.setQueryData<Channel[]>(['channels'], [{ id: 1, unreadCount: 2 } as Channel]);

    const { result } = renderHook(() => useMarkRead(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 1, isRead: 1, channelId: 1 });
    });

    expect(mockedApi.patch).toHaveBeenCalledWith('/news/1/read', { isRead: 1 });

    // News item should be updated in cache
    const cached = queryClient.getQueryData<InfiniteData<NewsResponse>>(newsKeys.byChannel(1));
    expect(cached!.pages[0].items[0].isRead).toBe(1);
    expect(cached!.pages[0].items[1].isRead).toBe(0);

    // Channel unread count should decrement
    const channels = queryClient.getQueryData<Channel[]>(['channels']);
    expect(channels![0].unreadCount).toBe(1);
  });

  it('increments unread count when marking as unread', async () => {
    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData<Channel[]>(['channels'], [{ id: 1, unreadCount: 0 } as Channel]);

    const { result } = renderHook(() => useMarkRead(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 5, isRead: 0, channelId: 1 });
    });

    expect(mockedApi.patch).toHaveBeenCalledWith('/news/5/read', { isRead: 0 });
    const channels = queryClient.getQueryData<Channel[]>(['channels']);
    expect(channels![0].unreadCount).toBe(1);
  });
});

describe('useMarkAllRead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks all news as read for a specific channel', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const data = makePaginatedData([[makeItem(1, { isRead: 0 }), makeItem(2, { isRead: 0 })]]);
    queryClient.setQueryData(newsKeys.byChannel(1), data);
    queryClient.setQueryData<Channel[]>(
      ['channels'],
      [{ id: 1, unreadCount: 2 } as Channel, { id: 2, unreadCount: 5 } as Channel],
    );

    const { result } = renderHook(() => useMarkAllRead(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(1);
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/news/read-all', { channelId: 1 });

    const cached = queryClient.getQueryData<InfiniteData<NewsResponse>>(newsKeys.byChannel(1));
    expect(cached!.pages[0].items.every((n) => n.isRead === 1)).toBe(true);

    const channels = queryClient.getQueryData<Channel[]>(['channels']);
    expect(channels![0].unreadCount).toBe(0);
    expect(channels![1].unreadCount).toBe(5); // other channel untouched
  });

  it('marks all channels as read when no channelId', async () => {
    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData<Channel[]>(
      ['channels'],
      [{ id: 1, unreadCount: 3 } as Channel, { id: 2, unreadCount: 7 } as Channel],
    );

    const { result } = renderHook(() => useMarkAllRead(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/news/read-all', { channelId: undefined });

    const channels = queryClient.getQueryData<Channel[]>(['channels']);
    expect(channels!.every((ch) => ch.unreadCount === 0)).toBe(true);
  });
});

describe('useExtractContent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts to /downloads with article type and invalidates only downloads', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useExtractContent(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ newsId: 42, url: 'https://example.com/article' });
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/downloads', {
      newsId: 42,
      type: 'article',
      url: 'https://example.com/article',
      priority: 10,
    });
    // Should NOT invalidate news — article not downloaded yet, would race with markRead
    expect(spy).not.toHaveBeenCalledWith({ queryKey: ['news'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['downloads'] });
  });
});

describe('useDownloadMedia', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts to /downloads with media type', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useDownloadMedia(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(99);
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/downloads', {
      newsId: 99,
      type: 'media',
      priority: 10,
    });
  });
});

describe('useRefreshNewsItem', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves client-side isRead when patching cache', async () => {
    const { Wrapper, queryClient } = createWrapper();
    // Seed cache with an item the user has marked as read (isRead: 1)
    const data = makePaginatedData([[makeItem(1, { isRead: 1, text: 'old text' })]]);
    queryClient.setQueryData(newsKeys.byChannel(1), data);

    // Server returns the refreshed item with isRead: 0 (DB hasn't committed markRead yet)
    const serverItem = makeItem(1, { isRead: 0, text: 'new text from Telegram' });
    mockedApi.post.mockResolvedValueOnce(serverItem);

    const { result } = renderHook(() => useRefreshNewsItem(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(1);
    });

    const cached = queryClient.getQueryData<InfiniteData<NewsResponse>>(newsKeys.byChannel(1));
    // isRead should be preserved from client cache (1), not overwritten by server (0)
    expect(cached!.pages[0].items[0].isRead).toBe(1);
    // But text should be updated from server
    expect(cached!.pages[0].items[0].text).toBe('new text from Telegram');
  });
});
