import React from 'react';
import { Button, Typography, Divider, Modal, Radio } from 'antd';
import { DownloadOutlined, LoadingOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { NewsItem } from '@shared/types.ts';
import { isYouTubeUrl } from './newsUtils';
import { NewsDetailMedia } from './NewsDetailMedia';
import { NewsYouTubeEmbeds } from './NewsYouTubeEmbeds';
import { NewsTextBlock } from './NewsTextBlock';
import { NewsArticleBody } from './NewsArticleBody';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  content: css`
    flex: 1;
    overflow-y: auto;
    padding: 16px 24px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  `,
  contentInline: css`
    flex: none;
    overflow: visible;
  `,
  textBody: css`
    width: 100%;
    max-width: 680px;
    min-width: 0;
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  loadBtn: css`
    margin-top: 8px;
  `,
  errorText: css`
    font-size: 12px;
    display: block;
    margin-top: 4px;
  `,
  dividerLabel: css`
    font-size: 12px;
  `,
  radioGroup: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  radioLink: css`
    font-size: 12px;
  `,
}));

interface NewsDetailBodyProps {
  item: NewsItem;
  links: string[];
  firstMediaPath?: string;
  isAlbum: boolean;
  isVideo: boolean;
  /** true when the post is an audio message */
  isAudio: boolean;
  albumIndex: number;
  albumLength: number;
  albumExpectedLength: number;
  onAlbumNav: (delta: -1 | 1) => void;
  mediaLoading: boolean;
  mediaQueued: boolean;
  mediaTaskStatus?: string;
  mediaTaskError?: string;
  onDownload: () => void;
  articleLoading: boolean;
  articleQueued: boolean;
  articleTaskStatus?: string;
  articleTaskError?: string;
  onExtractClick: () => void;
  linkModalOpen: boolean;
  selectedUrl: string;
  onSelectedUrlChange: (url: string) => void;
  onModalConfirm: () => void;
  onModalCancel: () => void;
  variant?: 'panel' | 'inline';
}

export function NewsDetailBody({
  item,
  links,
  firstMediaPath,
  isAlbum,
  isVideo,
  isAudio,
  albumIndex,
  albumLength,
  albumExpectedLength,
  onAlbumNav,
  mediaLoading,
  mediaQueued,
  mediaTaskStatus,
  mediaTaskError,
  onDownload,
  articleLoading,
  articleQueued,
  articleTaskStatus,
  articleTaskError,
  onExtractClick,
  linkModalOpen,
  selectedUrl,
  onSelectedUrlChange,
  onModalConfirm,
  onModalCancel,
  variant = 'panel',
}: NewsDetailBodyProps) {
  const { styles, cx } = useStyles();
  const { t } = useTranslation();

  // Determine what to show in the text zone:
  // - suppress for media channels (textInPanel=1 puts text in the overlay)
  // - suppress when article is already loaded (article view replaces preview)
  // - suppress when text is empty and there's no load button (pure media post with no caption)
  const showTextBlock =
    item.textInPanel !== 1 &&
    !(item.canLoadArticle === 1 && item.fullContent) &&
    (!!item.text || item.canLoadArticle === 1);

  // Article zone: fullContent when canLoadArticle=1, OR secondary content otherwise
  const articleContent = item.fullContent;
  const articleFormat = item.fullContentFormat ?? 'text';

  return (
    <>
      <div className={cx(styles.content, variant === 'inline' && styles.contentInline)}>
        <NewsDetailMedia
          item={item}
          firstMediaPath={firstMediaPath}
          isAlbum={isAlbum}
          isVideo={isVideo}
          isAudio={isAudio}
          albumIndex={albumIndex}
          albumLength={albumLength}
          albumExpectedLength={albumExpectedLength}
          onAlbumNav={onAlbumNav}
          mediaLoading={mediaLoading}
          mediaQueued={mediaQueued}
          mediaTaskStatus={mediaTaskStatus}
          mediaTaskError={mediaTaskError}
          onDownload={onDownload}
        />

        <div className={styles.textBody}>
          {/* Zone 2: post text infoblock */}
          {showTextBlock && (
            <NewsTextBlock text={item.text || ''}>
              {!item.text && <Text type="secondary">{t('news.detail.no_text')}</Text>}
              {item.canLoadArticle === 1 && !item.fullContent && links.filter((l) => !isYouTubeUrl(l)).length > 0 && (
                <Button
                  icon={articleLoading ? <LoadingOutlined /> : <DownloadOutlined />}
                  onClick={onExtractClick}
                  loading={articleLoading}
                  disabled={articleQueued}
                  className={styles.loadBtn}
                >
                  {articleQueued ? t('news.detail.queued') : t('news.detail.load_article')}
                </Button>
              )}
              {articleTaskStatus === 'failed' && (
                <Text type="danger" className={styles.errorText}>
                  {t('news.detail.error', { error: articleTaskError })}
                </Text>
              )}
            </NewsTextBlock>
          )}

          {/* Zone 3: full article */}
          {articleContent && item.canLoadArticle === 1 && (
            <NewsArticleBody content={articleContent} format={articleFormat} />
          )}

          {item.canLoadArticle !== 1 && articleContent && (
            <>
              <Divider>
                <Text type="secondary" className={styles.dividerLabel}>
                  {t('news.detail.full_content_divider')}
                </Text>
              </Divider>
              <NewsArticleBody content={articleContent} format={articleFormat} />
            </>
          )}

          <NewsYouTubeEmbeds links={links} />
        </div>
      </div>

      <Modal
        open={linkModalOpen}
        title={t('news.detail.select_link_title')}
        okText={t('common.download')}
        cancelText={t('common.cancel')}
        onOk={onModalConfirm}
        onCancel={onModalCancel}
      >
        <Radio.Group
          value={selectedUrl}
          onChange={(e) => onSelectedUrlChange(e.target.value as string)}
          className={styles.radioGroup}
        >
          {links
            .filter((l) => !isYouTubeUrl(l))
            .map((link) => (
              <Radio key={link} value={link}>
                <Text className={styles.radioLink}>{link.length > 70 ? link.substring(0, 70) + '…' : link}</Text>
              </Radio>
            ))}
        </Radio.Group>
      </Modal>
    </>
  );
}
