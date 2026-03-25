import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Filter, FilterStat } from '@shared/types.ts';

export const filterKeys = {
  byChannel: (channelId: number) => ['filters', channelId] as const,
  stats: (channelId: number) => ['filter-stats', channelId] as const,
};

export function useFilters(channelId: number) {
  return useQuery({
    queryKey: filterKeys.byChannel(channelId),
    queryFn: () => api.get<Filter[]>(`/channels/${channelId}/filters`),
    enabled: !!channelId,
  });
}

export function useFilterStats(channelId: number) {
  return useQuery({
    queryKey: filterKeys.stats(channelId),
    queryFn: () => api.get<FilterStat[]>(`/channels/${channelId}/filters/stats`),
    enabled: !!channelId,
  });
}

export function useCreateFilter(channelId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; type: 'tag' | 'keyword'; value: string }) =>
      api.post<Filter>(`/channels/${channelId}/filters`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: filterKeys.byChannel(channelId) });
      void qc.invalidateQueries({ queryKey: ['news', channelId] });
    },
  });
}

export function useUpdateFilter(channelId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number;
      name?: string;
      type?: 'tag' | 'keyword';
      value?: string;
      isActive?: number;
    }) => api.put<Filter>(`/channels/${channelId}/filters/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: filterKeys.byChannel(channelId) });
      void qc.invalidateQueries({ queryKey: ['news', channelId] });
    },
  });
}

export function useDeleteFilter(channelId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/channels/${channelId}/filters/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: filterKeys.byChannel(channelId) });
      void qc.invalidateQueries({ queryKey: ['news', channelId] });
    },
  });
}
