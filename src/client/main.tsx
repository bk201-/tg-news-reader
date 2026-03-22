import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import { StyleProvider } from 'antd-style';
import ruRU from 'antd/locale/ru_RU';
import enUS from 'antd/locale/en_US';
import { AppLayout } from './components/Layout/AppLayout';
import { AuthGate } from './components/Auth/AuthGate';
import { useUIStore } from './store/uiStore';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/en';
import './styles.css';
import './i18n';
import { registerMediaServiceWorker } from './services/serviceWorker';

registerMediaServiceWorker();

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
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
          <AuthGate>
            <AppLayout />
          </AuthGate>
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
