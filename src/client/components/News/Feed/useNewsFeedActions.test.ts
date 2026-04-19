import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import type { Channel, NewsItem } from '@shared/types';
import { renderHookWithProviders } from '../../../__tests__/renderWithProviders';

// ── Mocks ──────────────────────────────────────────────────────────────
const mockMarkAllReadMutate = vi.fn();
const mockMarkReadMutate = vi.fn();
const mockFetchChannelMutate = vi.fn();
const mockCreateFilterMutateAsync = vi.fn().mockResolvedValue({});
const mockMarkReadAndFetchMutate = vi.fn();

let mockMarkReadIsPending = false;

vi.mock('../../../api/news', () => ({
  useMarkAllRead: () => ({ mutate: mockMarkAllReadMutate }),
  useMarkRead: () => ({ mutate: mockMarkReadMutate, isPending: mockMarkReadIsPending }),
}));

vi.mock('../../../api/filters', () => ({
  useCreateFilter: () => ({ mutateAsync: mockCreateFilterMutateAsync }),
}));

const mockAllChannels: Channel[] = [];
vi.mock('../../../api/channels', () => ({
  useFetchChannel: () => ({ mutate: mockFetchChannelMutate }),
  useChannels: () => ({ data: mockAllChannels }),
  useMarkReadAndFetch: () => ({ mutate: mockMarkReadAndFetchMutate }),
}));

import { useNewsFeedActions } from './useNewsFeedActions';
import { useUIStore } from '../../../store/uiStore';

function makeItem(id: number, overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id,
    channelId: 1,
    telegramMsgId: id * 10,
    text: `item-${id}`,
    links: [],
    hashtags: [],
    isRead: 0,
    postedAt: 1700000000 + id,
    ...overrides,
  };
}

function makeChannel(id: number, overrides: Partial<Channel> = {}): Channel {
  return {
    id,
    telegramId: `ch${id}`,
    name: `Channel ${id}`,
    channelType: 'news',
    sortOrder: id,
    isUnavailable: 0,
    unreadCount: 5,
    totalNewsCount: 10,
    createdAt: 1700000000,
    supportsDigest: true,
    groupId: null,
    ...overrides,
  };
}

describe('useNewsFeedActions', () => {
  const channel = makeChannel(1);
  const setMediaProgressKey = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkReadIsPending = false;
    mockAllChannels.length = 0;
    mockAllChannels.push(makeChannel(1), makeChannel(2), makeChannel(3));
    useUIStore.setState({
      selectedNewsId: null,
      showAll: false,
      autoAdvance: false,
    });
  });

  const renderActions = (items: NewsItem[], unread = 5, filteredOut = 0) =>
    renderHookWithProviders(() => useNewsFeedActions(channel, items, unread, filteredOut, setMediaProgressKey));

  it('handleSpaceKey marks unread item as read and advances', () => {
    const items = [makeItem(1, { isRead: 0 }), makeItem(2, { isRead: 0 })];
    const { result } = renderActions(items);

    act(() => {
      result.current.handleSpaceKey(items[0]);
    });

    expect(mockMarkReadMutate).toHaveBeenCalledWith(
      { id: 1, isRead: 1, channelId: 1 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('handleSpaceKey on read item fetches when no next unread', () => {
    const items = [makeItem(1, { isRead: 1 })];
    const { result } = renderActions(items);

    act(() => {
      result.current.handleSpaceKey(items[0]);
    });

    expect(mockFetchChannelMutate).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('handleSpaceKey on read item advances to next unread', () => {
    const items = [makeItem(1, { isRead: 1 }), makeItem(2, { isRead: 0 })];
    const setSelectedNewsId = vi.fn();
    useUIStore.setState({ setSelectedNewsId });
    const { result } = renderActions(items);

    act(() => {
      result.current.handleSpaceKey(items[0]);
    });

    expect(setSelectedNewsId).toHaveBeenCalledWith(2);
  });

  it('handleMarkedRead selects next unread item', () => {
    const items = [makeItem(1, { isRead: 0 }), makeItem(2, { isRead: 0 }), makeItem(3, { isRead: 1 })];
    const setSelectedNewsId = vi.fn();
    useUIStore.setState({ setSelectedNewsId });
    const { result } = renderActions(items);

    act(() => {
      result.current.handleMarkedRead(1);
    });

    expect(setSelectedNewsId).toHaveBeenCalledWith(2);
  });

  it('handleTagClick addFilter creates a filter', async () => {
    const { result } = renderActions([]);

    await act(async () => {
      result.current.handleTagClick('#tech', 'addFilter');
    });

    expect(mockCreateFilterMutateAsync).toHaveBeenCalledWith({
      name: '#tech',
      type: 'tag',
      value: '#tech',
    });
  });

  it('goToNextChannel advances to next channel in same group', () => {
    const setSelectedChannelId = vi.fn();
    useUIStore.setState({ setSelectedChannelId });
    const { result } = renderActions([]);

    act(() => {
      result.current.goToNextChannel();
    });

    expect(setSelectedChannelId).toHaveBeenCalledWith(2);
  });

  it('goToNextChannel wraps around', () => {
    const ch3 = makeChannel(3);
    const setSelectedChannelId = vi.fn();
    useUIStore.setState({ setSelectedChannelId });
    const { result } = renderHookWithProviders(() => useNewsFeedActions(ch3, [], 0, 0, setMediaProgressKey));

    act(() => {
      result.current.goToNextChannel();
    });

    expect(setSelectedChannelId).toHaveBeenCalledWith(1);
  });

  it('handleMarkAllReadAndAdvance without autoAdvance just marks all read', () => {
    useUIStore.setState({ autoAdvance: false });
    const { result } = renderActions([]);

    act(() => {
      result.current.handleMarkAllReadAndAdvance();
    });

    expect(mockMarkAllReadMutate).toHaveBeenCalledWith({ channelId: 1 });
    expect(mockMarkReadAndFetchMutate).not.toHaveBeenCalled();
  });

  it('handleMarkAllReadAndAdvance with autoAdvance uses markReadAndFetch', () => {
    useUIStore.setState({ autoAdvance: true });
    const { result } = renderActions([]);

    act(() => {
      result.current.handleMarkAllReadAndAdvance();
    });

    expect(mockMarkReadAndFetchMutate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
