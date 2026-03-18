import { create } from 'zustand';

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
  pendingCounts: {},
  setPendingCounts: (counts) => set({ pendingCounts: counts }),
  clearPendingCount: (channelId) =>
    set((state) => {
      const next = { ...state.pendingCounts };
      delete next[channelId];
      return { pendingCounts: next };
    }),
}));
