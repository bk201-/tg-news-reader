import type { Channel, NewsItem } from '@shared/types.ts';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import type { NewsFilterMode } from '../store/uiStore';
import { api } from './client';

export const newsKeys = {
  byChannel: (channelId: number, mode: NewsFilterMode = 'all') => ['news', channelId, mode] as const,
};

export interface NewsResponse {
  items: NewsItem[];
  filteredOut: number;
  nextCursor: number | null;
  hasMore: boolean;
}

/** Helper: update items inside paginated InfiniteData<NewsResponse> structure */
export function updatePaginatedItems(
  old: InfiniteData<NewsResponse> | undefined,
  updater: (items: NewsItem[]) => NewsItem[],
): InfiniteData<NewsResponse> | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      items: updater(page.items),
    })),
  };
}

/** Helper: flatten all items from paginated data */
export function flattenPaginatedItems(data: InfiniteData<NewsResponse> | undefined): NewsItem[] {
  if (!data) return [];
  return data.pages.flatMap((page) => page.items);
}

export function useNews(channelId: number, mode: NewsFilterMode = 'all') {
  return useInfiniteQuery({
    queryKey: newsKeys.byChannel(channelId, mode),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ channelId: String(channelId) });
      if (mode !== 'all') params.set('view', mode);
      if (pageParam) params.set('cursor', String(pageParam));
      return api.get<NewsResponse>(`/news?${params.toString()}`);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: channelId > 0,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isRead = 1 }: { id: number; isRead?: number; channelId: number }) =>
      api.patch(`/news/${id}/read`, { isRead }),
    onSuccess: (_data, { id, isRead = 1, channelId }) => {
      // Update the item in-place — no refetch needed
      qc.setQueriesData<InfiniteData<NewsResponse>>({ queryKey: ['news', channelId] }, (old) =>
        updatePaginatedItems(old, (items) => items.map((n) => (n.id === id ? { ...n, isRead } : n))),
      );
      // Adjust unread badge on the channel
      qc.setQueryData<Channel[]>(['channels'], (old) =>
        old
          ? old.map((ch) =>
              ch.id === channelId ? { ...ch, unreadCount: Math.max(0, ch.unreadCount + (isRead === 1 ? -1 : 1)) } : ch,
            )
          : old,
      );
    },
  });
}

export type MarkAllReadArgs = {
  channelId?: number;
  newsIds?: number[];
  /** Target state: 1 = mark read (default), 0 = mark unread (used by undo-toggle). */
  isRead?: 0 | 1;
};

export interface MarkAllReadResult {
  success: true;
  /** IDs that were actually flipped (excludes rows already in the target state). */
  affectedIds: number[];
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: MarkAllReadArgs = {}) => api.post<MarkAllReadResult>('/news/read-all', args),
    onSuccess: (_data, args) => {
      const { channelId, newsIds } = args ?? {};
      const targetIsRead: 0 | 1 = args.isRead ?? 1;

      if (newsIds && newsIds.length > 0) {
        // Scoped flip: update only the specified items optimistically
        const newsIdSet = new Set(newsIds);
        qc.setQueriesData<InfiniteData<NewsResponse>>({ queryKey: ['news'] }, (old) =>
          updatePaginatedItems(old, (items) =>
            items.map((n) => (newsIdSet.has(n.id) ? { ...n, isRead: targetIsRead } : n)),
          ),
        );
        // Invalidate channels to get accurate unread counts from server
        void qc.invalidateQueries({ queryKey: ['channels'] });
        return;
      }

      if (channelId !== undefined) {
        qc.setQueriesData<InfiniteData<NewsResponse>>({ queryKey: ['news', channelId] }, (old) =>
          updatePaginatedItems(old, (items) => items.map((n) => ({ ...n, isRead: targetIsRead }))),
        );
        // For the read direction we know the count drops to 0 outright; for unread
        // we don't know how many of the channel's items the server flipped (it only
        // touches rows currently in the opposite state) so we invalidate to refetch.
        if (targetIsRead === 1) {
          qc.setQueryData<Channel[]>(['channels'], (old) =>
            old ? old.map((ch) => (ch.id === channelId ? { ...ch, unreadCount: 0 } : ch)) : old,
          );
        } else {
          void qc.invalidateQueries({ queryKey: ['channels'] });
        }
      } else {
        qc.setQueriesData<InfiniteData<NewsResponse>>({ queryKey: ['news'] }, (old) =>
          updatePaginatedItems(old, (items) => items.map((n) => ({ ...n, isRead: targetIsRead }))),
        );
        if (targetIsRead === 1) {
          qc.setQueryData<Channel[]>(['channels'], (old) => (old ? old.map((ch) => ({ ...ch, unreadCount: 0 })) : old));
        } else {
          void qc.invalidateQueries({ queryKey: ['channels'] });
        }
      }
    },
  });
}

export function useExtractContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ newsId, url }: { newsId: number; url: string }) =>
      api.post<{ success: boolean }>('/downloads', { newsId, type: 'article', url, priority: 10 }),
    onSuccess: () => {
      // Only invalidate downloads to show the queued task in DownloadsPanel.
      // Do NOT invalidate ['news'] here — the article hasn't been downloaded yet,
      // and a premature refetch races with useMarkRead optimistic updates,
      // reverting read status. The SSE task_update handler will refetch news
      // when the worker actually completes the article extraction.
      void qc.invalidateQueries({ queryKey: ['downloads'] });
    },
  });
}

export function useDownloadMedia() {
  return useMutation({
    mutationFn: (newsId: number) =>
      api.post<{ success: boolean }>('/downloads', { newsId, type: 'media', priority: 10 }),
  });
}

/** Re-fetch a single news item from Telegram, re-process through strategies, update DB. */
export function useRefreshNewsItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (newsId: number) => api.post<NewsItem>(`/news/${newsId}/refresh`, {}),
    onSuccess: (updated) => {
      // Patch the single item in the paginated cache — no full refetch needed.
      // Preserve client-side `isRead` to avoid overwriting an optimistic mark-read
      // update that hasn't committed to the DB yet.
      qc.setQueriesData<InfiniteData<NewsResponse>>({ queryKey: ['news', updated.channelId] }, (old) =>
        updatePaginatedItems(old, (items) =>
          items.map((item) => (item.id === updated.id ? { ...item, ...updated, isRead: item.isRead } : item)),
        ),
      );
    },
  });
}
