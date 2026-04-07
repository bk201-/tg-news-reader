import React from 'react';
import type { NewsFeedToolbarProps } from './newsFeedToolbarTypes';
import { NewsFeedToolbarDesktop } from './NewsFeedToolbarDesktop';
import { NewsFeedToolbarMobile } from './NewsFeedToolbarMobile';

export type { NewsFeedToolbarProps } from './newsFeedToolbarTypes';

export function NewsFeedToolbar(props: NewsFeedToolbarProps) {
  return props.isMobile ? <NewsFeedToolbarMobile {...props} /> : <NewsFeedToolbarDesktop {...props} />;
}
