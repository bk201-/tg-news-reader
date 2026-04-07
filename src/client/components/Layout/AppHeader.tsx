import React, { useState } from 'react';
import { Layout, Typography, Button, Dropdown, Modal, App } from 'antd';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';
import {
  MoonOutlined,
  SunOutlined,
  UserOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  QrcodeOutlined,
  ClearOutlined,
  TranslationOutlined,
  MenuOutlined,
  TagOutlined,
} from '@ant-design/icons';
import { version as APP_VERSION } from '../../../../package.json';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import { FlagRU, FlagUS } from '../Flags';
import { clearSwCache } from '../../services/serviceWorker';
import { DownloadsPanel } from './DownloadsPanel';
import { LogsPanel } from './LogsPanel';
import { TotpSetupModal } from './TotpSetupModal';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useChannels } from '../../api/channels';
import { useIsXxl } from '../../hooks/breakpoints';
import { api } from '../../api/client';

const { Header } = Layout;
const { Title, Text } = Typography;

const useStyles = createStyles(({ css, token }, sidebarInDrawer: boolean) => ({
  header: css`
    display: flex;
    align-items: center;
    background: ${token.colorPrimary};
    padding: ${sidebarInDrawer ? '0 12px' : '0 24px'};
    gap: ${sidebarInDrawer ? '8px' : '12px'};
  `,
  iconBtn: css`
    color: ${token.colorTextLightSolid};
    flex-shrink: 0;
  `,
  emoji: css`
    font-size: 24px;
    flex-shrink: 0;
  `,
  title: css`
    margin: 0;
    color: ${token.colorTextLightSolid};
    white-space: nowrap;
  `,
  channelName: css`
    color: color-mix(in srgb, ${token.colorTextLightSolid} 85%, transparent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    margin-left: ${sidebarInDrawer ? '0' : '12px'};
    flex: ${sidebarInDrawer ? '1' : 'unset'};
    font-weight: ${sidebarInDrawer ? '600' : '400'};
  `,
  actions: css`
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  emailText: css`
    font-size: 12px;
  `,
  totpActiveIcon: css`
    color: ${token.colorSuccess};
  `,
  langSwitcher: css`
    display: flex;
    align-items: center;
    gap: 6px;
  `,
  langLabel: css`
    margin-right: 4px;
  `,
  langBtn: css`
    display: flex;
    align-items: center;
    gap: 4px;
  `,
}));

export function AppHeader() {
  const { selectedChannelId, isDarkTheme, toggleTheme, setSidebarDrawerOpen } = useUIStore();
  const { user, clearAuth, updateUser } = useAuthStore();
  const { data: channels = [] } = useChannels();
  const { message } = App.useApp();
  const { t, i18n } = useTranslation();
  // ≥ 1600px → full desktop, no hamburger needed
  const sidebarInDrawer = !useIsXxl();
  const { styles } = useStyles(sidebarInDrawer);

  const selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null;
  const [totpModalOpen, setTotpModalOpen] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    clearAuth();
  };

  const handleClearMediaCache = () => {
    Modal.confirm({
      title: t('header.user_menu.clear_cache_confirm_title'),
      content: t('header.user_menu.clear_cache_confirm_content'),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        await clearSwCache();
        void message.success(t('header.user_menu.clear_cache_success'));
      },
    });
  };

  const handleDisableTOTP = () => {
    Modal.confirm({
      title: t('header.user_menu.disable_2fa_confirm_title'),
      content: t('header.user_menu.disable_2fa_confirm_content'),
      okText: t('header.user_menu.disable_2fa_ok'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        await api.delete('/auth/totp');
        updateUser({ hasTOTP: false });
      },
    });
  };

  const userMenuItems = [
    {
      key: 'email',
      label: (
        <Text type="secondary" className={styles.emailText}>
          {user?.email}
        </Text>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'totp',
      icon: user?.hasTOTP ? <SafetyCertificateOutlined className={styles.totpActiveIcon} /> : <QrcodeOutlined />,
      label: user?.hasTOTP ? t('header.user_menu.manage_2fa') : t('header.user_menu.enable_2fa'),
      onClick: user?.hasTOTP ? handleDisableTOTP : () => setTotpModalOpen(true),
    },
    { type: 'divider' as const },
    {
      key: 'clear-cache',
      icon: <ClearOutlined />,
      label: t('header.user_menu.clear_cache'),
      onClick: handleClearMediaCache,
    },
    { type: 'divider' as const },
    {
      key: 'language',
      icon: <TranslationOutlined />,
      label: (
        <div className={styles.langSwitcher} onClick={(e) => e.stopPropagation()}>
          <span className={styles.langLabel}>{t('header.user_menu.language')}:</span>
          <Button
            size="small"
            type={!i18n.language.startsWith('ru') ? 'primary' : 'default'}
            onClick={(e) => {
              e.stopPropagation();
              void i18n.changeLanguage('en');
            }}
            className={styles.langBtn}
          >
            <FlagUS size={18} /> EN
          </Button>
          <Button
            size="small"
            type={i18n.language.startsWith('ru') ? 'primary' : 'default'}
            onClick={(e) => {
              e.stopPropagation();
              void i18n.changeLanguage('ru');
            }}
            className={styles.langBtn}
          >
            <FlagRU size={18} /> RU
          </Button>
        </div>
      ),
    },
    { type: 'divider' as const },
    {
      key: 'version',
      icon: <TagOutlined />,
      label: (
        <Text type="secondary" className={styles.emailText}>
          {t('header.user_menu.version', { version: APP_VERSION })}
        </Text>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('header.user_menu.logout'),
      danger: true,
      onClick: () => void handleLogout(),
    },
  ];

  return (
    <>
      <Header className={styles.header}>
        {sidebarInDrawer && (
          <Tooltip title={t('header.open_sidebar')}>
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setSidebarDrawerOpen(true)}
              className={styles.iconBtn}
            />
          </Tooltip>
        )}
        <span className={styles.emoji}>📰</span>
        {!sidebarInDrawer && (
          <Title level={4} className={styles.title}>
            TG News Reader
          </Title>
        )}
        {selectedChannel && (
          <Text className={styles.channelName}>
            {sidebarInDrawer ? selectedChannel.name : `— ${selectedChannel.name}`}
          </Text>
        )}
        <div className={styles.actions}>
          <DownloadsPanel />
          <LogsPanel />
          <Tooltip title={isDarkTheme ? t('header.theme_light') : t('header.theme_dark')}>
            <Button
              type="text"
              icon={isDarkTheme ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleTheme}
              aria-label={isDarkTheme ? t('header.theme_light') : t('header.theme_dark')}
              className={styles.iconBtn}
            />
          </Tooltip>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
            <Button
              type="text"
              icon={<UserOutlined />}
              aria-label={t('header.user_menu_label')}
              className={styles.iconBtn}
            />
          </Dropdown>
        </div>
      </Header>

      <TotpSetupModal open={totpModalOpen} onClose={() => setTotpModalOpen(false)} />
    </>
  );
}
