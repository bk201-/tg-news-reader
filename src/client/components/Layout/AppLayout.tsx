import React, { useEffect, useRef } from 'react';
import { Layout, Typography, theme, Button, Tooltip, Splitter } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { ChannelSidebar } from '../Channels/ChannelSidebar';
import { NewsFeed } from '../News/NewsFeed';
import { useUIStore } from '../../store/uiStore';
import { useChannels } from '../../api/channels';

const { Header } = Layout;
const { Title, Text } = Typography;

export function AppLayout() {
  const { selectedChannelId, setSelectedChannelId, isDarkTheme, toggleTheme } = useUIStore();
  const { data: channels = [] } = useChannels();
  const selectedChannel = channels.find((c) => c.id === selectedChannelId) || null;
  const { token } = theme.useToken();
  const initialized = useRef(false);

  // // Sync browser color-scheme and body background with theme
  // useEffect(() => {
  //   document.documentElement.style.colorScheme = isDarkTheme ? 'dark' : 'light';
  //   document.body.style.backgroundColor = token.colorBgBase;
  //   document.body.style.color = token.colorText;
  // }, [isDarkTheme, token.colorBgBase, token.colorText]);

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
        <div style={{ marginLeft: 'auto' }}>
          <Tooltip title={isDarkTheme ? 'Светлая тема' : 'Тёмная тема'}>
            <Button
              type="text"
              icon={isDarkTheme ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleTheme}
              style={{ color: '#fff' }}
            />
          </Tooltip>
        </div>
      </Header>

      <Splitter style={{ height: 'calc(100vh - 64px)' }}>
        <Splitter.Panel
          defaultSize={280}
          min={200}
          max={500}
          style={{ background: token.colorBgContainer, borderRight: `1px solid ${token.colorBorderSecondary}`, overflow: 'hidden' }}
        >
          <ChannelSidebar />
        </Splitter.Panel>

        <Splitter.Panel style={{ background: token.colorBgLayout, overflow: 'hidden' }}>
          {selectedChannel ? (
            <NewsFeed channel={selectedChannel} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16 }}>
              <span style={{ fontSize: 64 }}>📡</span>
              <Text type="secondary" style={{ fontSize: 16 }}>Выберите канал из списка слева</Text>
            </div>
          )}
        </Splitter.Panel>
      </Splitter>
    </Layout>
  );
}
