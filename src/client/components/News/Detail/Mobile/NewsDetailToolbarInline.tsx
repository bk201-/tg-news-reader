import React from 'react';
import { Button, Space, Dropdown, Checkbox } from 'antd';
import type { MenuProps } from 'antd';
import {
  ReloadOutlined,
  LinkOutlined,
  FileTextOutlined,
  DownloadOutlined,
  LoadingOutlined,
  ExportOutlined,
  CheckOutlined,
  MoreOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { isYouTubeUrl } from '../../newsUtils';
import { NewsHashtags } from '../../Feed/NewsHashtags';
import type { NewsDetailToolbarProps } from '../newsDetailToolbarTypes';

const useStyles = createStyles(({ css, token }) => ({
  /** Root row for inline (accordion) header — mirrors NewsListItem outer layout */
  inlineRoot: css`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
  `,
  inlineCheckbox: css`
    flex-shrink: 0;
    padding-top: 2px;
  `,
  /** Column that holds title row + meta row (flex: 1, mirrors titleWrap) */
  inlineBody: css`
    flex: 1;
    min-width: 0;
  `,
  /** Title + action-buttons on the same line */
  inlineRow1: css`
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin-bottom: 4px;
  `,
  /** Title text — same clamp as NewsListItem */
  inlineTitle: css`
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    word-break: break-word;
    color: ${token.colorText};
    cursor: pointer;
    user-select: none;
    &:hover {
      opacity: 0.8;
    }
  `,
  inlineTitleRead: css`
    color: ${token.colorTextDisabled};
    font-weight: 400;
  `,
  /** date + tags row — mirrors NewsListItem meta */
  inlineMeta: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    user-select: none;
    &:hover {
      opacity: 0.8;
    }
  `,
  /** Matches NewsListItem metaDate exactly */
  inlineMetaDate: css`
    font-size: 11px;
    color: ${token.colorTextSecondary};
    flex-shrink: 0;
    white-space: nowrap;
  `,
}));

export function NewsDetailToolbarInline({
  item,
  links,
  topPanel,
  onTogglePanel,
  articleLoading,
  articleQueued,
  onExtractClick,
  isRead,
  onMarkRead,
  markReadPending,
  onRefresh,
  refreshPending,
  openUrl,
  title,
  onHeaderClick,
  onTagClick,
  onShare,
}: NewsDetailToolbarProps) {
  const { t } = useTranslation();
  const { styles, cx } = useStyles();
  const hashtags = item.hashtags || [];
  const nonYtLinks = links.filter((l) => !isYouTubeUrl(l));

  const moreItems: MenuProps['items'] = [
    {
      key: 'refresh',
      icon: refreshPending ? <LoadingOutlined /> : <ReloadOutlined />,
      label: t('news.detail.refresh'),
      disabled: refreshPending,
      onClick: onRefresh,
    },
    ...(links.length > 0
      ? [
          {
            key: 'links',
            icon: topPanel === 'links' ? <CheckOutlined /> : <LinkOutlined />,
            label: links.length > 1 ? t('news.detail.links_count', { count: links.length }) : t('news.detail.links'),
            onClick: () => onTogglePanel('links'),
          } satisfies NonNullable<MenuProps['items']>[number],
        ]
      : []),
    ...(item.text
      ? [
          {
            key: 'text',
            icon: topPanel === 'text' ? <CheckOutlined /> : <FileTextOutlined />,
            label: t('news.detail.text'),
            onClick: () => onTogglePanel('text'),
          } satisfies NonNullable<MenuProps['items']>[number],
        ]
      : []),
    ...(item.canLoadArticle === 1 && !item.fullContent && nonYtLinks.length > 0
      ? [
          {
            key: 'article',
            icon: articleLoading ? <LoadingOutlined /> : <DownloadOutlined />,
            label: articleQueued ? t('news.detail.queued') : t('news.detail.load_article'),
            disabled: articleQueued || articleLoading,
            onClick: onExtractClick,
          } satisfies NonNullable<MenuProps['items']>[number],
        ]
      : []),
    {
      key: 'open',
      icon: <ExportOutlined />,
      label: (
        <a href={openUrl} target="_blank" rel="noreferrer">
          {t('news.detail.open')}
        </a>
      ),
    },
    {
      key: 'share',
      icon: <ShareAltOutlined />,
      label: t('news.detail.share'),
      onClick: onShare,
    },
  ];

  return (
    <div className={styles.inlineRoot}>
      <Checkbox
        checked={isRead}
        onClick={(e) => {
          e.stopPropagation();
          onMarkRead();
        }}
        className={styles.inlineCheckbox}
      />
      <div className={styles.inlineBody}>
        {/* Row 1: title + action buttons */}
        <div className={styles.inlineRow1}>
          <div
            className={cx(styles.inlineTitle, isRead && styles.inlineTitleRead)}
            onClick={onHeaderClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onHeaderClick?.()}
          >
            {title}
          </div>
          <Space size={4} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <Button
              icon={<CheckOutlined />}
              size="small"
              type={isRead ? 'default' : 'primary'}
              onClick={onMarkRead}
              loading={markReadPending}
            />
            <Dropdown menu={{ items: moreItems }} trigger={['click']} placement="bottomRight">
              <Button type="text" icon={<MoreOutlined />} size="small" />
            </Dropdown>
          </Space>
        </div>
        {/* Row 2: date + tags */}
        <div className={styles.inlineMeta} onClick={onHeaderClick}>
          <span className={styles.inlineMetaDate}>{dayjs.unix(item.postedAt).format('DD.MM.YY HH:mm')}</span>
          {hashtags.length > 0 && <NewsHashtags hashtags={hashtags} onTagClick={onTagClick} maxVisible={4} />}
        </div>
      </div>
    </div>
  );
}
