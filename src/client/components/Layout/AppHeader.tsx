import React, { useState } from 'react';
import { Layout, Typography, theme, Button, Tooltip, Dropdown, Modal, App } from 'antd';
import {
  MoonOutlined,
  SunOutlined,
  UserOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  QrcodeOutlined,
  ClearOutlined,
  TranslationOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { clearSwCache } from '../../services/serviceWorker';
import { DownloadsPanel } from './DownloadsPanel';
import { TotpSetupModal } from './TotpSetupModal';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useChannels } from '../../api/channels';
import { api } from '../../api/client';

const { Header } = Layout;
const { Title, Text } = Typography;

export function AppHeader() {
  const { selectedChannelId, isDarkTheme, toggleTheme } = useUIStore();
  const { user, clearAuth, updateUser } = useAuthStore();
  const { data: channels = [] } = useChannels();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { t, i18n } = useTranslation();

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
        <Text type="secondary" style={{ fontSize: 12 }}>
          {user?.email}
        </Text>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'totp',
      icon: user?.hasTOTP ? <SafetyCertificateOutlined style={{ color: 'green' }} /> : <QrcodeOutlined />,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <span style={{ marginRight: 4 }}>{t('header.user_menu.language')}:</span>
          <Button
            size="small"
            type={!i18n.language.startsWith('ru') ? 'primary' : 'default'}
            onClick={(e) => { e.stopPropagation(); void i18n.changeLanguage('en'); }}
          >
            🇬🇧 EN
          </Button>
          <Button
            size="small"
            type={i18n.language.startsWith('ru') ? 'primary' : 'default'}
            onClick={(e) => { e.stopPropagation(); void i18n.changeLanguage('ru'); }}
          >
            🇷🇺 RU
          </Button>
        </div>
      ),
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
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          background: token.colorPrimary,
          padding: '0 24px',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 24 }}>📰</span>
        <Title level={4} style={{ margin: 0, color: '#fff' }}>
          TG News Reader
        </Title>
        {selectedChannel && (
          <Text style={{ color: 'rgba(255,255,255,0.75)', marginLeft: 12 }}>— {selectedChannel.name}</Text>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <DownloadsPanel />
          <Tooltip title={isDarkTheme ? t('header.theme_light') : t('header.theme_dark')}>
            <Button
              type="text"
              icon={isDarkTheme ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleTheme}
              style={{ color: '#fff' }}
            />
          </Tooltip>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
            <Button type="text" icon={<UserOutlined />} style={{ color: '#fff' }} />
          </Dropdown>
        </div>
      </Header>

      <TotpSetupModal open={totpModalOpen} onClose={() => setTotpModalOpen(false)} />
    </>
  );
}
