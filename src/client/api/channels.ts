import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Channel } from '@shared/types.ts';
import type { CreateChannelInput, UpdateChannelInput, FetchChannelInput } from '@shared/schemas.ts';

export const channelKeys = { all: ['channels'] as const };

export function useChannels() {
  return useQuery({ queryKey: channelKeys.all, queryFn: () => api.get<Channel[]>('/channels') });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateChannelInput) => api.post<Channel>('/channels', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateChannelInput & { id: number }) => api.put<Channel>('/channels/' + id, data),
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

export function useFetchChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, since, limit }: FetchChannelInput & { id: number }) =>
      api.post<{ inserted: number; total: number; mediaProcessing?: boolean }>('/channels/' + id + '/fetch', {
        since,
        limit,
      }),
    onSuccess: (data, variables) => {
      // Update lastFetchedAt + unreadCount directly in the channels cache
      const now = Math.floor(Date.now() / 1000);
      qc.setQueryData<Channel[]>(channelKeys.all, (old) =>
        old
          ? old.map((ch) =>
              ch.id === variables.id
                ? {
                    ...ch,
                    lastFetchedAt: now,
                    unreadCount: ch.unreadCount + (data.inserted ?? 0),
                    totalNewsCount: ch.totalNewsCount + (data.inserted ?? 0),
                  }
                : ch,
            )
          : old,
      );

      // Refresh the news list after fetch
      void qc.invalidateQueries({ queryKey: ['news', variables.id] });
    },
  });
}

export function useReorderChannels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: { id: number; sortOrder: number }[]) =>
      api.patch<{ ok: boolean }>('/channels/reorder', { items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

export function useMarkReadAndFetch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ inserted: number; total: number; mediaProcessing?: boolean }>(
        '/channels/' + id + '/mark-read-and-fetch',
        {},
      ),
    onSuccess: (data, channelId) => {
      const now = Math.floor(Date.now() / 1000);
      qc.setQueryData<Channel[]>(channelKeys.all, (old) =>
        old
          ? old.map((ch) =>
              ch.id === channelId
                ? {
                    ...ch,
                    lastFetchedAt: now,
                    unreadCount: data.inserted ?? 0,
                    totalNewsCount: ch.totalNewsCount + (data.inserted ?? 0),
                  }
                : ch,
            )
          : old,
      );
      void qc.invalidateQueries({ queryKey: ['news', channelId] });
    },
  });
}

export interface ChannelLookupResult {
  name: string;
  username: string | null;
  description: string | null;
}

export function useChannelLookup() {
  return useMutation({
    mutationFn: (username: string) =>
      api.get<ChannelLookupResult>('/channels/lookup?username=' + encodeURIComponent(username)),
  });
}
