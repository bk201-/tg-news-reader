import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNewsFeedHotkeys } from './useNewsFeedHotkeys';

function fireKey(code: string, opts: Partial<KeyboardEvent> = {}) {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...opts });
  document.body.dispatchEvent(event);
}

function fireKeyWithTarget(code: string, target: HTMLElement) {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
}

describe('useNewsFeedHotkeys', () => {
  let onFetch: ReturnType<typeof vi.fn>;
  let onToggleShowAll: ReturnType<typeof vi.fn>;
  let onMarkAllRead: ReturnType<typeof vi.fn>;
  let onOpenFilters: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onFetch = vi.fn();
    onToggleShowAll = vi.fn();
    onMarkAllRead = vi.fn();
    onOpenFilters = vi.fn();
  });

  const renderIt = () =>
    renderHook(() => useNewsFeedHotkeys({ onFetch, onToggleShowAll, onMarkAllRead, onOpenFilters }));

  it('U key calls onFetch', () => {
    renderIt();
    fireKey('KeyU');
    expect(onFetch).toHaveBeenCalled();
  });

  it('A key calls onToggleShowAll', () => {
    renderIt();
    fireKey('KeyA');
    expect(onToggleShowAll).toHaveBeenCalled();
  });

  it('M key calls onMarkAllRead', () => {
    renderIt();
    fireKey('KeyM');
    expect(onMarkAllRead).toHaveBeenCalled();
  });

  it('P key calls onOpenFilters', () => {
    renderIt();
    fireKey('KeyP');
    expect(onOpenFilters).toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    renderIt();
    fireKey('KeyX');
    expect(onFetch).not.toHaveBeenCalled();
    expect(onToggleShowAll).not.toHaveBeenCalled();
    expect(onMarkAllRead).not.toHaveBeenCalled();
    expect(onOpenFilters).not.toHaveBeenCalled();
  });

  // Modifier guards
  it('ignores metaKey', () => {
    renderIt();
    fireKey('KeyU', { metaKey: true });
    expect(onFetch).not.toHaveBeenCalled();
  });

  it('ignores ctrlKey', () => {
    renderIt();
    fireKey('KeyU', { ctrlKey: true });
    expect(onFetch).not.toHaveBeenCalled();
  });

  it('ignores altKey', () => {
    renderIt();
    fireKey('KeyU', { altKey: true });
    expect(onFetch).not.toHaveBeenCalled();
  });

  // Input element guards
  it('ignores events from input', () => {
    renderIt();
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireKeyWithTarget('KeyU', input);
    document.body.removeChild(input);
    expect(onFetch).not.toHaveBeenCalled();
  });

  it('ignores events from textarea', () => {
    renderIt();
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    fireKeyWithTarget('KeyU', textarea);
    document.body.removeChild(textarea);
    expect(onFetch).not.toHaveBeenCalled();
  });

  it('ignores events from contentEditable', () => {
    renderIt();
    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    fireKeyWithTarget('KeyU', div);
    document.body.removeChild(div);
    expect(onFetch).not.toHaveBeenCalled();
  });
});
