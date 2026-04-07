import React from 'react';
import type { NewsFeedToolbarProps } from './newsFeedToolbarTypes';
import { NewsFeedToolbarDesktop } from './Desktop/NewsFeedToolbarDesktop';
import { NewsFeedToolbarMobile } from './Mobile/NewsFeedToolbarMobile';

export type { NewsFeedToolbarProps } from './newsFeedToolbarTypes';

export function NewsFeedToolbar(props: NewsFeedToolbarProps) {
  return props.isMobile ? <NewsFeedToolbarMobile {...props} /> : <NewsFeedToolbarDesktop {...props} />;
}
