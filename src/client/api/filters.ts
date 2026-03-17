import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Filter } from '@shared/types.ts';

export const filterKeys = {
  byChannel: (channelId: number) => ['filters', channelId] as const,
};

export function useFilters(channelId: number) {
  return useQuery({
    queryKey: filterKeys.byChannel(channelId),
    queryFn: () => api.get<Filter[]>(`/channels/${channelId}/filters`),
    enabled: !!channelId,
  });
}

export function useCreateFilter(channelId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; type: 'tag' | 'keyword'; value: string }) =>
      api.post<Filter>(`/channels/${channelId}/filters`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: filterKeys.byChannel(channelId) }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: filterKeys.byChannel(channelId) }),
  });
}

export function useDeleteFilter(channelId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/channels/${channelId}/filters/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: filterKeys.byChannel(channelId) }),
  });
}
