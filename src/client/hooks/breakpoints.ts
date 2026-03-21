/** Ant Design breakpoints — mirrors Grid.useBreakpoint() thresholds.
 *  In components: import { Grid } from 'antd'; const screens = Grid.useBreakpoint();
 *    screens.xxl → ≥ 1600px (full desktop, Splitter)
 *    screens.xl  → ≥ 1200px (accordion off)
 *  In CSS: use these numbers for media query px values. */
export const BP_SM = 576; // screens.sm:  ≥ 576px
export const BP_MD = 768; // screens.md:  ≥ 768px
export const BP_LG = 992; // screens.lg:  ≥ 992px
export const BP_XL = 1200; // screens.xl:  ≥ 1200px → list view available
export const BP_XXL = 1600; // screens.xxl: ≥ 1600px → full desktop (Splitter visible)
