import React from 'react';
import { createStyles } from 'antd-style';
import type { NewsItem, ChannelType } from '@shared/types.ts';
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
  channelType: ChannelType;
  channelTelegramId: string;
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
      className={cx(styles.item, isSelected && styles.itemExpanded, dimmed && styles.itemDimmed)}
    >
      {isSelected ? (
        <NewsDetail
          key={item.id}
          item={item}
          channelType={channelType}
          channelTelegramId={channelTelegramId}
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
