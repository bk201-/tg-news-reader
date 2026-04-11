import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../store/authStore';
import { mediaUrl } from './mediaUrl';

describe('mediaUrl', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null });
  });

  it('returns authenticated URL with token query param', () => {
    useAuthStore.setState({ accessToken: 'my-jwt-token' });
    const url = mediaUrl('channel123/image.jpg');
    expect(url).toBe('/api/media/channel123/image.jpg?token=my-jwt-token');
  });

  it('encodes special characters in the token', () => {
    useAuthStore.setState({ accessToken: 'token with spaces+special' });
    const url = mediaUrl('ch/img.jpg');
    expect(url).toContain('?token=token%20with%20spaces%2Bspecial');
  });

  it('returns plain URL without token when not authenticated', () => {
    const url = mediaUrl('channel123/image.jpg');
    expect(url).toBe('/api/media/channel123/image.jpg');
  });
});
