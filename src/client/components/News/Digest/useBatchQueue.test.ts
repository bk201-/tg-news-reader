import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBatchQueue } from './useBatchQueue';

describe('useBatchQueue', () => {
  it('initially enables the first maxParallel indices', () => {
    const { result } = renderHook(() => useBatchQueue(10, 5));
    expect([...result.current.enabled].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('enables only `count` when count < maxParallel', () => {
    const { result } = renderHook(() => useBatchQueue(2, 5));
    expect([...result.current.enabled].sort((a, b) => a - b)).toEqual([0, 1]);
  });

  it('advances the queue by one on release', () => {
    const { result } = renderHook(() => useBatchQueue(10, 5));
    act(() => result.current.release(0));
    expect(result.current.enabled.has(5)).toBe(true);
    expect(result.current.enabled.size).toBe(6); // 0,1,2,3,4,5
  });

  it('activates batches one by one as each releases', () => {
    const { result } = renderHook(() => useBatchQueue(8, 3));
    // initial: 0,1,2
    expect(result.current.enabled.size).toBe(3);

    act(() => result.current.release(0));
    expect(result.current.enabled.has(3)).toBe(true);

    act(() => result.current.release(1));
    expect(result.current.enabled.has(4)).toBe(true);

    act(() => result.current.release(2));
    expect(result.current.enabled.has(5)).toBe(true);

    act(() => result.current.release(3));
    expect(result.current.enabled.has(6)).toBe(true);

    act(() => result.current.release(4));
    expect(result.current.enabled.has(7)).toBe(true);

    // All 8 indices enabled now; further releases are a no-op
    act(() => result.current.release(5));
    expect(result.current.enabled.size).toBe(8);
  });

  it('does not exceed `count` when all batches release', () => {
    const { result } = renderHook(() => useBatchQueue(3, 5));
    expect(result.current.enabled.size).toBe(3);
    act(() => {
      result.current.release(0);
      result.current.release(1);
      result.current.release(2);
    });
    expect(result.current.enabled.size).toBe(3); // all already enabled, no growth
  });

  it('release on a failed batch still advances (queue does not stall)', () => {
    const { result } = renderHook(() => useBatchQueue(10, 2));
    // Initial: 0, 1
    act(() => result.current.release(0)); // batch 0 "failed" — still releases a slot
    expect(result.current.enabled.has(2)).toBe(true);
    act(() => result.current.release(1));
    expect(result.current.enabled.has(3)).toBe(true);
  });

  it('activate() force-enables an index (used for manual retry)', () => {
    const { result } = renderHook(() => useBatchQueue(10, 2));
    act(() => result.current.activate(9));
    expect(result.current.enabled.has(9)).toBe(true);
    expect(result.current.enabled.size).toBe(3); // 0, 1, 9
  });

  it('activate() is a no-op for already-enabled or out-of-range indices', () => {
    const { result } = renderHook(() => useBatchQueue(5, 3));
    const before = new Set(result.current.enabled);
    act(() => {
      result.current.activate(0); // already enabled
      result.current.activate(-1); // out of range
      result.current.activate(99); // out of range
    });
    expect([...result.current.enabled].sort((a, b) => a - b)).toEqual([...before].sort((a, b) => a - b));
  });

  it('reset() restores initial state', () => {
    const { result } = renderHook(() => useBatchQueue(6, 2));
    act(() => result.current.release(0));
    act(() => result.current.release(1));
    expect(result.current.enabled.size).toBe(4); // 0,1,2,3

    act(() => result.current.reset());
    expect([...result.current.enabled].sort((a, b) => a - b)).toEqual([0, 1]);

    // After reset, queue should advance again correctly
    act(() => result.current.release(0));
    expect(result.current.enabled.has(2)).toBe(true);
  });

  it('handles maxParallel = 0 (no batches ever start)', () => {
    const { result } = renderHook(() => useBatchQueue(5, 0));
    expect(result.current.enabled.size).toBe(0);
  });

  it('handles count = 0', () => {
    const { result } = renderHook(() => useBatchQueue(0, 5));
    expect(result.current.enabled.size).toBe(0);
  });
});
