import React from 'react';
import { Button, Space, Dropdown, Checkbox } from 'antd';
import type { MenuProps } from 'antd';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';
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
import type { NewsItem } from '@shared/types.ts';
import { isYouTubeUrl } from './newsUtils';
import { NewsHashtags } from './NewsHashtags';

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
  `,
  /* Hides button text labels when the detail header gets narrow (container set on header in NewsDetail) */
  ndBtnText: css`
    @container (max-width: 540px) {
      display: none;
    }
  `,
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

interface NewsDetailToolbarProps {
  item: NewsItem;
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
  /** URL to open when the Open button is clicked (firstLink if available, otherwise Telegram deep-link) */
  openUrl: string;
  /** true when openUrl is an external link from the post (false = Telegram fallback) */
  isExternalLink: boolean;
  /** 'panel' = classic date+tags header; 'inline' = accordion with title+date+tags */
  variant?: 'panel' | 'inline';
  /** Title text shown in inline variant */
  title?: string;
  /** Clicking the left (title/meta) area collapses the accordion item */
  onHeaderClick?: () => void;
  /** Tag click handler — if provided tags show a dropdown menu (show / addFilter) */
  onTagClick?: (tag: string, action: 'show' | 'addFilter') => void;
  /** Share button handler — Web Share API on mobile, clipboard fallback on desktop */
  onShare: () => void;
}

export function NewsDetailToolbar({
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
  openUrl,
  isExternalLink,
  variant = 'panel',
  title,
  onHeaderClick,
  onTagClick,
  onShare,
}: NewsDetailToolbarProps) {
  const { t } = useTranslation();
  const { styles, cx } = useStyles();
  const hashtags = item.hashtags || [];
  const nonYtLinks = links.filter((l) => !isYouTubeUrl(l));
  const isInline = variant === 'inline';

  const metaContent = (
    <>
      <span className={styles.dateLine}>{dayjs.unix(item.postedAt).format('DD MMMM YYYY, HH:mm')}</span>
      {hashtags.length > 0 && <NewsHashtags hashtags={hashtags} onTagClick={onTagClick} className={styles.tags} />}
    </>
  );

  // ── Compact inline (accordion / mobile) variant ───────────────────────
  // Keep "Mark as read" always visible; collapse everything else into "…" dropdown.
  if (isInline) {
    const moreItems: MenuProps['items'] = [
      {
        key: 'refresh',
        icon: <ReloadOutlined />,
        label: t('news.detail.refresh'),
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

  // ── Default panel (desktop list) variant ─────────────────────────────
  return (
    <div className={styles.headerTop}>
      <div>{metaContent}</div>

      <Space wrap size={4}>
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

        {item.canLoadArticle === 1 && !item.fullContent && nonYtLinks.length > 0 && (
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

        <Tooltip title={isExternalLink ? t('news.detail.open_tooltip') : t('news.detail.open_tg_tooltip')}>
          <Button icon={<ExportOutlined />} size="small" href={openUrl} target="_blank" rel="noreferrer">
            <span className={styles.ndBtnText}>{t('news.detail.open')}</span>
          </Button>
        </Tooltip>
        <Tooltip title={t('news.detail.share_tooltip')}>
          <Button icon={<ShareAltOutlined />} size="small" onClick={onShare}>
            <span className={styles.ndBtnText}>{t('news.detail.share')}</span>
          </Button>
        </Tooltip>
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
