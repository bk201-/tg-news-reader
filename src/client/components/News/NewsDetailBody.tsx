import React from 'react';
import { Button, Typography, Divider, Modal, Radio } from 'antd';
import { DownloadOutlined, LoadingOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { NewsItem, ChannelType } from '@shared/types.ts';
import { isYouTubeUrl } from './newsUtils';
import { NewsDetailMedia } from './NewsDetailMedia';

const { Text, Paragraph } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  content: css`
    flex: 1;
    overflow-y: auto;
    padding: 16px 24px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
  `,
  contentInline: css`
    flex: none;
    overflow: visible;
  `,
  textBody: css`
    width: 100%;
    max-width: 680px;
    min-width: 0;
    margin-top: 20px;
  `,
  fullContent: css`
    background: ${token.colorBgContainer};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 8px;
    padding: 16px 20px;
    margin-top: 8px;
  `,
  paragraph: css`
    white-space: pre-wrap;
    font-size: 14px;
    line-height: 1.8;
  `,
  paragraphCompact: css`
    white-space: pre-wrap;
    font-size: 14px;
    line-height: 1.7;
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
  channelType: ChannelType;
  links: string[];
  firstMediaPath?: string;
  isAlbum: boolean;
  isVideo: boolean;
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
  channelType,
  links,
  firstMediaPath,
  isAlbum,
  isVideo,
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

  return (
    <>
      <div className={cx(styles.content, variant === 'inline' && styles.contentInline)}>
        <NewsDetailMedia
          item={item}
          firstMediaPath={firstMediaPath}
          isAlbum={isAlbum}
          isVideo={isVideo}
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
          {channelType === 'link_continuation' ? (
            item.fullContent ? (
              <Paragraph className={styles.paragraph}>{item.fullContent}</Paragraph>
            ) : (
              <>
                <Paragraph className={styles.paragraphCompact}>
                  {item.text || <Text type="secondary">{t('news.detail.no_text')}</Text>}
                </Paragraph>
                {links.filter((l) => !isYouTubeUrl(l)).length > 0 && (
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
              </>
            )
          ) : channelType === 'media_content' ? null : (
            <Paragraph className={styles.paragraphCompact}>
              {item.text || <Text type="secondary">{t('news.detail.no_text')}</Text>}
            </Paragraph>
          )}

          {channelType !== 'link_continuation' && item.fullContent && (
            <>
              <Divider>
                <Text type="secondary" className={styles.dividerLabel}>
                  {t('news.detail.full_content_divider')}
                </Text>
              </Divider>
              <div className={styles.fullContent}>
                <Paragraph className={styles.paragraph}>{item.fullContent}</Paragraph>
              </div>
            </>
          )}
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
