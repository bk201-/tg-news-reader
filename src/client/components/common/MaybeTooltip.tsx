import React from 'react';
import { Tooltip } from 'antd';
import type { TooltipProps } from 'antd';

/**
 * On coarse-pointer (touch) devices tooltips fire on every tap and block the UI.
 * This wrapper renders children directly on such devices, keeping the full
 * Tooltip behaviour on mouse-driven screens.
 *
 * Detection is done once at module load via matchMedia — pointer type never
 * changes at runtime, so no reactivity is needed.
 */
const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export function MaybeTooltip({ children, ...props }: TooltipProps) {
  if (isCoarsePointer) return <>{children}</>;
  return <Tooltip {...props}>{children}</Tooltip>;
}
