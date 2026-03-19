import React, { useState } from 'react';
import { Layout, Typography, theme, Button, Tooltip, Dropdown, Modal } from 'antd';
import {
  MoonOutlined,
  SunOutlined,
  UserOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  QrcodeOutlined,
} from '@ant-design/icons';
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

  const selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null;
  const [totpModalOpen, setTotpModalOpen] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    clearAuth();
  };

  const handleDisableTOTP = () => {
    Modal.confirm({
      title: 'Отключить 2FA?',
      content: 'Двухфакторная аутентификация будет отключена.',
      okText: 'Отключить',
      okType: 'danger',
      cancelText: 'Отмена',
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
      label: user?.hasTOTP ? 'Управление 2FA' : 'Включить 2FA',
      onClick: user?.hasTOTP ? handleDisableTOTP : () => setTotpModalOpen(true),
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Выйти',
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
          <Tooltip title={isDarkTheme ? 'Светлая тема' : 'Тёмная тема'}>
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
