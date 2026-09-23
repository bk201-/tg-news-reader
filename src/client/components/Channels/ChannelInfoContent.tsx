import type { Channel } from '@shared/types.ts';
import { Button, Divider, Typography } from 'antd';
import { createStyles } from 'antd-style';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGroups } from '../../api/groups';
import { useAuthStore } from '../../store/authStore';
import { ChannelDescription } from './ChannelDescription';
import { ChannelStorageInfo } from './ChannelStorageInfo';

const useStyles = createStyles(({ css, token }) => ({
  content: css`
    width: min(360px, calc(100vw - 48px));
    max-height: min(560px, 70vh);
    overflow-y: auto;
    overflow-wrap: anywhere;
  `,
  header: css`
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  `,
  metadata: css`
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    & dt { color: ${token.colorTextSecondary}; }
    & dd { margin: 0; }
  `,
}));
const stopClick = (e: React.MouseEvent) => e.stopPropagation();

export function ChannelInfoContent({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { styles } = useStyles();
  const { data: groups } = useGroups();
  const token = useAuthStore((s) => s.accessToken);
  const unlocked = useAuthStore((s) => s.unlockedGroupIds);
  const group = groups?.find((g) => g.id === channel.groupId);
  const allowed = !!token && (!channel.groupId || (!!group && (!group.hasPIN || unlocked.includes(group.id))));
  const stopKeys = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );
  const date = (timestamp?: number) =>
    timestamp ? new Date(timestamp * 1000).toLocaleString(i18n.language) : t('channels.info.never');
  return (
    <div
      role="dialog"
      aria-label={t('channels.info.title')}
      className={styles.content}
      onClick={stopClick}
      onKeyDown={stopKeys}
    >
      <div className={styles.header}>
        <Typography.Text strong>{t('channels.info.title')}</Typography.Text>
        <Button size="small" onClick={onClose}>
          {t('channels.info.close')}
        </Button>
      </div>
      {!allowed ? (
        <span>{t('channels.info.locked')}</span>
      ) : (
        <>
          <Typography.Title level={5}>{channel.name}</Typography.Title>
          <a href={`https://t.me/${encodeURIComponent(channel.telegramId)}`} target="_blank" rel="noopener noreferrer">
            @{channel.telegramId}
          </a>
          <Divider />
          {channel.description?.trim() ? (
            <ChannelDescription description={channel.description} />
          ) : (
            <Typography.Text type="secondary">{t('channels.info.no_description')}</Typography.Text>
          )}
          <Typography.Text type="secondary">{t('channels.info.description_source')}</Typography.Text>
          <dl className={styles.metadata}>
            <dt>{t('channels.info.type')}</dt>
            <dd>{t(`channels.form.type_${channel.channelType}`)}</dd>
            <dt>{t('channels.info.group')}</dt>
            <dd>{group?.name ?? t('groups.general')}</dd>
            <dt>{t('channels.info.posts')}</dt>
            <dd>{channel.totalNewsCount}</dd>
            <dt>{t('channels.info.unread')}</dt>
            <dd>{channel.unreadCount}</dd>
            <dt>{t('channels.info.created')}</dt>
            <dd>{date(channel.createdAt)}</dd>
            <dt>{t('channels.info.fetched')}</dt>
            <dd>{date(channel.lastFetchedAt)}</dd>
            <dt>{t('channels.info.read')}</dt>
            <dd>{date(channel.lastReadAt)}</dd>
            <dt>{t('channels.info.status')}</dt>
            <dd>{t(channel.isUnavailable ? 'channels.info.unavailable' : 'channels.info.available')}</dd>
          </dl>
          <Divider />
          <ChannelStorageInfo channelId={channel.id} />
        </>
      )}
    </div>
  );
}
