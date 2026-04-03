import React from 'react';
import { Spin, Empty } from 'antd';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { NewsItem } from '@shared/types.ts';
import { NewsAccordionItem } from './NewsAccordionItem';
import { BP_XL, MOBILE_STICKY_HEIGHT } from '../../hooks/breakpoints';

const useStyles = createStyles(({ css, token }) => ({
  accordion: css`
    flex: 1;
    overflow-y: auto;
    position: relative;
    background: ${token.colorBgContainer};
    overscroll-behavior-y: contain;
    /* Mobile: parent (mobileContainer) is the scroll container — no inner scroll */
    @media (max-width: ${BP_XL - 1}px) {
      flex: none;
      overflow-y: visible;
      height: auto;
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
  // Ensure selected items scroll into view below sticky header+toolbar on mobile
  item: css`
    @media (max-width: ${BP_XL - 1}px) {
      scroll-margin-top: ${MOBILE_STICKY_HEIGHT}px;
    }
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
        <div key={item.id} className={styles.item}>
          <NewsAccordionItem
            item={item}
            isSelected={selectedNewsId === item.id}
            isFiltered={filteredIds.has(item.id)}
            showAll={showAll}
            channelTelegramId={channelTelegramId}
            onSelect={onSelect}
            onTagClick={onTagClick}
            onMarkedRead={onMarkedRead}
          />
        </div>
      ))}
    </div>
  );
}
