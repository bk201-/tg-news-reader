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
  // NewsListItem handles the filter/showAll visibility itself, but we need to
  // guard here so the expanded body is also not rendered for filtered-out items.
  if (!isFiltered && !showAll) return null;

  return (
    <div className={`accordion-item${isSelected ? ' accordion-item--expanded' : ''}`}>
      <NewsListItem
        item={item}
        isSelected={isSelected}
        isFiltered={isFiltered}
        showAll={showAll}
        onClick={() => onSelect(isSelected ? null : item.id)}
        onTagClick={onTagClick}
      />
      {isSelected && (
        <div className="accordion-item__body">
          <NewsDetail
            key={item.id}
            item={item}
            channelType={channelType}
            onMarkedRead={onMarkedRead}
            variant="inline"
          />
        </div>
      )}
    </div>
  );
}

