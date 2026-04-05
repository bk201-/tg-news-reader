import { useEffect } from 'react';

// How far the finger must travel (raw px) before PTR takes over the gesture.
// Keeps accidental brushes and system-chrome swipes from activating PTR.
// 40px (was 20px) — a quick tap-and-flick often has an initial downward bounce
// of 20-30px before the upward motion starts; 40px avoids false triggers.
const ACTIVATE = 40; // px

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
    // True until the gesture goes upward (delta <= 0) for the first time.
    // PTR must not activate if the user changed direction — that means it's a
    // scroll gesture that started with a small downward bounce, not a real pull.
    let gestureDownward = true;

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
      gestureDownward = true; // reset: new gesture starts fresh
    };

    const onTouchMove = (e: TouchEvent) => {
      if (window.scrollY > 1) {
        if (isPulling) snapBack();
        return;
      }
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) {
        gestureDownward = false; // gesture went upward — not a PTR pull
        if (isPulling) snapBack();
        return;
      }

      // Don't intercept until the finger has travelled ACTIVATE px AND the
      // gesture has been purely downward the whole time.
      // `!gestureDownward` catches the common case of a scroll flick that starts
      // with a small downward bounce (≥ ACTIVATE px) before moving upward —
      // without this check, the bounce triggers PTR and blocks the scroll.
      if (delta < ACTIVATE || !gestureDownward) return;

      if (e.cancelable) e.preventDefault();

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

    // touchstart: PASSIVE — we never call preventDefault() here, so signalling
    // passive:true lets Chrome start scrolling immediately without waiting for
    // our handler to complete. With passive:false Chrome serialises the whole
    // touch sequence and the user's quick flick can be dropped before Chrome
    // even commits to scrolling (manifests as "every other scroll working").
    // touchmove remains non-passive so our conditional preventDefault() (called
    // only after the ACTIVATE threshold) is still honoured there.
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
