import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import './styles.css';
import './i18n';
import 'dayjs/locale/ru';
import 'dayjs/locale/en';
import { registerMediaServiceWorker } from './services/serviceWorker';
import { logger } from './logger';
import { ApiError } from './api/client';
import { App } from './App';

registerMediaServiceWorker();

// ─── Global JS error handlers ─────────────────────────────────────────────────

window.addEventListener('error', (e) => {
  // Filter out resource-load errors (img/script src failures) — they have no `error`
  if (!e.error) return;
  logger.error(
    { module: 'window', err: e.error as Error, source: e.filename, line: e.lineno },
    `Uncaught error: ${e.message}`,
  );
});

window.addEventListener('unhandledrejection', (e) => {
  logger.error(
    { module: 'window', err: e.reason instanceof Error ? e.reason : String(e.reason) },
    'Unhandled promise rejection',
  );
});

// ─── QueryClient with global error reporting ──────────────────────────────────

/** If the error message mentions AUTH_KEY, immediately refetch health so
 *  TelegramSessionBanner appears without waiting for the next 5-min poll. */
function triggerHealthRefetchOnAuthKey(err: Error): void {
  if (err.message.includes('AUTH_KEY')) {
    void queryClient.invalidateQueries({ queryKey: ['health'] });
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      triggerHealthRefetchOnAuthKey(err);
      // Only report queries that have no dedicated onError — avoid double-logging
      if (query.observers.some((o) => o.hasListeners())) return;
      logger.warn({ module: 'query', queryKey: query.queryKey, err }, `Query error: ${err.message}`);
    },
  }),
  mutationCache: new MutationCache({
    onError: (err) => {
      triggerHealthRefetchOnAuthKey(err);
      logger.warn({ module: 'query', err }, `Mutation error: ${err.message}`);
    },
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Don't retry client errors (4xx) — only network and server errors
      retry: (failureCount, err) => {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
        return failureCount < 3;
      },
      // Exponential backoff: 1s → 2s → 4s → … capped at 30s
      retryDelay: (attempt) => Math.min(1_000 * Math.pow(2, attempt), 30_000),
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
