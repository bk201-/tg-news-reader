import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type ESListener = (...args: unknown[]) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onerror: ((...args: unknown[]) => void) | null = null;
  private listeners = new Map<string, ESListener[]>();
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, listener: ESListener) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(listener);
  }

  removeEventListener() {}

  /** Simulate 'open' event */
  simulateOpen() {
    for (const fn of this.listeners.get('open') ?? []) fn();
  }

  /** Simulate error */
  simulateError() {
    this.onerror?.();
  }

  close() {
    this.closed = true;
  }
}

describe('createReconnectingEventSource', () => {
  let originalES: typeof globalThis.EventSource;

  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instances = [];
    originalES = globalThis.EventSource;
    (globalThis as any).EventSource = MockEventSource;
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as any).EventSource = originalES;
  });

  async function importFresh() {
    return import('./reconnectingEventSource');
  }

  it('creates an EventSource on construction', async () => {
    const { createReconnectingEventSource } = await importFresh();
    const onConnect = vi.fn();
    createReconnectingEventSource({ url: 'http://test/stream', onConnect });

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe('http://test/stream');
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('reconnects with exponential backoff on error', async () => {
    const { createReconnectingEventSource } = await importFresh();
    const onConnect = vi.fn();
    createReconnectingEventSource({ url: 'http://test/stream', onConnect });

    expect(MockEventSource.instances).toHaveLength(1);

    // First error — should schedule reconnect after 1s (1000 * 2^0)
    MockEventSource.instances[0].simulateError();
    expect(MockEventSource.instances[0].closed).toBe(true);

    vi.advanceTimersByTime(999);
    expect(MockEventSource.instances).toHaveLength(1); // not yet
    vi.advanceTimersByTime(1);
    expect(MockEventSource.instances).toHaveLength(2); // reconnected

    // Second error — 2s delay (1000 * 2^1)
    MockEventSource.instances[1].simulateError();
    vi.advanceTimersByTime(1999);
    expect(MockEventSource.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockEventSource.instances).toHaveLength(3);

    expect(onConnect).toHaveBeenCalledTimes(3);
  });

  it('resets backoff on successful open', async () => {
    const { createReconnectingEventSource } = await importFresh();
    createReconnectingEventSource({ url: 'http://test/stream', onConnect: vi.fn() });

    // Error twice to bump attempt to 2
    MockEventSource.instances[0].simulateError();
    vi.advanceTimersByTime(1000);
    MockEventSource.instances[1].simulateError();
    vi.advanceTimersByTime(2000);

    // Third instance connects successfully
    MockEventSource.instances[2].simulateOpen(); // resets attempt

    // Error again — delay should be back to 1s (not 4s)
    MockEventSource.instances[2].simulateError();
    vi.advanceTimersByTime(999);
    expect(MockEventSource.instances).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(MockEventSource.instances).toHaveLength(4);
  });

  it('does not reconnect after close()', async () => {
    const { createReconnectingEventSource } = await importFresh();
    const handle = createReconnectingEventSource({ url: 'http://test/stream', onConnect: vi.fn() });

    handle.close();
    expect(MockEventSource.instances[0].closed).toBe(true);

    // Simulate error after close — should not reconnect
    vi.advanceTimersByTime(60_000);
    expect(MockEventSource.instances).toHaveLength(1);
  });

  it('caps delay at 30s', async () => {
    const { createReconnectingEventSource } = await importFresh();
    createReconnectingEventSource({ url: 'http://test/stream', onConnect: vi.fn() });

    // Error many times to exceed cap
    for (let i = 0; i < 10; i++) {
      const last = MockEventSource.instances[MockEventSource.instances.length - 1];
      last.simulateError();
      vi.advanceTimersByTime(30_000); // always advance max — should always reconnect
    }

    // All should have reconnected (10 errors + 1 initial = 11)
    expect(MockEventSource.instances.length).toBe(11);
  });
});
