import React, { useCallback } from 'react';
import { Spin, Empty } from 'antd';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { NewsItem } from '@shared/types.ts';
import { NewsListItem } from './NewsListItem';

const useStyles = createStyles(({ css, token }) => ({
  list: css`
    width: 380px;
    min-width: 280px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: ${token.colorBgContainer};
    border-right: 1px solid ${token.colorBorderSecondary};
  `,
  virtuoso: css`
    flex: 1;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  `,
  loadingWrap: css`
    display: flex;
    justify-content: center;
    padding: 32px;
  `,
  empty: css`
    margin-top: 48px;
  `,
}));

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
  virtuosoRef: React.RefObject<VirtuosoHandle | null>;
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
  virtuosoRef,
}: NewsFeedListProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  const renderItem = useCallback(
    (_: number, item: NewsItem) => (
      <NewsListItem
        item={item}
        isSelected={selectedNewsId === item.id}
        isFiltered={filteredIds.has(item.id)}
        showAll={showAll}
        onClick={() => onSelect(item.id)}
        onTagClick={onTagClick}
      />
    ),
    [selectedNewsId, filteredIds, showAll, onSelect, onTagClick],
  );

  const emptyDescription = hashTagFilter
    ? t('news.list.empty_tag', { tag: hashTagFilter })
    : activeFilterCount > 0
      ? t('news.list.empty_filtered')
      : t('news.list.empty');

  return (
    <div role="listbox" aria-label={t('news.list.list_label')} className={styles.list}>
      {isLoading && (
        <div className={styles.loadingWrap}>
          <Spin size="large" />
        </div>
      )}
      {!isLoading && items.length === 0 && <Empty description={emptyDescription} className={styles.empty} />}
      {!isLoading && items.length > 0 && (
        <Virtuoso ref={virtuosoRef} className={styles.virtuoso} data={items} overscan={400} itemContent={renderItem} />
      )}
    </div>
  );
}
