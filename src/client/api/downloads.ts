import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from './client';
import { useAuthStore } from '../store/authStore';
import { logger } from '../logger';
import type { DownloadTask, DownloadType } from '@shared/types.ts';

export const downloadsKeys = {
  all: ['downloads'] as const,
};

export function useDownloads() {
  return useQuery({
    queryKey: downloadsKeys.all,
    queryFn: () => api.get<DownloadTask[]>('/downloads'),
    refetchInterval: 5000,
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
    // EventSource cannot send custom headers — pass JWT as ?token= query param
    const url = accessToken
      ? `/api/downloads/stream?token=${encodeURIComponent(accessToken)}`
      : '/api/downloads/stream';
    const es = new EventSource(url);

    es.addEventListener('init', (e: MessageEvent) => {
      const tasks = JSON.parse(e.data as string) as DownloadTask[];
      qc.setQueryData(downloadsKeys.all, tasks);
    });

    es.addEventListener('task_update', (e: MessageEvent) => {
      const task = JSON.parse(e.data as string) as DownloadTask;

      if (task.status === 'done' && task.channelId) {
        // Refetch news FIRST so the content is already in cache, THEN remove the task.
        // Removing the task first causes a flash: button reappears before the news
        // query finishes updating (invalidateQueries is async / background).
        void qc.refetchQueries({ queryKey: ['news', task.channelId] }).then(() => {
          qc.setQueryData<DownloadTask[]>(downloadsKeys.all, (old = []) => (old ?? []).filter((t) => t.id !== task.id));
        });
        return;
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
