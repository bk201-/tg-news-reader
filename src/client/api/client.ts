import { useAuthStore, type AuthUser } from '../store/authStore';

const BASE = '/api';

// Prevent multiple simultaneous refresh calls
let refreshing: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (refreshing) return refreshing;

  refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) {
        useAuthStore.getState().clearAuth();
        return null;
      }
      const data = (await res.json()) as { accessToken: string; user: AuthUser };
      useAuthStore.getState().setAuth(data.accessToken, data.user);
      return data.accessToken;
    })
    .catch(() => {
      useAuthStore.getState().clearAuth();
      return null;
    })
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
}

async function request<T>(path: string, options?: RequestInit, isRetry = false): Promise<T> {
  const { accessToken } = useAuthStore.getState();

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options?.headers,
    },
    credentials: 'include',
    ...options,
  });

  // Auto-refresh on 401 (but not for auth endpoints themselves)
  if (res.status === 401 && !isRetry && !path.startsWith('/auth')) {
    const newToken = await tryRefresh();
    if (newToken) return request<T>(path, options, true);
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'DELETE',
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
};
