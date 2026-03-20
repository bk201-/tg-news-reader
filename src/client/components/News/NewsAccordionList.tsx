import React from 'react';
import { Spin, Empty } from 'antd';
import { useTranslation } from 'react-i18next';
import type { NewsItem, ChannelType } from '@shared/types.ts';
import { NewsAccordionItem } from './NewsAccordionItem';

interface NewsAccordionListProps {
  isLoading: boolean;
  items: NewsItem[];
  filteredIds: Set<number>;
  showAll: boolean;
  selectedNewsId: number | null;
  hashTagFilter: string | null;
  activeFilterCount: number;
  channelType: ChannelType;
  onSelect: (id: number | null) => void;
  onTagClick: (tag: string, action: 'show' | 'addFilter') => void;
  onMarkedRead: (id: number) => void;
  listRef: React.RefObject<HTMLDivElement | null>;
}

export function NewsAccordionList({
  isLoading,
  items,
  filteredIds,
  showAll,
  selectedNewsId,
  hashTagFilter,
  activeFilterCount,
  channelType,
  onSelect,
  onTagClick,
  onMarkedRead,
  listRef,
}: NewsAccordionListProps) {
  const { t } = useTranslation();

  const emptyDescription = hashTagFilter
    ? t('news.list.empty_tag', { tag: hashTagFilter })
    : activeFilterCount > 0
      ? t('news.list.empty_filtered')
      : t('news.list.empty');

  return (
    <div className="news-feed__accordion" ref={listRef}>
      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spin size="large" />
        </div>
      )}
      {!isLoading && items.length === 0 && <Empty description={emptyDescription} style={{ marginTop: 48 }} />}
      {items.map((item) => (
        <NewsAccordionItem
          key={item.id}
          item={item}
          isSelected={selectedNewsId === item.id}
          isFiltered={filteredIds.has(item.id)}
          showAll={showAll}
          channelType={channelType}
          onSelect={onSelect}
          onTagClick={onTagClick}
          onMarkedRead={onMarkedRead}
        />
      ))}
    </div>
  );
}
