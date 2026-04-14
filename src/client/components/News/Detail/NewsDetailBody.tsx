import React, { useRef, useCallback } from 'react';
import { Button, Typography, Divider, Modal, Radio } from 'antd';
import { DownloadOutlined, LoadingOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { NewsItem } from '@shared/types.ts';
import { isYouTubeUrl } from '../newsUtils';
import { NewsDetailMedia } from './NewsDetailMedia';
import { NewsYouTubeEmbeds } from './NewsYouTubeEmbeds';
import { NewsTextBlock } from './NewsTextBlock';
import { NewsArticleBody } from './NewsArticleBody';

const DOUBLE_TAP_MS = 350;

/** Tags that should NOT trigger double-tap (interactive / media elements) */
const DOUBLE_TAP_EXCLUDED_TAGS = new Set(['a', 'button', 'img', 'video', 'audio', 'input', 'textarea', 'svg', 'path']);

/** Selectors for interactive containers whose children should be excluded */
const INTERACTIVE_SELECTOR = 'a, button, .ant-btn, .carousel-btn';

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
    gap: 12px;
  `,
  loadBtnWrap: css`
    width: 100%;
    max-width: 680px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  `,
  errorText: css`
    font-size: 12px;
    color: ${token.colorError};
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
  /** Double-tap on body text area (mobile) — triggers mark-read */
  onDoubleTap?: () => void;
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
  onDoubleTap,
}: NewsDetailBodyProps) {
  const { styles, cx } = useStyles();
  const { t } = useTranslation();

  // ── Double-tap detection (mobile mark-read on body text) ──────────
  const lastTapRef = useRef(0);
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!onDoubleTap) return;
      const tag = (e.target as HTMLElement).tagName?.toLowerCase();
      if (DOUBLE_TAP_EXCLUDED_TAGS.has(tag)) return;
      if ((e.target as HTMLElement).closest?.(INTERACTIVE_SELECTOR)) return;

      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        lastTapRef.current = 0;
        onDoubleTap();
      } else {
        lastTapRef.current = now;
      }
    },
    [onDoubleTap],
  );

  // Show the text infoblock only when there's actual post text
  const showTextBlock = item.textInPanel !== 1 && !(item.canLoadArticle === 1 && item.fullContent) && !!item.text;

  // Show the load button below the text block (or standalone) when article is not yet loaded
  const showLoadBtn =
    item.canLoadArticle === 1 && !item.fullContent && links.filter((l) => !isYouTubeUrl(l)).length > 0;

  // Article zone: fullContent when canLoadArticle=1, OR secondary content otherwise
  const articleContent = item.fullContent;
  const articleFormat = item.fullContentFormat ?? 'text';

  return (
    <>
      <div
        className={cx(styles.content, variant === 'inline' && styles.contentInline)}
        onTouchEnd={handleTouchEnd}
        style={onDoubleTap ? { touchAction: 'manipulation' } : undefined}
      >
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
          {showTextBlock && <NewsTextBlock text={item.text} />}

          {/* Load article button — below the text card, centered */}
          {showLoadBtn && (
            <div className={styles.loadBtnWrap}>
              <Button
                icon={articleLoading ? <LoadingOutlined /> : <DownloadOutlined />}
                onClick={onExtractClick}
                loading={articleLoading}
                disabled={articleQueued}
              >
                {articleQueued ? t('news.detail.queued') : t('news.detail.load_article')}
              </Button>
              {articleTaskStatus === 'failed' && (
                <Text type="danger" className={styles.errorText}>
                  {t('news.detail.error', { error: articleTaskError })}
                </Text>
              )}
            </div>
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
