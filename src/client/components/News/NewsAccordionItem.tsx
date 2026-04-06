import React, { memo } from 'react';
import { createStyles } from 'antd-style';
import type { NewsItem } from '@shared/types.ts';
import { NewsListItem } from './NewsListItem';
import { NewsDetail } from './NewsDetail';

const useStyles = createStyles(({ css, token }) => ({
  item: css`
    border-bottom: 1px solid ${token.colorBorderSecondary};
    /* Remove the inner item's own bottom border — accordion wrapper provides it */
    & > div:first-child {
      border-bottom: none;
    }
  `,
  itemExpanded: css`
    border-left: 3px solid ${token.colorPrimary};
  `,
  itemDimmed: css`
    opacity: 0.45;
  `,
}));

interface NewsAccordionItemProps {
  item: NewsItem;
  isSelected: boolean;
  isFiltered: boolean;
  showAll: boolean;
  channelTelegramId: string;
  onSelect: (id: number | null) => void;
  onTagClick: (tag: string, action: 'show' | 'addFilter') => void;
  onMarkedRead: (id: number) => void;
}

export const NewsAccordionItem = memo(
  function NewsAccordionItem({
  item,
  isSelected,
  isFiltered,
  showAll,
  channelTelegramId,
  onSelect,
  onTagClick,
  onMarkedRead,
}: NewsAccordionItemProps) {
  const { styles, cx } = useStyles();

  if (!isFiltered && !showAll) return null;

  const dimmed = !isFiltered && showAll;

  return (
    <div
      data-news-id={item.id}
      aria-expanded={isSelected}
      className={cx(styles.item, isSelected && styles.itemExpanded, dimmed && styles.itemDimmed)}
    >
      {isSelected ? (
        <NewsDetail
          key={item.id}
          item={item}
          channelTelegramId={channelTelegramId}
          onMarkedRead={onMarkedRead}
          variant="inline"
          onHeaderClick={() => onSelect(null)}
          onTagClick={onTagClick}
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
},
(prev, next) =>
  prev.item === next.item &&
  prev.isSelected === next.isSelected &&
  prev.isFiltered === next.isFiltered &&
  prev.showAll === next.showAll &&
  prev.channelTelegramId === next.channelTelegramId,
);
