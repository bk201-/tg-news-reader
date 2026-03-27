import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { NewsItem, Channel } from '@shared/types.ts';
import { useUIStore } from '../store/uiStore';

export const newsKeys = {
  byChannel: (channelId: number, filtered = false) => ['news', channelId, filtered ? 'filtered' : 'all'] as const,
};

export interface NewsResponse {
  items: NewsItem[];
  filteredOut: number;
}

export function useNews(channelId: number, filtered = false) {
  return useQuery({
    queryKey: newsKeys.byChannel(channelId, filtered),
    queryFn: () => api.get<NewsResponse>(`/news?channelId=${channelId}${filtered ? '&filtered=1' : ''}`),
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
      qc.setQueriesData<NewsResponse>({ queryKey: ['news', channelId] }, (old) =>
        old ? { ...old, items: old.items.map((n) => (n.id === id ? { ...n, isRead } : n)) } : old,
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

export function useMarkAllRead() {
  const qc = useQueryClient();
  const clearPendingCount = useUIStore((s) => s.clearPendingCount);
  return useMutation({
    mutationFn: (channelId?: number) => api.post('/news/read-all', { channelId }),
    onSuccess: (_data, channelId) => {
      // Clear pending badge count for this channel (or all channels)
      if (channelId !== undefined) {
        clearPendingCount(channelId);
        qc.setQueriesData<NewsResponse>({ queryKey: ['news', channelId] }, (old) =>
          old ? { ...old, items: old.items.map((n) => ({ ...n, isRead: 1 })) } : old,
        );
        qc.setQueryData<Channel[]>(['channels'], (old) =>
          old ? old.map((ch) => (ch.id === channelId ? { ...ch, unreadCount: 0 } : ch)) : old,
        );
      } else {
        // All channels at once — collect IDs first, then update caches
        const allChannelIds = qc.getQueryData<Channel[]>(['channels'])?.map((ch) => ch.id) ?? [];
        qc.setQueriesData<NewsResponse>({ queryKey: ['news'] }, (old) =>
          old ? { ...old, items: old.items.map((n) => ({ ...n, isRead: 1 })) } : old,
        );
        qc.setQueryData<Channel[]>(['channels'], (old) => (old ? old.map((ch) => ({ ...ch, unreadCount: 0 })) : old));
        allChannelIds.forEach((id) => clearPendingCount(id));
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
      void qc.invalidateQueries({ queryKey: ['news'] });
      void qc.invalidateQueries({ queryKey: ['downloads'] });
    },
  });
}

export function useDownloadMedia() {
  return useMutation({
    mutationFn: (newsId: number) =>
      api.post<{ success: boolean }>('/downloads', { newsId, type: 'media', priority: 10 }),
    // No cache invalidation here — the SSE handler in useDownloadsSSE updates
    // both the news cache (localMediaPath) and the downloads cache in-place
    // when the task completes. Invalidating ['news'] here would race against
    // the SSE update: the refetch was issued before the download completes, so
    // the server returns localMediaPath=null, and the response arrives *after*
    // the SSE already set the correct path — overwriting it and hiding the image.
  });
}
