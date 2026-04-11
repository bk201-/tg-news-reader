import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useUIStore.setState({
      selectedChannelId: null,
      selectedNewsId: null,
      selectedGroupId: null,
      showAll: false,
      filterPanelOpen: false,
      hashTagFilter: null,
      sidebarDrawerOpen: false,
      headerHidden: false,
      lightbox: null,
      openAddChannel: false,
    });
  });

  it('setSelectedChannelId clears selectedNewsId and hashTagFilter', () => {
    useUIStore.setState({ selectedNewsId: 42, hashTagFilter: '#test' });
    useUIStore.getState().setSelectedChannelId(10);

    const state = useUIStore.getState();
    expect(state.selectedChannelId).toBe(10);
    expect(state.selectedNewsId).toBeNull();
    expect(state.hashTagFilter).toBeNull();
  });

  it('setSelectedChannelId closes sidebar drawer', () => {
    useUIStore.setState({ sidebarDrawerOpen: true });
    useUIStore.getState().setSelectedChannelId(1);
    expect(useUIStore.getState().sidebarDrawerOpen).toBe(false);
  });

  it('setSelectedGroupId clears channel and news selection', () => {
    useUIStore.setState({ selectedChannelId: 5, selectedNewsId: 42 });
    useUIStore.getState().setSelectedGroupId(3);

    const state = useUIStore.getState();
    expect(state.selectedGroupId).toBe(3);
    expect(state.selectedChannelId).toBeNull();
    expect(state.selectedNewsId).toBeNull();
  });

  it('toggleTheme flips isDarkTheme and persists to localStorage', () => {
    const initial = useUIStore.getState().isDarkTheme;
    useUIStore.getState().toggleTheme();
    expect(useUIStore.getState().isDarkTheme).toBe(!initial);
    expect(localStorage.getItem('theme')).toBe(!initial ? 'dark' : 'light');
  });

  it('setNewsViewMode persists to localStorage', () => {
    useUIStore.getState().setNewsViewMode('accordion');
    expect(useUIStore.getState().newsViewMode).toBe('accordion');
    expect(localStorage.getItem('newsViewMode')).toBe('accordion');
  });

  it('toggleDownloadsPanelPin toggles and persists', () => {
    expect(useUIStore.getState().downloadsPanelPinned).toBe(false);
    useUIStore.getState().toggleDownloadsPanelPin();
    expect(useUIStore.getState().downloadsPanelPinned).toBe(true);
    expect(localStorage.getItem('downloadsPanelPinned')).toBe('true');
  });

  it('toggleAutoAdvance toggles and persists', () => {
    expect(useUIStore.getState().autoAdvance).toBe(false);
    useUIStore.getState().toggleAutoAdvance();
    expect(useUIStore.getState().autoAdvance).toBe(true);
    expect(localStorage.getItem('autoAdvance')).toBe('true');
  });

  it('openLightbox / closeLightbox / setLightboxAlbumIndex', () => {
    useUIStore.getState().openLightbox(1, 0, 10);
    expect(useUIStore.getState().lightbox).toEqual({ newsId: 1, albumIndex: 0, channelId: 10 });

    useUIStore.getState().setLightboxAlbumIndex(2);
    expect(useUIStore.getState().lightbox!.albumIndex).toBe(2);

    useUIStore.getState().closeLightbox();
    expect(useUIStore.getState().lightbox).toBeNull();
  });

  it('setLightboxAlbumIndex is no-op when lightbox is null', () => {
    useUIStore.getState().setLightboxAlbumIndex(5);
    expect(useUIStore.getState().lightbox).toBeNull();
  });
});
