import React, { useState } from 'react';
import { Modal, Button, Space, Typography, Form } from 'antd';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';
import { PlusOutlined, ReloadOutlined, OrderedListOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { Channel, ChannelType } from '@shared/types.ts';
import {
  useChannels,
  useCreateChannel,
  useUpdateChannel,
  useDeleteChannel,
  useFetchChannel,
  useCountUnreadChannels,
  useChannelLookup,
  useReorderChannels,
} from '../../api/channels';
import { useGroups } from '../../api/groups';
import { SortModal } from './SortModal';
import { useUIStore } from '../../store/uiStore';
import { ChannelItem } from './ChannelItem';
import { ChannelFormModal } from './ChannelFormModal';
import { ChannelFetchModal } from './ChannelFetchModal';
import { useChannelHotkeys } from './useChannelHotkeys';
import { ApiError } from '../../api/client';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  sidebar: css`
    display: flex;
    flex-direction: column;
    height: 100%;
  `,
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  list: css`
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  `,
  loading: css`
    padding: 16px;
  `,
  sidebarTitle: css`
    font-size: 14px;
  `,
}));

export function ChannelSidebar() {
  const { data: allChannels = [], isLoading } = useChannels();
  const { data: groups = [] } = useGroups();
  const createChannel = useCreateChannel();
  const updateChannel = useUpdateChannel();
  const deleteChannel = useDeleteChannel();
  const fetchChannel = useFetchChannel();
  const countUnread = useCountUnreadChannels();
  const lookupChannel = useChannelLookup();
  const reorderChannels = useReorderChannels();
  const { t } = useTranslation();

  const { selectedChannelId, setSelectedChannelId, pendingCounts, selectedGroupId } = useUIStore();
  const { styles } = useStyles();

  useChannelHotkeys();

  const channels = allChannels.filter((ch) =>
    selectedGroupId === null ? !ch.groupId : ch.groupId === selectedGroupId,
  );

  // ── Form modal state ──────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [form] = Form.useForm();

  const openCreate = () => {
    setEditingChannel(null);
    form.resetFields();
    form.setFieldValue('groupId', selectedGroupId ?? undefined);
    setModalOpen(true);
  };

  const openEdit = (ch: Channel, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChannel(ch);
    form.setFieldsValue({
      telegramId: ch.telegramId,
      name: ch.name,
      description: ch.description,
      channelType: ch.channelType,
      groupId: ch.groupId ?? undefined,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = (await form.validateFields()) as {
      telegramId: string;
      name: string;
      description?: string;
      channelType: ChannelType;
      groupId?: number;
    };

    try {
      if (editingChannel) {
        await updateChannel.mutateAsync({ id: editingChannel.id, ...values, groupId: values.groupId ?? null });
      } else {
        await createChannel.mutateAsync({ ...values, groupId: values.groupId ?? null });
      }
      setModalOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        form.setFields([{ name: 'telegramId', errors: [t('channels.form.already_exists')] }]);
      } else {
        throw err;
      }
    }
  };

  const handleTelegramIdBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    if (editingChannel) return;
    const raw = e.target.value.trim();
    // Auto-fill name/description from Telegram (only if name not yet filled)
    if (!raw || (form.getFieldValue('name') as string | undefined)) return;
    setLookupLoading(true);
    try {
      const info = await lookupChannel.mutateAsync(raw);
      form.setFieldsValue({ name: info.name, ...(info.description ? { description: info.description } : {}) });
    } catch {
      /* silent */
    } finally {
      setLookupLoading(false);
    }
  };

  // ── Fetch modal state ─────────────────────────────────────────────────
  const [fetchModalOpen, setFetchModalOpen] = useState(false);
  const [fetchTargetId, setFetchTargetId] = useState<number | null>(null);
  const [fetchSince, setFetchSince] = useState<dayjs.Dayjs | null>(null);

  // ── Sort modal state ──────────────────────────────────────────────────
  const [sortModalOpen, setSortModalOpen] = useState(false);

  const openFetchModal = (ch: Channel, e: React.MouseEvent) => {
    e.stopPropagation();
    setFetchTargetId(ch.id);
    setFetchSince(ch.lastFetchedAt ? dayjs.unix(ch.lastFetchedAt) : null);
    setFetchModalOpen(true);
  };

  const handleFetch = async () => {
    if (!fetchTargetId) return;
    await fetchChannel.mutateAsync({ id: fetchTargetId, since: fetchSince ? fetchSince.toISOString() : undefined });
    setFetchModalOpen(false);
  };

  const handleDelete = (ch: Channel, e: React.MouseEvent) => {
    e.stopPropagation();
    Modal.confirm({
      title: t('channels.delete_confirm_title', { name: ch.name }),
      content: t('channels.delete_confirm_content'),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => deleteChannel.mutateAsync(ch.id),
    });
  };

  return (
    <nav className={styles.sidebar} aria-label={t('sidebar.channels')}>
      <div className={styles.header}>
        <Text strong className={styles.sidebarTitle}>
          {t('sidebar.channels')}
        </Text>
        <Space size={4}>
          <Tooltip title={t('sidebar.add')}>
            <Button icon={<PlusOutlined />} onClick={openCreate} />
          </Tooltip>
          <Tooltip title={t('sidebar.sort_tooltip')}>
            <Button icon={<OrderedListOutlined />} onClick={() => setSortModalOpen(true)} />
          </Tooltip>
          <Tooltip title={t('sidebar.refresh_tooltip')}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => countUnread.mutate(selectedGroupId)}
              loading={countUnread.isPending}
            />
          </Tooltip>
        </Space>
      </div>

      <div role="listbox" aria-label={t('sidebar.channels')} className={styles.list}>
        {isLoading && <div className={styles.loading}>{t('common.loading')}</div>}
        {channels.map((ch) => (
          <ChannelItem
            key={ch.id}
            channel={ch}
            isSelected={selectedChannelId === ch.id}
            isFetchingThis={fetchChannel.isPending && fetchTargetId === ch.id}
            unreadCount={(ch.unreadCount || 0) + (pendingCounts[ch.id] || 0)}
            onSelect={() => setSelectedChannelId(ch.id)}
            onFetch={(e) => openFetchModal(ch, e)}
            onEdit={(e) => openEdit(ch, e)}
            onDelete={(e) => handleDelete(ch, e)}
          />
        ))}
      </div>

      <ChannelFormModal
        open={modalOpen}
        editingChannel={editingChannel}
        allChannels={allChannels}
        form={form}
        groups={groups}
        lookupLoading={lookupLoading}
        confirmLoading={createChannel.isPending || updateChannel.isPending}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onTelegramIdBlur={handleTelegramIdBlur}
      />

      <ChannelFetchModal
        open={fetchModalOpen}
        fetchSince={fetchSince}
        loading={fetchChannel.isPending}
        onChangeSince={setFetchSince}
        onClose={() => setFetchModalOpen(false)}
        onConfirm={handleFetch}
      />

      <SortModal
        open={sortModalOpen}
        title={t('sidebar.sort_title')}
        items={channels.map((ch) => ({ id: ch.id, name: ch.name }))}
        loading={reorderChannels.isPending}
        onClose={() => setSortModalOpen(false)}
        onSave={(ordered) => {
          reorderChannels.mutate(ordered, { onSuccess: () => setSortModalOpen(false) });
        }}
      />
    </nav>
  );
}
