import React from 'react';
import type { NewsDetailToolbarProps } from './newsDetailToolbarTypes';
import { NewsDetailToolbarPanel } from './NewsDetailToolbarPanel';
import { NewsDetailToolbarInline } from './NewsDetailToolbarInline';

export type { NewsDetailToolbarProps } from './newsDetailToolbarTypes';

export function NewsDetailToolbar(props: NewsDetailToolbarProps) {
  return props.variant === 'inline' ? <NewsDetailToolbarInline {...props} /> : <NewsDetailToolbarPanel {...props} />;
}
