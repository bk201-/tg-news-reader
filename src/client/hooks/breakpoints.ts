import { useState, useEffect } from 'react';

/** Ant Design breakpoints — mirrors Grid.useBreakpoint() thresholds.
 *  In CSS: use these numbers for media query px values. */
export const BP_SM = 576; // screens.sm:  ≥ 576px
export const BP_MD = 768; // screens.md:  ≥ 768px
export const BP_LG = 992; // screens.lg:  ≥ 992px
export const BP_XL = 1200; // screens.xl:  ≥ 1200px → list view available
export const BP_XXL = 1600; // screens.xxl: ≥ 1600px → full desktop (Splitter visible)

/**
 * Subscribes to a single CSS media query and returns whether it currently matches.
 * More efficient than Grid.useBreakpoint() — only fires on the exact query crossing,
 * not on every Ant Design breakpoint transition.
 *
 * @example
 *   const isXxl = useMatchMedia(`(min-width: ${BP_XXL}px)`);
 */
export function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

/** ≥ 768px (md) — touch vs pointer, SortModal drag */
export const useIsMd = () => useMatchMedia(`(min-width: ${BP_MD}px)`);
/** ≥ 1200px (xl) — list view available, below forces accordion */
export const useIsXl = () => useMatchMedia(`(min-width: ${BP_XL}px)`);
/** ≥ 1600px (xxl) — full desktop: inline sidebar, pin downloads panel */
export const useIsXxl = () => useMatchMedia(`(min-width: ${BP_XXL}px)`);
