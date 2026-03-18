import { useAuthStore } from '../store/authStore';

/**
 * Returns an authenticated URL for a media path served at /api/media/.
 * Appends ?token= so that browser-native requests (img src, video src, EventSource)
 * pass the JWT without needing custom headers.
 */
export function mediaUrl(localMediaPath: string): string {
  const token = useAuthStore.getState().accessToken;
  const base = `/api/media/${localMediaPath}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
