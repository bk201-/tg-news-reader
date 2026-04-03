import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Drawer, Layout, Splitter, Typography } from 'antd';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import { ChannelSidebar } from '../Channels/ChannelSidebar';
import { GroupPanel } from '../Channels/GroupPanel';
import { NewsFeed } from '../News/NewsFeed';
import { DownloadsPinnedContent } from './DownloadsPinnedContent';
import { AppHeader } from './AppHeader';
import { TelegramSessionBanner } from './TelegramSessionBanner';
import { useUIStore } from '../../store/uiStore';
import { useChannels } from '../../api/channels';
import { BP_XXL, useIsXl, useMatchMedia } from '../../hooks/breakpoints';
import { useBossKey } from '../../hooks/useBossKey';

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
    flex: 1;
    min-height: 0;
  `,
  sidebarPanel: css`
    background: ${token.colorBgContainer};
    border-right: 1px solid ${token.colorBorderSecondary};
    overflow: hidden;
  `,
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
    height: 100vh;
    overflow: hidden;
  `,
  // ── Mobile-only: single scroll container ─────────────────────────────────
  // In accordion mode (< 1200px) the entire page — header, toolbar, news — lives
  // in ONE overflow-y:auto container. The browser handles scroll naturally:
  //   - AppHeader scrolls away (normal flow)
  //   - NewsFeedToolbar has position:sticky top:0 → sticks when header is off-screen
  //   - No JS needed for any of this
  mobileContainer: css`
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior-y: contain;
    background: ${token.colorBgLayout};
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

  // mobile scroll container ref — passed to NewsFeed for PTR and scroll-to-top
  const mobileContainerRef = useRef<HTMLDivElement>(null);

  // Boss key: Esc Esc to lock all PIN groups
  useBossKey();

  // < 1200px → accordion mode: single-scroll mobile layout
  const isAccordionMode = !useIsXl();
  // < 1600px → sidebar in Drawer (desktop only)
  const sidebarInDrawer = !useMatchMedia(`(min-width: ${BP_XXL}px)`);

  const [defaultSidebarWidth] = useState(() => parseInt(localStorage.getItem('sidebarWidth') ?? '280', 10));

  useEffect(() => {
    if (initialized.current || channels.length === 0) return;
    initialized.current = true;
    const id = parseInt(new URLSearchParams(window.location.search).get('channel') ?? '', 10);
    if (id && channels.some((c) => c.id === id)) setSelectedChannelId(id);
  }, [channels, setSelectedChannelId]);

  useEffect(() => {
    if (!initialized.current) return;
    if (selectedChannelId) {
      history.replaceState(null, '', `?channel=${selectedChannelId}${window.location.hash}`);
    } else {
      history.replaceState(null, '', window.location.pathname);
    }
  }, [selectedChannelId]);

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

  // ── Sidebar Drawer — shared between mobile and desktop ──────────────────
  const sidebarDrawer = (
    <Drawer
      open={sidebarInDrawer && sidebarDrawerOpen}
      onClose={() => setSidebarDrawerOpen(false)}
      placement="left"
      size="default"
      styles={{ body: { padding: 0, overflow: 'hidden', height: '100%' } }}
      title={null}
      closable={false}
    >
      {sidebarInDrawer && sidebarContent}
    </Drawer>
  );

  // ── MOBILE (< 1200px): single scroll container ──────────────────────────
  // AppHeader is in NORMAL FLOW — scrolls away naturally.
  // NewsFeedToolbar has position:sticky so it sticks when header is gone.
  // No JS needed for any header/toolbar behaviour.
  if (isAccordionMode) {
    return (
      <Layout className={styles.layout}>
        {sidebarDrawer}
        <div ref={mobileContainerRef} className={styles.mobileContainer}>
          <AppHeader />
          <TelegramSessionBanner />
          {selectedChannel ? (
            <NewsFeed channel={selectedChannel} mobileScrollContainerRef={mobileContainerRef} />
          ) : (
            emptyState
          )}
        </div>
      </Layout>
    );
  }

  // ── DESKTOP (≥ 1200px): Splitter layout ────────────────────────────────
  return (
    <Layout className={styles.layout}>
      <AppHeader />
      <TelegramSessionBanner />
      {sidebarDrawer}
      <Splitter
        className={styles.splitter}
        onResize={() => {}}
        onResizeEnd={(sizes) => {
          if (!sidebarInDrawer) localStorage.setItem('sidebarWidth', String(Math.round(sizes[0])));
        }}
      >
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
