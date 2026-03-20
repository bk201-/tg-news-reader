import React from 'react';
import type { NewsItem, ChannelType } from '@shared/types.ts';
import { NewsListItem } from './NewsListItem';
import { NewsDetail } from './NewsDetail';

interface NewsAccordionItemProps {
  item: NewsItem;
  isSelected: boolean;
  isFiltered: boolean;
  showAll: boolean;
  channelType: ChannelType;
  onSelect: (id: number | null) => void;
  onTagClick: (tag: string, action: 'show' | 'addFilter') => void;
  onMarkedRead: (id: number) => void;
}

export function NewsAccordionItem({
  item,
  isSelected,
  isFiltered,
  showAll,
  channelType,
  onSelect,
  onTagClick,
  onMarkedRead,
}: NewsAccordionItemProps) {
  if (!isFiltered && !showAll) return null;

  const dimmed = !isFiltered && showAll;

  return (
    <div
      data-news-id={item.id}
      className={`accordion-item${isSelected ? ' accordion-item--expanded' : ''}${dimmed ? ' accordion-item--dimmed' : ''}`}
    >
      {isSelected ? (
        <NewsDetail
          key={item.id}
          item={item}
          channelType={channelType}
          onMarkedRead={onMarkedRead}
          variant="inline"
          onHeaderClick={() => onSelect(null)}
        />
      ) : (
        <NewsListItem
          item={item}
          isSelected={false}
          isFiltered={isFiltered}
          showAll={showAll}
          onClick={() => onSelect(item.id)}
          onTagClick={onTagClick}
        />
      )}
    </div>
  );
}
