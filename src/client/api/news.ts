import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { NewsItem } from '@shared/types.ts';

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
    mutationFn: ({ id, isRead = 1 }: { id: number; isRead?: number }) => api.patch(`/news/${id}/read`, { isRead }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['news'] });
      void qc.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId?: number) => api.post('/news/read-all', { channelId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['news'] });
      void qc.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

export function useExtractContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (newsId: number) => api.post<NewsItem>(`/content/news/${newsId}`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['news'] });
    },
  });
}

export function useDownloadMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (newsId: number) => api.post<NewsItem>(`/news/${newsId}/download-media`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['news'] });
    },
  });
}
