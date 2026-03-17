import React from 'react';
import { Tag, Typography, Checkbox, Dropdown } from 'antd';
import { FilterOutlined, PlusOutlined, PlayCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { NewsItem, Filter } from '@shared/types.ts';
import { useMarkRead } from '../../api/news';

const { Text } = Typography;

interface NewsListItemProps {
  item: NewsItem;
  isSelected: boolean;
  isFiltered: boolean; // true = passed filter, false = filtered out
  showAll: boolean;
  onClick: () => void;
  onTagClick?: (tag: string, action: 'show' | 'addFilter') => void;
}

function getTitle(item: NewsItem): string {
  const text = item.text || '';
  const firstLine = text.split('\n')[0]?.trim() || '';
  return firstLine.length > 80 ? firstLine.substring(0, 80) + '…' : firstLine || `Сообщение #${item.telegramMsgId}`;
}

export function NewsListItem({ item, isSelected, isFiltered, showAll, onClick, onTagClick }: NewsListItemProps) {
  const markRead = useMarkRead();

  const title = getTitle(item);
  const hashtags = item.hashtags || [];
  const isRead = item.isRead === 1;
  const isVideo = /\.(mp4|webm)$/i.test(item.localMediaPath ?? '');

  // If filtered out and not showAll, don't render
  if (!isFiltered && !showAll) return null;

  const dimmed = !isFiltered && showAll;

  const handleMarkRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    markRead.mutate({ id: item.id, isRead: isRead ? 0 : 1 });
  };

  return (
    <div
      data-news-id={item.id}
      className={`news-item ${isSelected ? 'news-item--selected' : ''} ${isRead ? 'news-item--read' : ''} ${dimmed ? 'news-item--dimmed' : ''}`}
      onClick={onClick}
    >
      <div className="news-item__header">
        <Checkbox checked={isRead} onClick={handleMarkRead} style={{ flexShrink: 0 }} />
        <Text
          className="news-item__title"
          strong={!isRead}
          style={{ opacity: dimmed ? 0.4 : 1, flex: 1, marginLeft: 8 }}
          ellipsis={{ tooltip: title }}
        >
          {title}
        </Text>
        {item.localMediaPath && (
          <div className="news-item__thumb" style={{ opacity: dimmed ? 0.4 : 1 }}>
            {isVideo ? (
              <div className="news-item__thumb-video">
                <PlayCircleOutlined style={{ fontSize: 22, color: '#fff' }} />
              </div>
            ) : (
              <img src={`/api/media/${item.localMediaPath}`} alt="" className="news-item__thumb-img" />
            )}
          </div>
        )}
      </div>
      <div className="news-item__meta">
        <Text type="secondary" style={{ fontSize: 11 }}>
          {dayjs.unix(item.postedAt).format('DD.MM.YY HH:mm')}
        </Text>
        <div className="news-item__tags">
          {hashtags.slice(0, 4).map((tag) => (
            <Dropdown
              key={tag}
              trigger={['click']}
              menu={{
                items: [
                  { key: 'show', label: 'Показать только этот тег', icon: <FilterOutlined /> },
                  { key: 'addFilter', label: 'Добавить в фильтры', icon: <PlusOutlined /> },
                ],
                onClick: ({ key, domEvent }) => {
                  domEvent.stopPropagation();
                  onTagClick?.(tag, key as 'show' | 'addFilter');
                },
              }}
            >
              <Tag
                color="blue"
                style={{ fontSize: 10, margin: '0 2px', cursor: onTagClick ? 'pointer' : 'default' }}
                onClick={(e) => e.stopPropagation()}
              >
                {tag}
              </Tag>
            </Dropdown>
          ))}
          {hashtags.length > 4 && <Tag style={{ fontSize: 10 }}>+{hashtags.length - 4}</Tag>}
        </div>
      </div>
    </div>
  );
}

// Filter logic helper — active filters EXCLUDE matching news
export function applyFilters(items: NewsItem[], filters: Filter[]): Set<number> {
  const activeFilters = filters.filter((f) => f.isActive === 1);
  if (activeFilters.length === 0) return new Set(items.map((i) => i.id));

  const tagFilters = activeFilters.filter((f) => f.type === 'tag').map((f) => f.value.toLowerCase());
  const keywordFilters = activeFilters.filter((f) => f.type === 'keyword').map((f) => f.value.toLowerCase());

  const passedIds = new Set<number>();

  for (const item of items) {
    const hashtags = (item.hashtags || []).map((h) => h.toLowerCase());
    const text = (item.text || '').toLowerCase();

    // Exclude if matches any tag filter
    if (tagFilters.length > 0) {
      const tagMatch = tagFilters.some((tag) => hashtags.some((h) => h === tag || h === `#${tag}` || `#${h}` === tag));
      if (tagMatch) continue; // excluded
    }

    // Exclude if matches any keyword filter
    if (keywordFilters.length > 0) {
      const keywordMatch = keywordFilters.some((kw) => text.includes(kw));
      if (keywordMatch) continue; // excluded
    }

    passedIds.add(item.id);
  }

  return passedIds;
}
