import React, { useEffect, useRef, useState } from 'react';
import { Layout, Typography, theme, Button, Tooltip, Splitter, Dropdown, Modal, Input, Alert, Space, Spin } from 'antd';
import {
  MoonOutlined,
  SunOutlined,
  UserOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  QrcodeOutlined,
} from '@ant-design/icons';
import { ChannelSidebar } from '../Channels/ChannelSidebar';
import { GroupPanel } from '../Channels/GroupPanel';
import { NewsFeed } from '../News/NewsFeed';
import { DownloadsPanel, DownloadsPinnedContent } from './DownloadsPanel';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useChannels } from '../../api/channels';
import { api } from '../../api/client';

const { Header } = Layout;
const { Title, Text } = Typography;

export function AppLayout() {
  const { selectedChannelId, setSelectedChannelId, isDarkTheme, toggleTheme, downloadsPanelPinned } = useUIStore();
  const { user, clearAuth, updateUser } = useAuthStore();
  const { data: channels = [] } = useChannels();
  const selectedChannel = channels.find((c) => c.id === selectedChannelId) || null;
  const { token } = theme.useToken();
  const initialized = useRef(false);

  // 2FA Setup modal state
  const [totpModalOpen, setTotpModalOpen] = useState(false);
  const [totpQr, setTotpQr] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpStep, setTotpStep] = useState<'scan' | 'confirm'>('scan');
  const [totpError, setTotpError] = useState<string | null>(null);
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpFetchError, setTotpFetchError] = useState<string | null>(null);

  // Restore channel from URL once channels are loaded
  useEffect(() => {
    if (initialized.current || channels.length === 0) return;
    initialized.current = true;
    const id = parseInt(new URLSearchParams(window.location.search).get('channel') ?? '', 10);
    if (id && channels.some((c) => c.id === id)) setSelectedChannelId(id);
  }, [channels, setSelectedChannelId]);

  // Sync URL when selected channel changes
  useEffect(() => {
    if (!initialized.current) return;
    if (selectedChannelId) {
      history.replaceState(null, '', `?channel=${selectedChannelId}${window.location.hash}`);
    } else {
      history.replaceState(null, '', window.location.pathname);
    }
  }, [selectedChannelId]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    clearAuth();
  };

  const openTotpSetup = async () => {
    setTotpStep('scan');
    setTotpCode('');
    setTotpError(null);
    setTotpFetchError(null);
    setTotpQr(null);
    setTotpSecret(null);
    setTotpModalOpen(true);
    try {
      const data = await api.get<{ qrCode: string; secret: string }>('/auth/totp/setup');
      setTotpQr(data.qrCode);
      setTotpSecret(data.secret);
    } catch (e: unknown) {
      setTotpFetchError(e instanceof Error ? e.message : 'Не удалось загрузить QR-код');
    }
  };

  const handleTotpConfirm = async () => {
    if (!totpSecret) return;
    setTotpLoading(true);
    setTotpError(null);
    try {
      await api.post('/auth/totp/confirm', { secret: totpSecret, code: totpCode });
      updateUser({ hasTOTP: true });
      setTotpModalOpen(false);
    } catch (e: unknown) {
      setTotpError(e instanceof Error ? e.message : 'Неверный код');
    } finally {
      setTotpLoading(false);
    }
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
      onClick: user?.hasTOTP ? handleDisableTOTP : openTotpSetup,
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Выйти',
      danger: true,
      onClick: handleLogout,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
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

      <Splitter
        style={{ height: 'calc(100vh - 64px)' }}
        onResizeEnd={(sizes) => localStorage.setItem('sidebarWidth', String(Math.round(sizes[0])))}
      >
        <Splitter.Panel
          defaultSize={parseInt(localStorage.getItem('sidebarWidth') ?? '280', 10)}
          min={200}
          max={500}
          style={{
            background: token.colorBgContainer,
            borderRight: `1px solid ${token.colorBorderSecondary}`,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', height: '100%' }}>
            <GroupPanel />
            <div style={{ flex: 1, minWidth: 0, borderLeft: `1px solid ${token.colorBorderSecondary}` }}>
              <ChannelSidebar />
            </div>
          </div>
        </Splitter.Panel>

        <Splitter.Panel style={{ background: token.colorBgLayout, overflow: 'hidden' }}>
          <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              {selectedChannel ? (
                <NewsFeed channel={selectedChannel} />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                >
                  <span style={{ fontSize: 64 }}>📡</span>
                  <Text type="secondary" style={{ fontSize: 16 }}>
                    Выберите канал из списка слева
                  </Text>
                </div>
              )}
            </div>
            {downloadsPanelPinned && <DownloadsPinnedContent />}
          </div>
        </Splitter.Panel>
      </Splitter>

      {/* 2FA Setup Modal */}
      <Modal
        open={totpModalOpen}
        title="Настройка двухфакторной аутентификации"
        onCancel={() => setTotpModalOpen(false)}
        footer={null}
        width={440}
      >
        {totpStep === 'scan' ? (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Text>Отсканируйте QR-код в приложении Google Authenticator, Microsoft Authenticator или аналогичном:</Text>
            {totpFetchError ? (
              <Alert
                type="error"
                message={totpFetchError}
                showIcon
                action={
                  <Button size="small" onClick={openTotpSetup}>
                    Повторить
                  </Button>
                }
              />
            ) : totpQr ? (
              <div style={{ textAlign: 'center' }}>
                <img src={totpQr} alt="TOTP QR Code" style={{ width: 200, height: 200 }} />
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin />
              </div>
            )}
            <Button type="primary" block onClick={() => setTotpStep('confirm')} disabled={!totpQr}>
              Я отсканировал, ввести код →
            </Button>
          </Space>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Text>Введите 6-значный код из приложения для подтверждения:</Text>
            <Input.OTP length={6} value={totpCode} onChange={setTotpCode} size="large" />
            {totpError && <Alert type="error" message={totpError} showIcon />}
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button onClick={() => setTotpStep('scan')}>← Назад</Button>
              <Button type="primary" onClick={handleTotpConfirm} loading={totpLoading} disabled={totpCode.length < 6}>
                Подтвердить и включить 2FA
              </Button>
            </Space>
          </Space>
        )}
      </Modal>
    </Layout>
  );
}
