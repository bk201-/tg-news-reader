import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useVersionCheck } from './useVersionCheck';

describe('useVersionCheck', () => {
  const fetcher = vi.fn();

  beforeEach(() => {
    fetcher.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets newVersionAvailable to true when the server version differs', async () => {
    fetcher.mockResolvedValue({
      ok: true,
      json: async () => ({ version: '1.19.0' }),
    });

    const { result } = renderHook(() =>
      useVersionCheck({ clientVersion: '1.18.0', intervalMs: 1_000, isDev: false, fetcher }),
    );

    await waitFor(() => expect(result.current.newVersionAvailable).toBe(true));
    expect(fetcher).toHaveBeenCalledWith('/api/version', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  });

  it('keeps newVersionAvailable false when versions match', async () => {
    fetcher.mockResolvedValue({
      ok: true,
      json: async () => ({ version: '1.18.0' }),
    });

    const { result } = renderHook(() =>
      useVersionCheck({ clientVersion: '1.18.0', intervalMs: 1_000, isDev: false, fetcher }),
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(result.current.newVersionAvailable).toBe(false);
  });

  it('keeps newVersionAvailable false when fetch fails', async () => {
    fetcher.mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() =>
      useVersionCheck({ clientVersion: '1.18.0', intervalMs: 1_000, isDev: false, fetcher }),
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(result.current.newVersionAvailable).toBe(false);
  });

  it('does not poll in dev mode', async () => {
    vi.useFakeTimers();

    renderHook(() => useVersionCheck({ clientVersion: '1.18.0', intervalMs: 1_000, isDev: true, fetcher }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps banner dismissed across polls when the same mismatch persists', async () => {
    vi.useFakeTimers();

    fetcher.mockResolvedValue({
      ok: true,
      json: async () => ({ version: '1.19.0' }),
    });

    const { result } = renderHook(() =>
      useVersionCheck({ clientVersion: '1.18.0', intervalMs: 1_000, isDev: false, fetcher }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.newVersionAvailable).toBe(true);

    act(() => result.current.dismiss());
    expect(result.current.newVersionAvailable).toBe(false);

    // Next poll — same server version still mismatches, but dismissed should stay
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      await Promise.resolve();
    });

    expect(result.current.newVersionAvailable).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('resets dismissed when a fresh mismatch is detected (was matching, now mismatching)', async () => {
    // First poll: versions match → no banner
    fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ version: '1.18.0' }) });
    // Second poll: new version deployed → mismatch
    fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ version: '1.19.0' }) });

    vi.useFakeTimers();

    const { result } = renderHook(() =>
      useVersionCheck({ clientVersion: '1.18.0', intervalMs: 1_000, isDev: false, fetcher }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.newVersionAvailable).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      await Promise.resolve();
    });

    expect(result.current.newVersionAvailable).toBe(true);
  });
});
