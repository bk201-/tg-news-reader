import React, { useCallback } from 'react';
import { Spin, Empty } from 'antd';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { NewsItem } from '@shared/types.ts';
import { NewsAccordionItem } from './NewsAccordionItem';
import { BP_XL, MOBILE_TOOLBAR_HEIGHT } from '../../../../hooks/breakpoints';

const useStyles = createStyles(({ css, token }) => ({
  accordion: css`
    flex: 1;
    overflow-y: auto;
    position: relative;
    background: ${token.colorBgContainer};
    overscroll-behavior-y: contain;
    /* Mobile: parent div is the scroll container — no inner scroll */
    @media (max-width: ${BP_XL - 1}px) {
      flex: none;
      overflow-y: visible;
      height: auto;
    }
  `,
  virtuoso: css`
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
  // Ensure selected items scroll into view below sticky toolbar on mobile
  item: css`
    @media (max-width: ${BP_XL - 1}px) {
      scroll-margin-top: ${MOBILE_TOOLBAR_HEIGHT + 8}px;
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
  virtuosoRef: React.RefObject<VirtuosoHandle | null>;
  /** Mobile: use window as scroll parent so browser chrome hides on scroll */
  windowScroll?: boolean;
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
  virtuosoRef,
  windowScroll,
}: NewsAccordionListProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  const emptyDescription = hashTagFilter
    ? t('news.list.empty_tag', { tag: hashTagFilter })
    : activeFilterCount > 0
      ? t('news.list.empty_filtered')
      : t('news.list.empty');

  const renderItem = useCallback(
    (_: number, item: NewsItem) => (
      <div data-news-id={item.id} className={styles.item}>
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
    ),
    [selectedNewsId, filteredIds, showAll, channelTelegramId, onSelect, onTagClick, onMarkedRead, styles.item],
  );

  return (
    <div role="list" aria-label={t('news.list.list_label')} className={styles.accordion}>
      {isLoading && (
        <div className={styles.loadingWrap}>
          <Spin size="large" />
        </div>
      )}
      {!isLoading && items.length === 0 && <Empty description={emptyDescription} className={styles.empty} />}
      {!isLoading && items.length > 0 && (
        <Virtuoso
          ref={virtuosoRef}
          className={windowScroll ? undefined : styles.virtuoso}
          data={items}
          overscan={500}
          useWindowScroll={windowScroll}
          style={windowScroll ? undefined : { height: '100%' }}
          itemContent={renderItem}
        />
      )}
    </div>
  );
}
