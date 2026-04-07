import { ConfigProvider, App as AntApp, theme } from 'antd';
import { StyleProvider } from 'antd-style';
import ruRU from 'antd/locale/ru_RU';
import enUS from 'antd/locale/en_US';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { AppLayout } from './components/Layout/AppLayout';
import { AuthGate } from './components/Auth/AuthGate';
import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import { useUIStore } from './store/uiStore';

export function App() {
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
