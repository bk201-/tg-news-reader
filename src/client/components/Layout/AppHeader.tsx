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

/** Russian flag: white / blue / red horizontal stripes */
function FlagRU({ size = 20 }: { size?: number }) {
  const h = Math.round(size * 2 / 3);
  return (
    <svg width={size} height={h} viewBox="0 0 3 2"
      style={{ display: 'inline-block', verticalAlign: 'middle', borderRadius: 2, border: '1px solid rgba(0,0,0,.12)' }}>
      <rect width="3" height="0.667" y="0" fill="#fff" />
      <rect width="3" height="0.667" y="0.667" fill="#003da5" />
      <rect width="3" height="0.667" y="1.333" fill="#da291c" />
    </svg>
  );
}

/** US flag: 13 stripes + blue canton with 50 stars */
function FlagUS({ size = 20 }: { size?: number }) {
  const w = size;
  const h = Math.round(size * 10 / 19);
  const sh = 100 / 13;
  const cw = 76, ch = 7 * sh;
  const sr = 1.9;

  const starPath = (cx: number, cy: number) => {
    const pts: string[] = [];
    const inner = sr * 0.4;
    for (let i = 0; i < 5; i++) {
      const a1 = (i * 72 - 90) * (Math.PI / 180);
      const a2 = (i * 72 + 36 - 90) * (Math.PI / 180);
      pts.push(`${cx + sr * Math.cos(a1)},${cy + sr * Math.sin(a1)}`);
      pts.push(`${cx + inner * Math.cos(a2)},${cy + inner * Math.sin(a2)}`);
    }
    return `M${pts.join('L')}Z`;
  };

  const stars: [number, number][] = [];
  const hStep = cw / 12, vStep = ch / 10;
  for (let row = 0; row < 9; row++) {
    const cols = row % 2 === 0 ? 6 : 5;
    const xStart = row % 2 === 0 ? hStep / 2 : hStep;
    const y = vStep / 2 + row * vStep;
    for (let col = 0; col < cols; col++) stars.push([xStart + col * hStep, y]);
  }

  return (
    <svg width={w} height={h} viewBox="0 0 190 100"
      style={{ display: 'inline-block', verticalAlign: 'middle', borderRadius: 2, border: '1px solid rgba(0,0,0,.12)' }}>
      {Array.from({ length: 13 }, (_, i) => (
        <rect key={i} x="0" y={i * sh} width="190" height={sh} fill={i % 2 === 0 ? '#B22234' : '#FFF'} />
      ))}
      <rect x="0" y="0" width={cw} height={ch} fill="#3C3B6E" />
      {stars.map(([cx, cy], i) => (
        <path key={i} d={starPath(cx, cy)} fill="#FFF" />
      ))}
    </svg>
  );
}

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
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <FlagUS size={18} /> EN
          </Button>
          <Button
            size="small"
            type={i18n.language.startsWith('ru') ? 'primary' : 'default'}
            onClick={(e) => { e.stopPropagation(); void i18n.changeLanguage('ru'); }}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <FlagRU size={18} /> RU
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
