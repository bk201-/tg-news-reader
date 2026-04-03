import { useEffect } from 'react';

const THRESHOLD = 72; // px raw delta to count as "intend to refresh"
const DAMPEN = 0.55; // pull distance multiplier (makes it feel springy)

/**
 * Adds pull-to-refresh on the accordion scroll container.
 *
 * Design:
 *  - Activates only when scrollTop === 0 (at the very top)
 *  - touchmove is registered as non-passive so we can call preventDefault()
 *    and prevent any residual browser behaviour; we only do so when actually pulling
 *  - Animates `indicatorRef` via direct style mutations (no React re-render)
 *  - Arrow icon rotates when pull distance crosses THRESHOLD
 *  - Text switches between pullText / releaseText via data-ptr-text attribute
 *  - On touchend: if pulled far enough → onRefresh(); always snap indicator back
 *
 * Only active when `enabled` (accordion / mobile mode).
 */
export function usePullToRefresh(
  scrollRef: React.RefObject<HTMLElement | null>,
  indicatorRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => void,
  enabled: boolean,
  pullText: string,
  releaseText: string,
): void {
  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    const indicator = indicatorRef.current;
    if (!el || !indicator) return;

    let startY = 0;
    let isPulling = false;
    let wasReady = false; // crossed threshold at some point during this pull

    const arrow = indicator.querySelector<HTMLElement>('[data-ptr-icon]');
    const text = indicator.querySelector<HTMLElement>('[data-ptr-text]');

    const setReady = (ready: boolean) => {
      wasReady = ready;
      if (arrow) {
        arrow.style.transition = 'transform 0.15s ease';
        arrow.style.transform = ready ? 'rotate(180deg)' : 'rotate(0deg)';
      }
      if (text) text.textContent = ready ? releaseText : pullText;
    };

    const snapBack = () => {
      indicator.style.transition = 'transform 0.25s ease';
      indicator.style.transform = 'translateY(-100%)';
      isPulling = false;
      rawDelta = 0;
      // Reset arrow/text after animation
      setTimeout(() => {
        setReady(false);
        if (arrow) arrow.style.transition = '';
      }, 260);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop > 0) return;
      startY = e.touches[0].clientY;
      isPulling = false;
      rawDelta = 0;
      wasReady = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (el.scrollTop > 0) {
        if (isPulling) snapBack();
        return;
      }
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) {
        if (isPulling) snapBack();
        return;
      }
      // Pulling down at scrollTop=0 — take over the gesture
      e.preventDefault();
      isPulling = true;

      const height = indicator.offsetHeight || 52;
      const pull = Math.min(delta * DAMPEN, height + 12); // dampen + cap

      indicator.style.transition = 'none';
      indicator.style.transform = `translateY(calc(-100% + ${pull}px))`;

      const nowReady = delta >= THRESHOLD;
      if (nowReady !== wasReady) setReady(nowReady);
    };

    const onTouchEnd = () => {
      if (!isPulling) return;
      const shouldRefresh = wasReady;
      snapBack();
      if (shouldRefresh) onRefresh();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false }); // non-passive for preventDefault
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [enabled, scrollRef, indicatorRef, onRefresh, pullText, releaseText]);
}
