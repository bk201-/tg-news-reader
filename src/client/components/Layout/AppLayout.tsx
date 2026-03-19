import React, { useEffect, useRef } from 'react';
import { Layout, Typography, theme, Splitter } from 'antd';
import { ChannelSidebar } from '../Channels/ChannelSidebar';
import { GroupPanel } from '../Channels/GroupPanel';
import { NewsFeed } from '../News/NewsFeed';
import { DownloadsPinnedContent } from './DownloadsPinnedContent';
import { AppHeader } from './AppHeader';
import { useUIStore } from '../../store/uiStore';
import { useChannels } from '../../api/channels';

const { Text } = Typography;

export function AppLayout() {
  const { selectedChannelId, setSelectedChannelId, downloadsPanelPinned } = useUIStore();
  const { data: channels = [] } = useChannels();
  const selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null;
  const { token } = theme.useToken();
  const initialized = useRef(false);

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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AppHeader />

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
    </Layout>
  );
}
