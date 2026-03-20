import React from 'react';
import { Button, Typography, Divider, Modal, Radio } from 'antd';
import { DownloadOutlined, LoadingOutlined } from '@ant-design/icons';
import type { NewsItem, ChannelType } from '@shared/types.ts';
import { isYouTubeUrl } from './newsUtils';
import { NewsDetailMedia } from './NewsDetailMedia';

const { Text, Paragraph } = Typography;

interface NewsDetailBodyProps {
  item: NewsItem;
  channelType: ChannelType;
  links: string[];
  firstMediaPath?: string;
  isAlbum: boolean;
  isVideo: boolean;
  albumIndex: number;
  albumLength: number;
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
}: NewsDetailBodyProps) {
  return (
    <>
      <div className="news-detail__content">
        <NewsDetailMedia
          item={item}
          firstMediaPath={firstMediaPath}
          isAlbum={isAlbum}
          isVideo={isVideo}
          albumIndex={albumIndex}
          onAlbumNav={onAlbumNav}
          mediaLoading={mediaLoading}
          mediaQueued={mediaQueued}
          mediaTaskStatus={mediaTaskStatus}
          mediaTaskError={mediaTaskError}
          onDownload={onDownload}
        />

        <div className="news-detail__text-body">
          {channelType === 'link_continuation' ? (
            item.fullContent ? (
              <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.8 }}>
                {item.fullContent}
              </Paragraph>
            ) : (
              <>
                <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>
                  {item.text || <Text type="secondary">(нет текста)</Text>}
                </Paragraph>
                {links.filter((l) => !isYouTubeUrl(l)).length > 0 && (
                  <Button
                    icon={articleLoading ? <LoadingOutlined /> : <DownloadOutlined />}
                    onClick={onExtractClick}
                    loading={articleLoading}
                    disabled={articleQueued}
                    style={{ marginTop: 8 }}
                  >
                    {articleQueued ? 'В очереди…' : 'Загрузить полный текст'}
                  </Button>
                )}
                {articleTaskStatus === 'failed' && (
                  <Text type="danger" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                    Ошибка: {articleTaskError}
                  </Text>
                )}
              </>
            )
          ) : channelType === 'media_content' ? null : (
            <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>
              {item.text || <Text type="secondary">(нет текста)</Text>}
            </Paragraph>
          )}

          {channelType !== 'link_continuation' && item.fullContent && (
            <>
              <Divider>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Полный текст статьи
                </Text>
              </Divider>
              <div className="news-detail__full-content">
                <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.8 }}>
                  {item.fullContent}
                </Paragraph>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        open={linkModalOpen}
        title="Выберите ссылку для загрузки"
        okText="Загрузить"
        cancelText="Отмена"
        onOk={onModalConfirm}
        onCancel={onModalCancel}
      >
        <Radio.Group
          value={selectedUrl}
          onChange={(e) => onSelectedUrlChange(e.target.value as string)}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {links
            .filter((l) => !isYouTubeUrl(l))
            .map((link) => (
              <Radio key={link} value={link}>
                <Text style={{ fontSize: 12 }}>{link.length > 70 ? link.substring(0, 70) + '…' : link}</Text>
              </Radio>
            ))}
        </Radio.Group>
      </Modal>
    </>
  );
}

