import React from 'react';
import { Button, Typography } from 'antd';
import { CloseOutlined, LinkOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import type { NewsItem } from '@shared/types.ts';

interface LightboxToolbarProps {
  item: NewsItem | null | undefined;
  channelName: string;
  channelTelegramId: string;
  positionLabel: string;
  onClose: () => void;
}

const useStyles = createStyles(({ css }) => ({
  toolbar: css`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.75) 0%, transparent 100%);
    flex-shrink: 0;
    z-index: 2;
  `,
  info: css`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  `,
  channel: css`
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `,
  meta: css`
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
    display: flex;
    gap: 8px;
    align-items: center;
  `,
  closeBtn: css`
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.85) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
    background: rgba(255, 255, 255, 0.08) !important;
    &:hover {
      background: rgba(255, 255, 255, 0.18) !important;
    }
  `,
  linkBtn: css`
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.65) !important;
    border-color: rgba(255, 255, 255, 0.15) !important;
    background: rgba(255, 255, 255, 0.05) !important;
    &:hover {
      color: rgba(255, 255, 255, 0.9) !important;
      background: rgba(255, 255, 255, 0.15) !important;
    }
  `,
}));

const { Text } = Typography;

export function LightboxToolbar({
  item,
  channelName,
  channelTelegramId,
  positionLabel,
  onClose,
}: LightboxToolbarProps) {
  const { styles } = useStyles();
  const { t } = useTranslation();

  const openUrl = item ? (item.links?.[0] ?? `https://t.me/${channelTelegramId}/${item.telegramMsgId}`) : undefined;

  const date = item ? dayjs.unix(item.postedAt).format('DD.MM.YY HH:mm') : '';

  return (
    <div className={styles.toolbar}>
      <div className={styles.info}>
        <span className={styles.channel}>{channelName}</span>
        <div className={styles.meta}>
          <Text>{date}</Text>
          {positionLabel && <Text>· {positionLabel}</Text>}
        </div>
      </div>

      {openUrl && (
        <Button
          size="small"
          icon={<LinkOutlined />}
          className={styles.linkBtn}
          onClick={() => window.open(openUrl, '_blank', 'noopener,noreferrer')}
          title={t('lightbox.open_in_telegram')}
        />
      )}

      <Button
        size="small"
        icon={<CloseOutlined />}
        className={styles.closeBtn}
        onClick={onClose}
        title={t('lightbox.close')}
      />
    </div>
  );
}
