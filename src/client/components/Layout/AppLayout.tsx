import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Layout, Typography, Splitter, Drawer } from 'antd';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import { ChannelSidebar } from '../Channels/ChannelSidebar';
import { GroupPanel } from '../Channels/GroupPanel';
import { NewsFeed } from '../News/NewsFeed';
import { DownloadsPinnedContent } from './DownloadsPinnedContent';
import { AppHeader } from './AppHeader';
import { useUIStore } from '../../store/uiStore';
import { useChannels } from '../../api/channels';
import { useMatchMedia, BP_XXL } from '../../hooks/breakpoints';

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
  splitter: css`
    height: calc(100vh - 64px);
  `,
  sidebarPanel: css`
    background: ${token.colorBgContainer};
    border-right: 1px solid ${token.colorBorderSecondary};
    overflow: hidden;
  `,
  // When sidebarInDrawer: collapse sidebar panel to 0 and hide its border
  sidebarPanelHidden: css`
    overflow: hidden;
    border-right: none !important;
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
  const { styles, cx } = useStyles();
  const initialized = useRef(false);

  // Targeted: only fires when crossing the 1600 px threshold, not on every AntD breakpoint.
  const sidebarInDrawer = !useMatchMedia(`(min-width: ${BP_XXL}px)`);

  // Read localStorage once on mount — Splitter treats defaultSize as a one-time value.
  // useState lazy initializer avoids re-reading on every render and is safe to use in JSX.
  const [defaultSidebarWidth] = useState(() => parseInt(localStorage.getItem('sidebarWidth') ?? '280', 10));

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

  // Memoized: GroupPanel / ChannelSidebar receive no props from AppLayout,
  // so this JSX only needs to change when the theme changes (styles).
  const sidebarContent = useMemo(
    () => (
      <div className={styles.sidebarWrap}>
        <GroupPanel />
        <div className={styles.sidebarInner}>
          <ChannelSidebar />
        </div>
      </div>
    ),
    [styles],
  );

  const emptyState = useMemo(
    () => (
      <div className={styles.emptyState}>
        <span className={styles.emptyEmoji}>📡</span>
        <Text type="secondary" className={styles.emptyText}>
          {t('sidebar.select_channel')}
        </Text>
      </div>
    ),
    [styles, t],
  );

  // Single return: NewsFeed is always at the same tree position (Splitter.Panel[1] → contentMain),
  // so it never remounts when sidebarInDrawer changes (breakpoint crossing or drawer toggle).
  // On mobile: sidebar panel collapses to size=0, content moves to Drawer.
  return (
    <Layout className={styles.layout}>
      <AppHeader />

      {/* Sidebar Drawer — only opens on mobile */}
      <Drawer
        open={sidebarInDrawer && sidebarDrawerOpen}
        onClose={() => setSidebarDrawerOpen(false)}
        placement="left"
        size="default"
        styles={{ body: { padding: 0, overflow: 'hidden', height: '100%' } }}
        title={null}
        closable={false}
      >
        {/* Only render when in-drawer mode: prevents double-mount when the user
            resizes from mobile→desktop after opening the drawer at least once.
            Ant Design keeps Drawer children alive after close (destroyOnClose=false
            by default), so without this guard GroupPanel+ChannelSidebar would be
            mounted in both the Drawer and the Splitter panel simultaneously. */}
        {sidebarInDrawer && sidebarContent}
      </Drawer>

      <Splitter
        className={styles.splitter}
        onResizeEnd={(sizes) => {
          // Only persist when sidebar is visible (not collapsed to 0)
          if (!sidebarInDrawer) localStorage.setItem('sidebarWidth', String(Math.round(sizes[0])));
        }}
      >
        {/* Sidebar panel: visible + resizable on desktop, collapsed to 0 on mobile */}
        <Splitter.Panel
          defaultSize={defaultSidebarWidth}
          min={sidebarInDrawer ? 0 : 200}
          max={sidebarInDrawer ? 0 : 500}
          size={sidebarInDrawer ? 0 : undefined}
          resizable={!sidebarInDrawer}
          className={cx(styles.sidebarPanel, sidebarInDrawer && styles.sidebarPanelHidden)}
        >
          {!sidebarInDrawer && sidebarContent}
        </Splitter.Panel>

        {/* Content panel: NewsFeed always here — stable tree position → no remount */}
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
