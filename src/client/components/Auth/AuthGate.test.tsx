import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/renderWithProviders';
import { AuthGate } from './AuthGate';
import { useAuthStore } from '../../store/authStore';

describe('AuthGate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock fetch for the refresh call
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);
  });

  it('shows spinner when checking auth', () => {
    useAuthStore.setState({ isCheckingAuth: true, accessToken: null });

    renderWithProviders(
      <AuthGate>
        <div>App Content</div>
      </AuthGate>,
    );

    // Ant Design Spin renders a .ant-spin element
    expect(document.querySelector('.ant-spin')).toBeInTheDocument();
    expect(screen.queryByText('App Content')).not.toBeInTheDocument();
  });

  it('shows login page when not authenticated', async () => {
    useAuthStore.setState({ isCheckingAuth: false, accessToken: null });

    renderWithProviders(
      <AuthGate>
        <div>App Content</div>
      </AuthGate>,
    );

    await waitFor(() => {
      // LoginPage renders the login button
      expect(screen.getByText('auth.login_button')).toBeInTheDocument();
    });
    expect(screen.queryByText('App Content')).not.toBeInTheDocument();
  });

  it('renders children when authenticated', async () => {
    useAuthStore.setState({
      isCheckingAuth: false,
      accessToken: 'valid-token',
      user: { id: 1, email: 'a@b.com', role: 'admin' },
    });

    renderWithProviders(
      <AuthGate>
        <div>App Content</div>
      </AuthGate>,
    );

    expect(screen.getByText('App Content')).toBeInTheDocument();
  });

  it('calls /api/auth/refresh on mount', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    useAuthStore.setState({ isCheckingAuth: true, accessToken: null });

    renderWithProviders(
      <AuthGate>
        <div>App Content</div>
      </AuthGate>,
    );

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/refresh', expect.objectContaining({ method: 'POST' }));
  });

  it('restores session from cookie on successful refresh', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          accessToken: 'restored-token',
          user: { id: 1, email: 'a@b.com', role: 'admin' },
        }),
    } as Response);

    useAuthStore.setState({ isCheckingAuth: true, accessToken: null });

    renderWithProviders(
      <AuthGate>
        <div>App Content</div>
      </AuthGate>,
    );

    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBe('restored-token');
    });
  });
});
