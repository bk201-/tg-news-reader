import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import enUS from 'antd/locale/en_US';
import { AppLayout } from './components/Layout/AppLayout';
import { AuthGate } from './components/Auth/AuthGate';
import { useUIStore } from './store/uiStore';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import './styles.css';
import './i18n';
import { registerMediaServiceWorker } from './services/serviceWorker';

dayjs.locale('ru');
registerMediaServiceWorker();

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

function ThemedApp() {
  const { isDarkTheme } = useUIStore();
  const { i18n } = useTranslation();
  const antdLocale = i18n.language.startsWith('ru') ? ruRU : enUS;

  return (
    <ConfigProvider
      locale={antdLocale}
      theme={{
        algorithm: isDarkTheme ? theme.darkAlgorithm : theme.defaultAlgorithm,
        cssVar: { prefix: 'tgr' },
        hashed: false,
      }}
    >
      <AntApp>
        <AuthGate>
          <AppLayout />
        </AuthGate>
      </AntApp>
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
