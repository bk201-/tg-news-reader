import React from 'react';
import { Button, Tooltip, Space, Tag } from 'antd';
import {
  ReloadOutlined,
  LinkOutlined,
  FileTextOutlined,
  DownloadOutlined,
  LoadingOutlined,
  ExportOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { NewsItem, ChannelType } from '@shared/types.ts';
import { isYouTubeUrl } from './newsUtils';

const useStyles = createStyles(({ css, token }) => ({
  headerTop: css`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding: 12px 20px;
  `,
  toolbarMeta: css`
    flex: 1;
    min-width: min(380px, 100%);
    cursor: pointer;
    user-select: none;
    padding-right: 12px;
    &:hover {
      opacity: 0.8;
    }
  `,
  toolbarTitle: css`
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    word-break: break-word;
    margin-bottom: 4px;
    color: ${token.colorText};
  `,
  dateLine: css`
    font-size: 12px;
    color: ${token.colorTextSecondary};
  `,
  tags: css`
    margin-top: 4px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  `,
  tag: css`
    margin-right: 0;
  `,
  /* Hides button text labels when the detail header gets narrow (container set on header in NewsDetail) */
  ndBtnText: css`
    @container (max-width: 540px) {
      display: none;
    }
  `,
}));

interface NewsDetailToolbarProps {
  item: NewsItem;
  channelType: ChannelType;
  links: string[];
  topPanel: 'links' | 'text' | null;
  onTogglePanel: (panel: 'links' | 'text') => void;
  articleLoading: boolean;
  articleQueued: boolean;
  onExtractClick: () => void;
  isRead: boolean;
  onMarkRead: () => void;
  markReadPending: boolean;
  onRefresh: () => void;
  firstLink?: string;
  /** 'panel' = classic date+tags header; 'inline' = accordion with title+date+tags */
  variant?: 'panel' | 'inline';
  /** Title text shown in inline variant */
  title?: string;
  /** Clicking the left (title/meta) area collapses the accordion item */
  onHeaderClick?: () => void;
}

export function NewsDetailToolbar({
  item,
  channelType,
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
  firstLink,
  variant = 'panel',
  title,
  onHeaderClick,
}: NewsDetailToolbarProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();
  const hashtags = item.hashtags || [];
  const nonYtLinks = links.filter((l) => !isYouTubeUrl(l));
  const isInline = variant === 'inline';

  const metaContent = (
    <>
      <span className={styles.dateLine}>{dayjs.unix(item.postedAt).format('DD MMMM YYYY, HH:mm')}</span>
      {hashtags.length > 0 && (
        <div className={styles.tags}>
          {hashtags.map((tag) => (
            <Tag key={tag} color="blue" className={styles.tag}>
              {tag}
            </Tag>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className={styles.headerTop}>
      {isInline ? (
        <div
          className={styles.toolbarMeta}
          onClick={onHeaderClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onHeaderClick?.()}
        >
          {title && <div className={styles.toolbarTitle}>{title}</div>}
          {metaContent}
        </div>
      ) : (
        <div>{metaContent}</div>
      )}

      <Space wrap size={4} onClick={isInline ? (e: React.MouseEvent) => e.stopPropagation() : undefined}>
        <Tooltip title={t('news.detail.refresh_tooltip')}>
          <Button icon={<ReloadOutlined />} size="small" onClick={onRefresh}>
            <span className={styles.ndBtnText}>{t('news.detail.refresh')}</span>
          </Button>
        </Tooltip>

        {links.length > 0 && (
          <Tooltip title={t('news.detail.links_tooltip')}>
            <Button
              icon={<LinkOutlined />}
              size="small"
              type={topPanel === 'links' ? 'primary' : 'default'}
              onClick={() => onTogglePanel('links')}
            >
              <span className={styles.ndBtnText}>
                {links.length > 1 ? t('news.detail.links_count', { count: links.length }) : t('news.detail.links')}
              </span>
            </Button>
          </Tooltip>
        )}
        {item.text && (
          <Tooltip title={t('news.detail.text_tooltip')}>
            <Button
              icon={<FileTextOutlined />}
              size="small"
              type={topPanel === 'text' ? 'primary' : 'default'}
              onClick={() => onTogglePanel('text')}
            >
              <span className={styles.ndBtnText}>{t('news.detail.text')}</span>
            </Button>
          </Tooltip>
        )}

        {channelType === 'link_continuation' && !item.fullContent && nonYtLinks.length > 0 && (
          <Tooltip title={t('news.detail.load_article_tooltip')}>
            <Button
              icon={articleLoading ? <LoadingOutlined /> : <DownloadOutlined />}
              size="small"
              onClick={onExtractClick}
              loading={articleLoading}
              disabled={articleQueued}
            >
              <span className={styles.ndBtnText}>
                {articleQueued ? t('news.detail.queued') : t('news.detail.load_article')}
              </span>
            </Button>
          </Tooltip>
        )}

        {firstLink && (
          <Tooltip title={t('news.detail.open_tooltip')}>
            <Button icon={<ExportOutlined />} size="small" href={firstLink} target="_blank" rel="noreferrer">
              <span className={styles.ndBtnText}>{t('news.detail.open')}</span>
            </Button>
          </Tooltip>
        )}
        <Button
          icon={<CheckOutlined />}
          size="small"
          type={isRead ? 'default' : 'primary'}
          onClick={onMarkRead}
          loading={markReadPending}
        >
          <span className={styles.ndBtnText}>{isRead ? t('news.detail.mark_unread') : t('news.detail.mark_read')}</span>
        </Button>
      </Space>
    </div>
  );
}
