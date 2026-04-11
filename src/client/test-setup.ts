// Client test setup — mock browser APIs that Zustand / antd may access at import time.
import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// localStorage mock (jsdom provides one, but ensure it's clean between tests)
beforeEach(() => localStorage.clear());

// matchMedia mock — jsdom doesn't provide it
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
