import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('./client', () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ inserted: 0, total: 0, totalNewsCount: 10, unreadCount: 5 }),
    put: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({ ok: true }),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

import { api } from './client';
import {
  channelKeys,
  useChannels,
  useCreateChannel,
  useUpdateChannel,
  useDeleteChannel,
  useFetchChannel,
  useReorderChannels,
  useMarkReadAndFetch,
  useChannelLookup,
} from './channels';

const mockedApi = vi.mocked(api);

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper, queryClient: qc };
}

describe('channelKeys', () => {
  it('all returns correct key', () => {
    expect(channelKeys.all).toEqual(['channels']);
  });
});

describe('useChannels', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches from /channels', async () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useChannels(), { wrapper: Wrapper });
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith('/channels'));
  });
});

describe('useCreateChannel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts and invalidates channels', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateChannel(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ telegramId: 'test', name: 'Test', channelType: 'news' });
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/channels', expect.any(Object));
    expect(spy).toHaveBeenCalledWith({ queryKey: channelKeys.all });
  });
});

describe('useUpdateChannel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('puts and invalidates', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateChannel(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 1, name: 'Updated' });
    });

    expect(mockedApi.put).toHaveBeenCalledWith('/channels/1', { name: 'Updated' });
    expect(spy).toHaveBeenCalledWith({ queryKey: channelKeys.all });
  });
});

describe('useDeleteChannel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes and invalidates', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteChannel(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(5);
    });

    expect(mockedApi.delete).toHaveBeenCalledWith('/channels/5');
    expect(spy).toHaveBeenCalledWith({ queryKey: channelKeys.all });
  });
});

describe('useFetchChannel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts to /channels/:id/fetch and updates cache', async () => {
    const { Wrapper, queryClient } = createWrapper();
    // Seed channels cache
    queryClient.setQueryData(channelKeys.all, [
      { id: 1, name: 'Ch1', unreadCount: 0, totalNewsCount: 5, lastFetchedAt: null },
    ]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useFetchChannel(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 1 });
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/channels/1/fetch', { since: undefined, limit: undefined });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['news', 1] });

    // Should have updated the channel cache
    const channels = queryClient.getQueryData(channelKeys.all) as Array<{ id: number; unreadCount: number }>;
    expect(channels[0].unreadCount).toBe(5);
  });
});

describe('useReorderChannels', () => {
  beforeEach(() => vi.clearAllMocks());

  it('patches and invalidates', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useReorderChannels(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync([
        { id: 1, sortOrder: 0 },
        { id: 2, sortOrder: 1 },
      ]);
    });

    expect(mockedApi.patch).toHaveBeenCalledWith('/channels/reorder', {
      items: [
        { id: 1, sortOrder: 0 },
        { id: 2, sortOrder: 1 },
      ],
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: channelKeys.all });
  });
});

describe('useMarkReadAndFetch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts to mark-read-and-fetch endpoint', async () => {
    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(channelKeys.all, [
      { id: 1, name: 'Ch1', unreadCount: 3, totalNewsCount: 10, lastFetchedAt: null },
    ]);

    const { result } = renderHook(() => useMarkReadAndFetch(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(1);
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/channels/1/mark-read-and-fetch', {});
  });
});

describe('useChannelLookup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gets lookup by username', async () => {
    mockedApi.get.mockResolvedValueOnce({ name: 'Found', username: 'found', description: 'desc' });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useChannelLookup(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync('testuser');
    });

    expect(mockedApi.get).toHaveBeenCalledWith('/channels/lookup?username=testuser');
  });
});
