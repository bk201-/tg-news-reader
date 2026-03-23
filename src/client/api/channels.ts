import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Channel, ChannelType } from '@shared/types.ts';
import { useUIStore } from '../store/uiStore';

export const channelKeys = { all: ['channels'] as const };

export function useChannels() {
  return useQuery({ queryKey: channelKeys.all, queryFn: () => api.get<Channel[]>('/channels') });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      telegramId: string;
      name: string;
      description?: string;
      channelType?: ChannelType;
      groupId?: number | null;
    }) => api.post<Channel>('/channels', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number;
      name?: string;
      description?: string;
      channelType?: ChannelType;
      groupId?: number | null;
      lastFetchedAt?: number;
    }) => api.put<Channel>('/channels/' + id, data),
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

export function useCountUnreadChannels() {
  const setPendingCounts = useUIStore((s) => s.setPendingCounts);
  return useMutation({
    mutationFn: () => api.post<Record<number, number>>('/channels/count-unread', {}),
    onSuccess: (counts) => {
      setPendingCounts(counts);
    },
  });
}

export function useFetchChannel() {
  const qc = useQueryClient();
  const clearPendingCount = useUIStore((s) => s.clearPendingCount);
  return useMutation({
    mutationFn: ({ id, since, limit }: { id: number; since?: string; limit?: number }) =>
      api.post<{ inserted: number; total: number; mediaProcessing?: boolean }>('/channels/' + id + '/fetch', {
        since,
        limit,
      }),
    onSuccess: (data, variables) => {
      clearPendingCount(variables.id);

      // Update lastFetchedAt + unreadCount directly in the channels cache —
      // no GET /api/channels needed. New messages are all unread, so we can
      // simply add data.inserted to the current count.
      const now = Math.floor(Date.now() / 1000);
      qc.setQueryData<Channel[]>(channelKeys.all, (old) =>
        old
          ? old.map((ch) =>
              ch.id === variables.id
                ? { ...ch, lastFetchedAt: now, unreadCount: ch.unreadCount + (data.inserted ?? 0) }
                : ch,
            )
          : old,
      );

      // Always refresh the news list after fetch — even if inserted=0,
      // media paths / read state may have changed since last load.
      void qc.invalidateQueries({ queryKey: ['news', variables.id] });
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
