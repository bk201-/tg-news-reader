import type { Channel, Group } from '@shared/types.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { ChannelItem } from './ChannelItem';

vi.mock('../../api/client', () => ({ api: { get: vi.fn() } }));
const channel: Channel = {
  id: 1,
  telegramId: 'test_channel',
  name: 'Test channel',
  description: '**Saved** description',
  channelType: 'news',
  groupId: null,
  sortOrder: 0,
  filterForwards: 0,
  isUnavailable: 0,
  unreadCount: 3,
  totalNewsCount: 10,
  createdAt: 1_700_000_000,
  supportsDigest: true,
};
const stats = { bytes: 1234, fileCount: 2, checkedAt: 1_700_000_000 };
let clients: QueryClient[] = [];

function setup(overrides: Partial<Channel> = {}, groups: Group[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  client.setQueryData(['groups'], groups);
  const props = {
    channel: { ...channel, ...overrides },
    isSelected: false,
    isFetchingThis: false,
    unreadCount: 3,
    onSelect: vi.fn(),
    onFetch: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <QueryClientProvider client={client}>
      <ChannelItem {...props} />
    </QueryClientProvider>,
  );
  return props;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockImplementation(async (path) => (path === '/groups' ? [] : stats));
  useAuthStore.setState({
    accessToken: 'signed-in',
    user: { id: 1, email: 'test@example.com', role: 'user' },
    unlockedGroupIds: [],
  });
});
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients = [];
});

describe('ChannelItem information popover', () => {
  it('loads storage only after hovering the info button and renders existing metadata', async () => {
    const user = userEvent.setup();
    const props = setup();
    expect(api.get).not.toHaveBeenCalled();
    await user.hover(screen.getByRole('button', { name: /channels.info.open/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/channels/1/storage'));
    expect(await screen.findByText(/channels.info.storage_bytes/)).toHaveTextContent('"bytes":"1,234"');
    expect(screen.getByText('Saved').tagName).toBe('STRONG');
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('channels.info.description_source')).toBeInTheDocument();
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('does not open details or load storage when hovering the channel row or its menu', async () => {
    vi.useFakeTimers();
    try {
      setup();
      fireEvent.mouseOver(screen.getByText(channel.name));
      act(() => vi.advanceTimersByTime(500));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      fireEvent.mouseOver(screen.getByRole('button', { name: 'channels.info.actions' }));
      act(() => vi.advanceTimersByTime(500));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(api.get).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens by explicit click on touch without selecting and closes explicitly', async () => {
    const props = setup();
    const infoButton = screen.getByRole('button', { name: /channels.info.open/ });
    fireEvent.touchStart(infoButton);
    fireEvent.touchEnd(infoButton);
    fireEvent.click(infoButton);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '@test_channel' }));
    expect(props.onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'channels.info.close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('displays large storage totals in readable units as well as exact bytes', async () => {
    vi.mocked(api.get).mockImplementation(async (path) =>
      path === '/groups' ? [] : { ...stats, bytes: 2.5 * 1024 ** 3 },
    );
    setup();
    fireEvent.click(screen.getByRole('button', { name: /channels.info.open/ }));
    expect(await screen.findByText('2.5 GB')).toBeInTheDocument();
    expect(screen.getByText(/channels.info.storage_bytes/)).toHaveTextContent('"bytes":"2,684,354,560"');
  });

  it('supports keyboard info activation and Escape while preserving row selection', async () => {
    const user = userEvent.setup();
    const props = setup();
    screen.getByRole('button', { name: /channels.info.open/ }).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(props.onSelect).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.keyboard(' ');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    screen.getByRole('button', { name: 'channels.info.close' }).focus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    screen.getByRole('option').focus();
    await user.keyboard('{Enter}');
    expect(props.onSelect).toHaveBeenCalledWith(1);
  });

  it('shows loading, failure, then real zero-byte success on retry', async () => {
    let reject!: (err: Error) => void;
    vi.mocked(api.get).mockImplementation((path) =>
      path === '/groups'
        ? Promise.resolve([])
        : new Promise((_resolve, fail) => {
            reject = fail;
          }),
    );
    setup({ description: '' });
    fireEvent.click(screen.getByRole('button', { name: /channels.info.open/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('channels.info.storage_loading');
    expect(screen.getByText('channels.info.no_description')).toBeInTheDocument();
    await act(async () => reject(new Error('disk offline')));
    expect(await screen.findByRole('alert')).toHaveTextContent('channels.info.storage_error');
    expect(screen.queryByText(/channels.info.storage_bytes/)).not.toBeInTheDocument();
    vi.mocked(api.get).mockResolvedValue({ bytes: 0, fileCount: 0, checkedAt: stats.checkedAt });
    fireEvent.click(screen.getByRole('button', { name: 'channels.info.retry' }));
    expect(await screen.findByText(/channels.info.storage_bytes/)).toHaveTextContent('"bytes":"0"');
  });

  it('hides details and never requests stats for a locked group', async () => {
    const group = { id: 5, name: 'Private', hasPIN: true, color: 'blue', sortOrder: 0, createdAt: 1 };
    vi.mocked(api.get).mockResolvedValue([group]);
    setup({ groupId: 5 }, [group]);
    fireEvent.click(screen.getByRole('button', { name: /channels.info.open/ }));
    expect(await screen.findByText('channels.info.locked')).toBeInTheDocument();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/channels/1/storage');
  });

  it('removes visible private details immediately on local re-lock', async () => {
    const group = { id: 5, name: 'Private', hasPIN: true, color: 'blue', sortOrder: 0, createdAt: 1 };
    vi.mocked(api.get).mockImplementation(async (path) => (path === '/groups' ? [group] : stats));
    useAuthStore.setState({ unlockedGroupIds: [5] });
    setup({ groupId: 5 }, [group]);
    fireEvent.click(screen.getByRole('button', { name: /channels.info.open/ }));
    expect(await screen.findByText(/channels.info.storage_bytes/)).toBeInTheDocument();
    act(() => useAuthStore.getState().lockGroupsLocally());
    expect(screen.getByText('channels.info.locked')).toBeInTheDocument();
    expect(screen.queryByText(/channels.info.storage_bytes/)).not.toBeInTheDocument();
  });

  it('preserves the channel action menu without selecting the row', async () => {
    const user = userEvent.setup();
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'channels.info.actions' }));
    await user.click(await screen.findByText('channels.edit_tooltip'));
    expect(props.onEdit).toHaveBeenCalledWith(channel);
    expect(props.onSelect).not.toHaveBeenCalled();
  });
});
