import { create } from 'zustand';

export type NewsViewMode = 'list' | 'accordion';

interface UIStore {
  selectedChannelId: number | null;
  setSelectedChannelId: (id: number | null) => void;
  selectedNewsId: number | null;
  setSelectedNewsId: (id: number | null) => void;
  // null = "Общее" (ungrouped channels), number = specific group id
  selectedGroupId: number | null;
  setSelectedGroupId: (id: number | null) => void;
  showAll: boolean;
  setShowAll: (v: boolean) => void;
  filterPanelOpen: boolean;
  setFilterPanelOpen: (v: boolean) => void;
  hashTagFilter: string | null;
  setHashTagFilter: (tag: string | null) => void;
  isDarkTheme: boolean;
  toggleTheme: () => void;
  // Downloads panel — when pinned, renders as inline sidebar next to news feed
  downloadsPanelPinned: boolean;
  toggleDownloadsPanelPin: () => void;
  // News view mode: 2-pane list or accordion
  newsViewMode: NewsViewMode;
  setNewsViewMode: (mode: NewsViewMode) => void;
  // Pending counts from Telegram (messages not yet fetched, per channel)
  pendingCounts: Record<number, number>;
  setPendingCounts: (counts: Record<number, number>) => void;
  clearPendingCount: (channelId: number) => void;
}

export const useUIStore = create<UIStore>()((set) => ({
  selectedChannelId: null,
  setSelectedChannelId: (id) => set({ selectedChannelId: id, selectedNewsId: null, hashTagFilter: null }),
  selectedNewsId: null,
  setSelectedNewsId: (id) => set({ selectedNewsId: id }),
  selectedGroupId: null,
  setSelectedGroupId: (id) => set({ selectedGroupId: id, selectedChannelId: null, selectedNewsId: null }),
  showAll: false,
  setShowAll: (v) => set({ showAll: v }),
  filterPanelOpen: false,
  setFilterPanelOpen: (v) => set({ filterPanelOpen: v }),
  hashTagFilter: null,
  setHashTagFilter: (tag) => set({ hashTagFilter: tag }),
  isDarkTheme: localStorage.getItem('theme') === 'dark',
  toggleTheme: () =>
    set((state) => {
      const next = !state.isDarkTheme;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return { isDarkTheme: next };
    }),
  downloadsPanelPinned: localStorage.getItem('downloadsPanelPinned') === 'true',
  toggleDownloadsPanelPin: () =>
    set((state) => {
      const next = !state.downloadsPanelPinned;
      localStorage.setItem('downloadsPanelPinned', String(next));
      return { downloadsPanelPinned: next };
    }),
  newsViewMode: (localStorage.getItem('newsViewMode') as NewsViewMode) || 'list',
  setNewsViewMode: (mode) => {
    localStorage.setItem('newsViewMode', mode);
    set({ newsViewMode: mode });
  },
  pendingCounts: {},
  setPendingCounts: (counts) => set({ pendingCounts: counts }),
  clearPendingCount: (channelId) =>
    set((state) => {
      const next = { ...state.pendingCounts };
      delete next[channelId];
      return { pendingCounts: next };
    }),
}));
