import React from 'react';
import { Tag, Typography, Checkbox, Dropdown } from 'antd';
import { FilterOutlined, PlusOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { NewsItem, Filter } from '@shared/types.ts';
import { useMarkRead } from '../../api/news';
import { mediaUrl } from '../../api/mediaUrl';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  item: css`
    padding: 10px 12px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    cursor: pointer;
    transition: background 0.12s;
    &:hover {
      background: ${token.colorFillQuaternary};
    }
    &:focus-visible {
      outline: 2px solid ${token.colorPrimary};
      outline-offset: -2px;
    }
  `,
  itemSelected: css`
    background: ${token.colorPrimaryBg};
    border-left: 3px solid ${token.colorPrimary};
  `,
  itemRead: css``,
  itemDimmed: css`
    opacity: 0.45;
  `,
  header: css`
    display: flex;
    align-items: flex-start;
    gap: 6px;
  `,
  checkbox: css`
    flex-shrink: 0;
  `,
  titleWrap: css`
    flex: 1;
    margin-left: 8px;
  `,
  titleDimmed: css`
    opacity: 0.4;
  `,
  title: css`
    font-size: 13px;
    line-height: 1.4;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  `,
  titleRead: css`
    color: ${token.colorTextDisabled} !important;
  `,
  meta: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 6px;
    padding-left: 24px;
  `,
  metaDate: css`
    font-size: 11px;
    flex-shrink: 0;
    white-space: nowrap;
  `,
  tags: css`
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    min-width: 0;
    overflow: hidden;
    justify-content: flex-end;
  `,
  tag: css`
    font-size: 10px;
    margin: 0 2px;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-block;
    vertical-align: middle;
  `,
  thumb: css`
    flex-shrink: 0;
    margin-left: 8px;
    width: 56px;
    height: 56px;
    border-radius: 6px;
    overflow: hidden;
    align-self: center;
  `,
  thumbDimmed: css`
    opacity: 0.4;
  `,
  thumbImg: css`
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  `,
  thumbVideo: css`
    width: 100%;
    height: 100%;
    background: #1a1a2e;
    display: flex;
    align-items: center;
    justify-content: center;
  `,
  videoIcon: css`
    font-size: 22px;
    color: ${token.colorTextLightSolid};
  `,
  thumbPhoto: css`
    position: relative;
    width: 100%;
    height: 100%;
  `,
  overflowTag: css`
    font-size: 10px;
  `,
  albumBadge: css`
    position: absolute;
    bottom: 2px;
    right: 2px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 3px;
    line-height: 14px;
    pointer-events: none;
  `,
}));

interface NewsListItemProps {
  item: NewsItem;
  isSelected: boolean;
  isFiltered: boolean; // true = passed filter, false = filtered out
  showAll: boolean;
  onClick: () => void;
  onTagClick?: (tag: string, action: 'show' | 'addFilter') => void;
}

function getTitle(item: NewsItem, fallback: string): string {
  const text = item.text || '';
  const firstLine = text.split('\n')[0]?.trim() || '';
  return firstLine.length > 80 ? firstLine.substring(0, 80) + '…' : firstLine || fallback;
}

export function NewsListItem({ item, isSelected, isFiltered, showAll, onClick, onTagClick }: NewsListItemProps) {
  const markRead = useMarkRead();
  const { styles, cx } = useStyles();
  const { t } = useTranslation();

  const title = getTitle(item, t('news.list.message_fallback', { id: item.telegramMsgId }));
  const hashtags = item.hashtags || [];
  const isRead = item.isRead === 1;
  const firstMediaPath = item.localMediaPaths?.[0] ?? item.localMediaPath;
  const isAlbum = (item.localMediaPaths?.length ?? 0) > 1;
  const isVideo = /\.(mp4|webm)$/i.test(firstMediaPath ?? '');

  // If filtered out and not showAll, don't render
  if (!isFiltered && !showAll) return null;

  const dimmed = !isFiltered && showAll;

  const handleMarkRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    markRead.mutate({ id: item.id, isRead: isRead ? 0 : 1, channelId: item.channelId });
  };

  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      data-news-id={item.id}
      className={cx(
        styles.item,
        isSelected && styles.itemSelected,
        isRead && styles.itemRead,
        dimmed && styles.itemDimmed,
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className={styles.header}>
        <Checkbox checked={isRead} onClick={handleMarkRead} className={styles.checkbox} />
        <Text
          className={cx(styles.title, styles.titleWrap, isRead && styles.titleRead, dimmed && styles.titleDimmed)}
          strong={!isRead}
          ellipsis={{ tooltip: title }}
        >
          {title}
        </Text>
        {firstMediaPath && (
          <div className={cx(styles.thumb, dimmed && styles.thumbDimmed)}>
            {isVideo ? (
              <div className={styles.thumbVideo}>
                <PlayCircleOutlined className={styles.videoIcon} />
              </div>
            ) : (
              <div className={styles.thumbPhoto}>
                <img src={mediaUrl(firstMediaPath)} alt="" className={styles.thumbImg} />
                {isAlbum && <span className={styles.albumBadge}>{item.localMediaPaths!.length}</span>}
              </div>
            )}
          </div>
        )}
      </div>
      <div className={styles.meta}>
        <Text type="secondary" className={styles.metaDate}>
          {dayjs.unix(item.postedAt).format('DD.MM.YY HH:mm')}
        </Text>
        <div className={styles.tags}>
          {hashtags.slice(0, 4).map((tag) => (
            <Dropdown
              key={tag}
              trigger={['click']}
              menu={{
                items: [
                  { key: 'show', label: t('news.list.tag_show'), icon: <FilterOutlined /> },
                  { key: 'addFilter', label: t('news.list.tag_add_filter'), icon: <PlusOutlined /> },
                ],
                onClick: ({ key, domEvent }) => {
                  domEvent.stopPropagation();
                  onTagClick?.(tag, key as 'show' | 'addFilter');
                },
              }}
            >
              <Tag
                color="blue"
                className={styles.tag}
                style={{ cursor: onTagClick ? 'pointer' : 'default' }}
                onClick={(e) => e.stopPropagation()}
              >
                {tag}
              </Tag>
            </Dropdown>
          ))}
          {hashtags.length > 4 && <Tag className={styles.overflowTag}>+{hashtags.length - 4}</Tag>}
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
