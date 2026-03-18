import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Group } from '@shared/types.ts';
import { useAuthStore } from '../store/authStore';

export const groupKeys = { all: ['groups'] as const };

export function useGroups() {
  return useQuery({ queryKey: groupKeys.all, queryFn: () => api.get<Group[]>('/groups') });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color?: string; pin?: string; sortOrder?: number }) =>
      api.post<Group>('/groups', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number;
      name?: string;
      color?: string;
      pin?: string | null;
      sortOrder?: number;
    }) => api.put<Group>('/groups/' + id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete('/groups/' + id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: groupKeys.all });
      // Also invalidate channels since group_id may have changed
      void qc.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

export function useVerifyGroupPIN() {
  const updateToken = useAuthStore((s) => s.updateToken);
  return useMutation({
    mutationFn: ({ id, pin }: { id: number; pin: string }) =>
      api.post<{ success: boolean; accessToken?: string; unlockedGroupIds?: number[] }>(
        '/groups/' + id + '/verify-pin',
        { pin },
      ),
    onSuccess: (data) => {
      // Update access token — unlockedGroupIds now encoded in JWT and persisted in session
      if (data.accessToken) {
        updateToken(data.accessToken);
      }
    },
  });
}
