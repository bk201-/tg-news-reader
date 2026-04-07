import React from 'react';
import { Button, Space } from 'antd';
import { MaybeTooltip as Tooltip } from '../../../common/MaybeTooltip';
import {
  ReloadOutlined,
  LinkOutlined,
  FileTextOutlined,
  DownloadOutlined,
  LoadingOutlined,
  ExportOutlined,
  CheckOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { isYouTubeUrl } from '../../newsUtils';
import { NewsHashtags } from '../../Feed/NewsHashtags';
import type { NewsDetailToolbarProps } from '../newsDetailToolbarTypes';

const useStyles = createStyles(({ css, token }) => ({
  headerTop: css`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding: 12px 20px;
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
}));

export function NewsDetailToolbarPanel({
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
  onTagClick,
  onShare,
}: NewsDetailToolbarProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();
  const hashtags = item.hashtags || [];
  const nonYtLinks = links.filter((l) => !isYouTubeUrl(l));

  const metaContent = (
    <>
      <span className={styles.dateLine}>{dayjs.unix(item.postedAt).format('DD MMMM YYYY, HH:mm')}</span>
      {hashtags.length > 0 && <NewsHashtags hashtags={hashtags} onTagClick={onTagClick} className={styles.tags} />}
    </>
  );

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
