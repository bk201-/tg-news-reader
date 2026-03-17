import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Channel, ChannelType } from '@shared/types.ts';

export const channelKeys = { all: ['channels'] as const };

export function useChannels() {
  return useQuery({ queryKey: channelKeys.all, queryFn: () => api.get<Channel[]>('/channels') });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { telegramId: string; name: string; description?: string; channelType?: ChannelType }) =>
      api.post<Channel>('/channels', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; description?: string; channelType?: ChannelType; lastFetchedAt?: number }) =>
      api.put<Channel>('/channels/' + id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete('/channels/' + id),
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

export function useFetchAllChannels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ updated: number; total: number }>('/channels/fetch-all', {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: channelKeys.all });
    },
  });
}

export function useFetchChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, since, limit }: { id: number; since?: string; limit?: number }) =>
      api.post<{ inserted: number; total: number; mediaProcessing?: boolean }>('/channels/' + id + '/fetch', { since, limit }),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['news', variables.id] });
      void qc.invalidateQueries({ queryKey: channelKeys.all });
    },
  });
}
