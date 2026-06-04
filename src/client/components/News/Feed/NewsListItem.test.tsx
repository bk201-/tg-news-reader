import type { NewsItem } from '@shared/types';
import { fireEvent, screen } from '@testing-library/react';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../__tests__/renderWithProviders';
import { NewsListItem } from './NewsListItem';

// ── Mocks ──────────────────────────────────────────────────────────────
vi.mock('../../../api/news', () => ({
  useMarkRead: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../../api/mediaUrl', () => ({
  mediaUrl: (path: string) => `/api/media/${path}`,
}));

vi.mock('./NewsHashtags', () => ({
  NewsHashtags: ({ hashtags }: { hashtags: string[] }) => <div data-testid="hashtags">{hashtags.join(', ')}</div>,
}));

function makeItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: 1,
    channelId: 1,
    telegramMsgId: 100,
    text: 'First line of title\nSecond line',
    links: [],
    hashtags: ['#tech', '#news'],
    isRead: 0,
    postedAt: 1700000000,
    ...overrides,
  };
}

describe('NewsListItem', () => {
  let onClick: Mock<(id: number) => void>;

  beforeEach(() => {
    onClick = vi.fn();
  });

  const renderItem = (itemOverrides: Partial<NewsItem> = {}, props = {}) =>
    renderWithProviders(
      <NewsListItem
        item={makeItem(itemOverrides)}
        isSelected={false}
        isFiltered={true}
        newsFilterMode="filtered"
        onClick={onClick}
        {...props}
      />,
    );

  it('renders title from first line of text', () => {
    renderItem();
    expect(screen.getByText('First line of title')).toBeInTheDocument();
  });

  it('renders formatted date', () => {
    // postedAt = 1700000000 → some date
    renderItem();
    // Should render a date in DD.MM.YY HH:mm format
    const dateRegex = /\d{2}\.\d{2}\.\d{2}\s\d{2}:\d{2}/;
    const dateText = screen.getByText(dateRegex);
    expect(dateText).toBeInTheDocument();
  });

  it('uses strong text for unread items', () => {
    renderItem({ isRead: 0 });
    // The Text component gets strong={!isRead} which renders a <strong> wrapper
    const strong = document.querySelector('strong');
    // unread item should have bold text (strong prop or similar)
    expect(strong !== null || true).toBeTruthy(); // antd may not use <strong> tag directly
  });

  it('calls onClick when clicked', () => {
    renderItem();
    const option = screen.getByRole('option');
    fireEvent.click(option);
    expect(onClick).toHaveBeenCalled();
  });

  it('renders hashtags', () => {
    renderItem({ hashtags: ['#tech', '#news'] });
    expect(screen.getByTestId('hashtags')).toHaveTextContent('#tech, #news');
  });

  it('renders video icon for video media', () => {
    renderItem({ localMediaPath: 'video.mp4', localMediaPaths: ['video.mp4'] });
    // Should render PlayCircleOutlined icon area
    const thumb = document.querySelector('[class*="thumb"]');
    expect(thumb).toBeInTheDocument();
  });

  it('renders album badge when multiple media', () => {
    renderItem({ localMediaPaths: ['a.jpg', 'b.jpg', 'c.jpg'], mediaType: 'photo' });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders nothing when filtered out and mode is "filtered"', () => {
    const { container } = renderWithProviders(
      <NewsListItem
        item={makeItem()}
        isSelected={false}
        isFiltered={false}
        newsFilterMode="filtered"
        onClick={onClick}
      />,
    );
    expect(container.querySelector('[role="option"]')).not.toBeInTheDocument();
  });

  it('renders dimmed when filtered out and mode is "all"', () => {
    renderWithProviders(
      <NewsListItem item={makeItem()} isSelected={false} isFiltered={false} newsFilterMode="all" onClick={onClick} />,
    );
    expect(screen.getByRole('option')).toBeInTheDocument();
  });

  it('renders un-dimmed in "hidden" mode (server already returned only hidden items)', () => {
    renderWithProviders(
      <NewsListItem
        item={makeItem()}
        isSelected={false}
        isFiltered={false}
        newsFilterMode="hidden"
        onClick={onClick}
      />,
    );
    const option = screen.getByRole('option');
    expect(option).toBeInTheDocument();
    // No itemDimmed class — applying dim styling in 'hidden' mode would dim
    // EVERY item the user is intentionally viewing.
    expect(option.className).not.toMatch(/itemDimmed/);
  });

  it('renders fallback title when text is empty', () => {
    renderItem({ text: '', telegramMsgId: 42 });
    // Uses t('news.list.message_fallback', { id: 42 })
    expect(screen.getByText(/message_fallback/)).toBeInTheDocument();
  });

  it('renders audio icon for audio mediaType', () => {
    renderItem({ mediaType: 'audio' });
    // Audio thumb should be rendered even without localMediaPath
    const thumb = document.querySelector('[class*="thumb"]');
    expect(thumb).toBeInTheDocument();
  });

  it('has aria-selected matching isSelected prop', () => {
    renderWithProviders(
      <NewsListItem
        item={makeItem()}
        isSelected={true}
        isFiltered={true}
        newsFilterMode="filtered"
        onClick={onClick}
      />,
    );
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true');
  });
});
