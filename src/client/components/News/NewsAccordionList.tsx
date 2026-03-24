import React from 'react';
import { Spin, Empty } from 'antd';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { NewsItem, ChannelType } from '@shared/types.ts';
import { NewsAccordionItem } from './NewsAccordionItem';

const useStyles = createStyles(({ css, token }) => ({
  accordion: css`
    flex: 1;
    overflow-y: auto;
    position: relative;
    background: ${token.colorBgContainer};
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

interface NewsAccordionListProps {
  isLoading: boolean;
  items: NewsItem[];
  filteredIds: Set<number>;
  showAll: boolean;
  selectedNewsId: number | null;
  hashTagFilter: string | null;
  activeFilterCount: number;
  channelType: ChannelType;
  channelTelegramId: string;
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
  channelTelegramId,
  onSelect,
  onTagClick,
  onMarkedRead,
  listRef,
}: NewsAccordionListProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  const emptyDescription = hashTagFilter
    ? t('news.list.empty_tag', { tag: hashTagFilter })
    : activeFilterCount > 0
      ? t('news.list.empty_filtered')
      : t('news.list.empty');

  return (
    <div role="list" aria-label={t('news.list.list_label')} className={styles.accordion} ref={listRef}>
      {isLoading && (
        <div className={styles.loadingWrap}>
          <Spin size="large" />
        </div>
      )}
      {!isLoading && items.length === 0 && <Empty description={emptyDescription} className={styles.empty} />}
      {items.map((item) => (
        <NewsAccordionItem
          key={item.id}
          item={item}
          isSelected={selectedNewsId === item.id}
          isFiltered={filteredIds.has(item.id)}
          showAll={showAll}
          channelType={channelType}
          channelTelegramId={channelTelegramId}
          onSelect={onSelect}
          onTagClick={onTagClick}
          onMarkedRead={onMarkedRead}
        />
      ))}
    </div>
  );
}
