import React, { useEffect, useRef } from 'react';
import { Layout, Typography, Splitter, Drawer, Grid } from 'antd';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import { ChannelSidebar } from '../Channels/ChannelSidebar';
import { GroupPanel } from '../Channels/GroupPanel';
import { NewsFeed } from '../News/NewsFeed';
import { DownloadsPinnedContent } from './DownloadsPinnedContent';
import { AppHeader } from './AppHeader';
import { useUIStore } from '../../store/uiStore';
import { useChannels } from '../../api/channels';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  sidebarWrap: css`
    display: flex;
    height: 100%;
  `,
  sidebarInner: css`
    flex: 1;
    min-width: 0;
    border-left: 1px solid ${token.colorBorderSecondary};
    overflow: hidden;
  `,
  emptyState: css`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    flex-direction: column;
    gap: 16px;
  `,
  emptyEmoji: css`
    font-size: 64px;
  `,
  emptyText: css`
    font-size: 16px;
  `,
  mobileContent: css`
    height: calc(100vh - 64px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: ${token.colorBgLayout};
  `,
  splitter: css`
    height: calc(100vh - 64px);
  `,
  sidebarPanel: css`
    background: ${token.colorBgContainer};
    border-right: 1px solid ${token.colorBorderSecondary};
    overflow: hidden;
  `,
  contentPanel: css`
    background: ${token.colorBgLayout};
    overflow: hidden;
  `,
  contentFlex: css`
    display: flex;
    height: 100%;
    overflow: hidden;
  `,
  contentMain: css`
    flex: 1;
    min-width: 0;
    overflow: hidden;
  `,
  layout: css`
    min-height: 100vh;
  `,
}));

export function AppLayout() {
  const { selectedChannelId, setSelectedChannelId, downloadsPanelPinned, sidebarDrawerOpen, setSidebarDrawerOpen } =
    useUIStore();
  const { data: channels = [] } = useChannels();
  const selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null;
  const { t } = useTranslation();
  const { styles } = useStyles();
  const initialized = useRef(false);
  const screens = Grid.useBreakpoint();

  // screens.xxl = true when ≥ 1600px → full desktop with Splitter
  // !screens.xxl → sidebar hidden in Drawer (< 1600px)
  const sidebarInDrawer = !screens.xxl;

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

  const sidebarContent = (
    <div className={styles.sidebarWrap}>
      <GroupPanel />
      <div className={styles.sidebarInner}>
        <ChannelSidebar />
      </div>
    </div>
  );

  const emptyState = (
    <div className={styles.emptyState}>
      <span className={styles.emptyEmoji}>📡</span>
      <Text type="secondary" className={styles.emptyText}>
        {t('sidebar.select_channel')}
      </Text>
    </div>
  );

  if (sidebarInDrawer) {
    return (
      <Layout className={styles.layout}>
        <AppHeader />
        <Drawer
          open={sidebarDrawerOpen}
          onClose={() => setSidebarDrawerOpen(false)}
          placement="left"
          size="default"
          styles={{ body: { padding: 0, overflow: 'hidden', height: '100%' } }}
          title={null}
          closable={false}
        >
          {sidebarContent}
        </Drawer>
        <Layout.Content className={styles.mobileContent}>
          {selectedChannel ? <NewsFeed channel={selectedChannel} /> : emptyState}
        </Layout.Content>
      </Layout>
    );
  }

  return (
    <Layout className={styles.layout}>
      <AppHeader />

      <Splitter
        className={styles.splitter}
        onResizeEnd={(sizes) => localStorage.setItem('sidebarWidth', String(Math.round(sizes[0])))}
      >
        <Splitter.Panel
          defaultSize={parseInt(localStorage.getItem('sidebarWidth') ?? '280', 10)}
          min={200}
          max={500}
          className={styles.sidebarPanel}
        >
          {sidebarContent}
        </Splitter.Panel>

        <Splitter.Panel className={styles.contentPanel}>
          <div className={styles.contentFlex}>
            <div className={styles.contentMain}>
              {selectedChannel ? <NewsFeed channel={selectedChannel} /> : emptyState}
            </div>
            {downloadsPanelPinned && <DownloadsPinnedContent />}
          </div>
        </Splitter.Panel>
      </Splitter>
    </Layout>
  );
}
