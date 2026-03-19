import React from 'react';
import { Spin, Empty } from 'antd';
import type { NewsItem } from '@shared/types.ts';
import { NewsListItem } from './NewsListItem';

interface NewsFeedListProps {
  isLoading: boolean;
  items: NewsItem[];
  filteredIds: Set<number>;
  showAll: boolean;
  selectedNewsId: number | null;
  hashTagFilter: string | null;
  activeFilterCount: number;
  onSelect: (id: number) => void;
  onTagClick: (tag: string, action: 'show' | 'addFilter') => void;
  listRef: React.RefObject<HTMLDivElement>;
}

export function NewsFeedList({
  isLoading,
  items,
  filteredIds,
  showAll,
  selectedNewsId,
  hashTagFilter,
  activeFilterCount,
  onSelect,
  onTagClick,
  listRef,
}: NewsFeedListProps) {
  const emptyDescription = hashTagFilter
    ? `Нет новостей с тегом ${hashTagFilter}`
    : activeFilterCount > 0
      ? 'Нет новостей, соответствующих фильтрам. Нажмите "Показать все".'
      : 'Нет новостей. Нажмите "Выгрузить".';

  return (
    <div className="news-feed__list" ref={listRef}>
      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spin size="large" />
        </div>
      )}
      {!isLoading && items.length === 0 && <Empty description={emptyDescription} style={{ marginTop: 48 }} />}
      {items.map((item) => (
        <NewsListItem
          key={item.id}
          item={item}
          isSelected={selectedNewsId === item.id}
          isFiltered={filteredIds.has(item.id)}
          showAll={showAll}
          onClick={() => onSelect(item.id)}
          onTagClick={onTagClick}
        />
      ))}
    </div>
  );
}
