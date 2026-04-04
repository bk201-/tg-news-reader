import { useEffect } from 'react';
import { MOBILE_TOOLBAR_HEIGHT } from './breakpoints';

const THRESHOLD = 60; // px raw delta — release to refresh
const ACTIVATE = 12; // px raw delta before PTR takes over (lets browser handle small gestures)
const DAMPEN = 0.5; // pull distance multiplier

/**
 * Adds pull-to-refresh on the accordion scroll container.
 *
 * Design:
 *  - Activates only when scrollTop === 0 (at the very top)
 *  - touchstart is NON-passive so the browser treats subsequent touchmove
 *    events as cancelable; without this, iOS / Chrome mark touchmove as
 *    non-cancelable once they start a scroll, breaking preventDefault()
 *  - touchmove calls preventDefault() when we take over the gesture, which
 *    prevents the native rubber-band / overscroll from moving the content
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
      indicator.style.transition = 'transform 0.5s ease, opacity 0.5s ease';
      indicator.style.transform = 'translateY(-100%)';
      indicator.style.opacity = '0';
      isPulling = false;
      // Reset arrow/text after animation
      setTimeout(() => {
        setReady(false);
        if (arrow) arrow.style.transition = '';
        indicator.style.opacity = '';
      }, 520);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop > 1) return; // tolerance for sub-pixel scrollTop values
      startY = e.touches[0].clientY;
      isPulling = false;
      wasReady = false;
      // Don't preventDefault here — we only take over in touchmove when delta > 0
    };

    const onTouchMove = (e: TouchEvent) => {
      if (el.scrollTop > 1) {
        if (isPulling) snapBack();
        return;
      }
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) {
        if (isPulling) snapBack();
        return;
      }
      // Wait until finger moved at least ACTIVATE px before taking over.
      // This lets the browser handle short downward flicks (e.g. show system nav bar)
      // without PTR interfering.
      if (delta < ACTIVATE) return;
      // Pulling down at scrollTop=0 — take over the gesture.
      // e.cancelable is true because touchstart was registered as non-passive.
      if (e.cancelable) e.preventDefault();
      isPulling = true;

      const height = indicator.offsetHeight || 52;
      // Cap pull at full indicator height so it's fully visible, with toolbar offset
      const maxPull = height + MOBILE_TOOLBAR_HEIGHT;
      const pull = Math.min(delta * DAMPEN, maxPull);

      // Fade in smoothly: opacity ramps from 0 → 1 over the first 70% of travel
      const opacity = Math.min(pull / (height * 0.7), 1).toFixed(2);

      indicator.style.transition = 'none';
      indicator.style.opacity = opacity;
      // Offset by toolbar height so indicator appears below sticky toolbar
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

    // touchstart stays PASSIVE so the browser can freely handle native gestures
    // (scroll-to-reveal address bar, system bars, etc.). preventDefault() is called
    // in touchmove only when cancelable — overscroll-behavior:contain on the scroll
    // container already suppresses native rubber-band on modern browsers.
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
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
