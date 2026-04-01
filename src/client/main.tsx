import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import { StyleProvider } from 'antd-style';
import ruRU from 'antd/locale/ru_RU';
import enUS from 'antd/locale/en_US';
import { AppLayout } from './components/Layout/AppLayout';
import { AuthGate } from './components/Auth/AuthGate';
import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import { useUIStore } from './store/uiStore';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/en';
import './styles.css';
import './i18n';
import { registerMediaServiceWorker } from './services/serviceWorker';
import { logger } from './logger';
import { ApiError } from './api/client';

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

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      // Only report queries that have no dedicated onError — avoid double-logging
      if (query.observers.some((o) => o.hasListeners())) return;
      logger.warn({ module: 'query', queryKey: query.queryKey, err }, `Query error: ${err.message}`);
    },
  }),
  mutationCache: new MutationCache({
    onError: (err) => {
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

function ThemedApp() {
  const { isDarkTheme } = useUIStore();
  const { i18n } = useTranslation();
  const isRu = i18n.language.startsWith('ru');
  const antdLocale = isRu ? ruRU : enUS;

  // Keep dayjs locale in sync with UI language
  dayjs.locale(isRu ? 'ru' : 'en');

  return (
    <ConfigProvider
      locale={antdLocale}
      theme={{
        algorithm: isDarkTheme ? theme.darkAlgorithm : theme.defaultAlgorithm,
        cssVar: { prefix: 'tgr' },
        hashed: false,
      }}
    >
      <StyleProvider>
        <AntApp>
          <AppErrorBoundary>
            <AuthGate>
              <AppLayout />
            </AuthGate>
          </AppErrorBoundary>
        </AntApp>
      </StyleProvider>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemedApp />
    </QueryClientProvider>
  </React.StrictMode>,
);
