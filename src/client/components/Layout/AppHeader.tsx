import React, { useState } from 'react';
import { Layout, Typography, Button, Dropdown, App } from 'antd';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';
import { MoonOutlined, SunOutlined, UserOutlined, MenuOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import { DownloadsPanel } from './DownloadsPanel';
import { LogsPanel } from './LogsPanel';
import { TotpSetupModal } from './TotpSetupModal';
import { useUserMenuItems } from './UserMenu';
import { useUIStore } from '../../store/uiStore';
import { useChannels } from '../../api/channels';
import { useIsXxl } from '../../hooks/breakpoints';

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
}));

export function AppHeader() {
  const { selectedChannelId, isDarkTheme, toggleTheme, setSidebarDrawerOpen } = useUIStore();
  const { data: channels = [] } = useChannels();
  const { message } = App.useApp();
  const { t } = useTranslation();
  // ≥ 1600px → full desktop, no hamburger needed
  const sidebarInDrawer = !useIsXxl();
  const { styles } = useStyles(sidebarInDrawer);

  const selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null;
  const [totpModalOpen, setTotpModalOpen] = useState(false);

  const userMenuItems = useUserMenuItems({ message, onOpenTotp: () => setTotpModalOpen(true) });

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
