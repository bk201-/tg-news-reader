import { useQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from './client';
import { useAuthStore } from '../store/authStore';
import { logger } from '../logger';
import type { DownloadTask, DownloadType, NewsItem } from '@shared/types.ts';
import { type NewsResponse, updatePaginatedItems } from './news';

export const downloadsKeys = {
  all: ['downloads'] as const,
};

export function useDownloads() {
  return useQuery({
    queryKey: downloadsKeys.all,
    queryFn: () => api.get<DownloadTask[]>('/downloads'),
    // SSE (useDownloadsSSE) keeps this data up-to-date via push events —
    // no polling needed.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function useCreateDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { newsId: number; type: DownloadType; url?: string; priority?: number }) =>
      api.post<{ success: boolean }>('/downloads', args),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: downloadsKeys.all });
    },
  });
}

export function usePrioritizeDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.patch<{ success: boolean }>(`/downloads/${id}/prioritize`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: downloadsKeys.all });
    },
  });
}

export function useCancelDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ success: boolean }>(`/downloads/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: downloadsKeys.all });
    },
  });
}

/** Find existing task for a specific news item + type */
export function useNewsDownloadTask(newsId: number, type: DownloadType): DownloadTask | null {
  const { data: tasks = [] } = useDownloads();
  return tasks.find((t) => t.newsId === newsId && t.type === type) ?? null;
}

/**
 * Connects to the SSE stream for real-time download updates.
 * Mount once at app level (inside DownloadsPanel).
 */
export function useDownloadsSSE() {
  const qc = useQueryClient();
  // Re-subscribe if access token changes (e.g. after token refresh)
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    // No token = not authenticated — don't connect
    if (!accessToken) return;

    // EventSource cannot send custom headers — pass JWT as ?token= query param
    const url = `/api/downloads/stream?token=${encodeURIComponent(accessToken)}`;
    const es = new EventSource(url);

    es.addEventListener('init', (e: MessageEvent) => {
      const tasks = JSON.parse(e.data as string) as DownloadTask[];
      qc.setQueryData(downloadsKeys.all, tasks);
    });

    es.addEventListener('task_update', (e: MessageEvent) => {
      const task = JSON.parse(e.data as string) as DownloadTask;

      if (task.status === 'done') {
        if (task.type === 'media' && task.channelId) {
          // Update localMediaPath / localMediaPaths in-place — no refetch needed.
          // Same pattern as useMediaProgressSSE to avoid spammy GET /api/news.
          qc.setQueriesData<InfiniteData<NewsResponse>>({ queryKey: ['news', task.channelId] }, (old) =>
            updatePaginatedItems(old, (items) =>
              items.map((item: NewsItem) => {
                if (item.id !== task.newsId) return item;
                return {
                  ...item,
                  localMediaPath: task.localMediaPath ?? item.localMediaPath,
                  localMediaPaths: task.localMediaPaths ?? item.localMediaPaths,
                };
              }),
            ),
          );
          qc.setQueryData<DownloadTask[]>(downloadsKeys.all, (old = []) => (old ?? []).filter((t) => t.id !== task.id));
          return;
        }

        if (task.channelId) {
          // Article task: need fullContent — refetch the news list, then drop the task.
          // Refetch FIRST so content is in cache before button state changes.
          void qc.refetchQueries({ queryKey: ['news', task.channelId] }).then(() => {
            qc.setQueryData<DownloadTask[]>(downloadsKeys.all, (old = []) =>
              (old ?? []).filter((t) => t.id !== task.id),
            );
          });
          return;
        }
      }

      qc.setQueryData<DownloadTask[]>(downloadsKeys.all, (old = []) => {
        const idx = old.findIndex((t) => t.id === task.id);
        if (idx >= 0) {
          const updated = [...old];
          updated[idx] = task;
          return updated;
        }
        return [...old, task];
      });
    });

    es.onerror = () => {
      // Browser auto-reconnects EventSource on error
      logger.warn({ module: 'downloads' }, 'SSE connection error — browser will reconnect');
    };

    return () => es.close();
  }, [qc, accessToken]);
}
