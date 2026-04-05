import { useEffect } from 'react';

// How far the finger must travel (raw px) before PTR takes over the gesture.
// Keeps accidental brushes and system-chrome swipes from activating PTR.
const ACTIVATE = 20; // px

// How far the finger must travel (raw px) before releasing triggers a refresh.
// At DAMPEN=0.5 this means the indicator must have slid to its maximum visible
// position before we consider the intent confirmed.
const THRESHOLD = 90; // px  (= indicator-height(~48px) / DAMPEN(0.5) ≈ 96px, round down)

// Indicator moves at half the speed of the finger (makes the motion feel "weighty").
const DAMPEN = 0.5;

/**
 * Adds pull-to-refresh on the accordion scroll container.
 *
 * Position model (simple):
 *   indicator: position:fixed; top:0   (starts hidden above viewport)
 *   hidden  → translateY(-height)      top edge at -height, fully off-screen
 *   visible → translateY(0)            top edge at 0, overlays AppHeader
 *                                      (same behaviour as native iOS/Android PTR)
 *
 * Pull travel:
 *   pull = min(delta * DAMPEN, height)
 *   transform = translateY(pull - height)
 *   At pull=0       → translateY(-height)  hidden
 *   At pull=height  → translateY(0)        fully visible
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

    // Set initial hidden position (translateY to -height).
    // We can't hard-code this in CSS because height is measured at runtime.
    const initHeight = indicator.offsetHeight || 48;
    indicator.style.transform = `translateY(${-initHeight}px)`;

    let startY = 0;
    let isPulling = false;
    let wasReady = false;

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
      indicator.style.transition = 'transform 0.4s ease, opacity 0.4s ease';
      // Return to hidden position: translateY(-height)
      const height = indicator.offsetHeight || 48;
      indicator.style.transform = `translateY(${-height}px)`;
      indicator.style.opacity = '0';
      isPulling = false;
      setTimeout(() => {
        setReady(false);
        if (arrow) arrow.style.transition = '';
        indicator.style.opacity = '';
      }, 420);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 1) return;
      startY = e.touches[0].clientY;
      isPulling = false;
      wasReady = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (window.scrollY > 1) {
        if (isPulling) snapBack();
        return;
      }
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) {
        if (isPulling) snapBack();
        return;
      }

      // ── Critical: prevent on the VERY FIRST downward touchmove ──────────
      // Chrome/Edge commit the touch sequence to "native scroll" if the first
      // touchmove doesn't call preventDefault(). After that, all subsequent
      // events become non-cancelable regardless of passive flags.
      // Calling preventDefault() here (before ACTIVATE) keeps the sequence
      // cancelable. We only do this when scrollTop=0 + delta>0 (overscroll zone),
      // so normal downward scrolling (scrollTop>1) and upward scrolling (delta≤0)
      // are never affected — the browser can still update its address/nav bars.
      if (e.cancelable) e.preventDefault();

      if (delta < ACTIVATE) return; // not far enough yet — gesture claimed but no visual

      isPulling = true;

      const height = indicator.offsetHeight || 48;

      // pull: how far the indicator has moved from its hidden position.
      // Capped at `height` — at that point the indicator is fully in view.
      const pull = Math.min(delta * DAMPEN, height);

      // translateY: -height (hidden above viewport) → 0 (fully visible at top)
      indicator.style.transition = 'none';
      indicator.style.transform = `translateY(${pull - height}px)`;

      // Opacity ramps 0 → 1 as indicator slides in
      indicator.style.opacity = Math.min(pull / height, 1).toFixed(2);

      const nowReady = delta >= THRESHOLD;
      if (nowReady !== wasReady) setReady(nowReady);
    };

    const onTouchEnd = () => {
      if (!isPulling) return;
      const shouldRefresh = wasReady;
      snapBack();
      if (shouldRefresh) onRefresh();
    };

    // touchstart: NON-passive so the browser marks subsequent touchmove events as
    // cancelable. We never call preventDefault() here — native scrolling and
    // browser chrome (Edge bottom bar, iOS swipe-back) are unaffected.
    // This is the critical flag: with passive:true, e.cancelable is always false
    // in touchmove and our preventDefault() calls are silently ignored.
    el.addEventListener('touchstart', onTouchStart, { passive: false });
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
