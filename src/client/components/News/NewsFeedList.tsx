import React from 'react';
import { Spin, Empty } from 'antd';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { NewsItem } from '@shared/types.ts';
import { NewsListItem } from './NewsListItem';

const useStyles = createStyles(({ css, token }) => ({
  list: css`
    width: 380px;
    min-width: 280px;
    flex-shrink: 0;
    overflow-y: auto;
    background: ${token.colorBgContainer};
    border-right: 1px solid ${token.colorBorderSecondary};
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
  listRef: React.RefObject<HTMLDivElement | null>;
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
  const { t } = useTranslation();
  const { styles } = useStyles();
  const emptyDescription = hashTagFilter
    ? t('news.list.empty_tag', { tag: hashTagFilter })
    : activeFilterCount > 0
      ? t('news.list.empty_filtered')
      : t('news.list.empty');

  return (
    <div role="listbox" aria-label={t('news.list.list_label')} className={styles.list} ref={listRef}>
      {isLoading && (
        <div className={styles.loadingWrap}>
          <Spin size="large" />
        </div>
      )}
      {!isLoading && items.length === 0 && <Empty description={emptyDescription} className={styles.empty} />}
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
