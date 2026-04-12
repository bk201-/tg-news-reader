import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { DownloadTask } from '@shared/types';

vi.mock('./client', () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ success: true }),
    patch: vi.fn().mockResolvedValue({ success: true }),
    delete: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { accessToken: string | null }) => unknown) => selector({ accessToken: 'test-token' }),
}));

vi.mock('../services/reconnectingEventSource', () => ({
  createReconnectingEventSource: vi.fn(() => ({ close: vi.fn() })),
}));

vi.mock('./news', () => ({
  updatePaginatedItems: vi.fn(),
}));

import { api } from './client';
import {
  downloadsKeys,
  useDownloads,
  useCreateDownload,
  usePrioritizeDownload,
  useCancelDownload,
  useNewsDownloadTask,
} from './downloads';

const mockedApi = vi.mocked(api);

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper, queryClient: qc };
}

describe('downloadsKeys', () => {
  it('all returns correct key', () => {
    expect(downloadsKeys.all).toEqual(['downloads']);
  });
});

describe('useDownloads', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches from /downloads', async () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useDownloads(), { wrapper: Wrapper });
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith('/downloads'));
  });
});

describe('useCreateDownload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts and invalidates downloads', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateDownload(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ newsId: 1, type: 'media' });
    });

    expect(mockedApi.post).toHaveBeenCalledWith('/downloads', { newsId: 1, type: 'media' });
    expect(spy).toHaveBeenCalledWith({ queryKey: downloadsKeys.all });
  });
});

describe('usePrioritizeDownload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('patches and invalidates', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => usePrioritizeDownload(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(5);
    });

    expect(mockedApi.patch).toHaveBeenCalledWith('/downloads/5/prioritize', {});
    expect(spy).toHaveBeenCalledWith({ queryKey: downloadsKeys.all });
  });
});

describe('useCancelDownload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes and invalidates', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCancelDownload(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(5);
    });

    expect(mockedApi.delete).toHaveBeenCalledWith('/downloads/5');
    expect(spy).toHaveBeenCalledWith({ queryKey: downloadsKeys.all });
  });
});

describe('useNewsDownloadTask', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns matching task', async () => {
    const tasks: DownloadTask[] = [
      { id: 1, newsId: 10, type: 'media', priority: 0, status: 'processing', createdAt: 0 },
      { id: 2, newsId: 20, type: 'article', priority: 0, status: 'pending', createdAt: 0 },
    ];
    mockedApi.get.mockResolvedValueOnce(tasks);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useNewsDownloadTask(10, 'media'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.id).toBe(1);
  });

  it('returns null when no match', async () => {
    mockedApi.get.mockResolvedValueOnce([]);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useNewsDownloadTask(99, 'media'), { wrapper: Wrapper });

    // Give it time to settle
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
