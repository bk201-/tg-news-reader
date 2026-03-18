import React, { useState } from 'react';
import { Modal, Form, Input, DatePicker, Button, Space, Typography, Tooltip, Select, Badge } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Channel } from '@shared/types.ts';
import {
  useChannels,
  useCreateChannel,
  useUpdateChannel,
  useDeleteChannel,
  useFetchChannel,
  useCountUnreadChannels,
} from '../../api/channels';
import { useGroups } from '../../api/groups';
import { useUIStore } from '../../store/uiStore';

const { Text } = Typography;

export function ChannelSidebar() {
  const { data: allChannels = [], isLoading } = useChannels();
  const { data: groups = [] } = useGroups();
  const createChannel = useCreateChannel();
  const updateChannel = useUpdateChannel();
  const deleteChannel = useDeleteChannel();
  const fetchChannel = useFetchChannel();
  const countUnread = useCountUnreadChannels();

  const { selectedChannelId, setSelectedChannelId, pendingCounts, selectedGroupId } = useUIStore();

  // Filter channels by selected group
  const channels = allChannels.filter((ch) =>
    selectedGroupId === null ? !ch.groupId : ch.groupId === selectedGroupId,
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [fetchModalOpen, setFetchModalOpen] = useState(false);
  const [fetchTargetId, setFetchTargetId] = useState<number | null>(null);
  const [fetchSince, setFetchSince] = useState<dayjs.Dayjs | null>(null);

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
      channelType: 'none' | 'link_continuation' | 'media_content';
      groupId?: number;
    };
    if (editingChannel) {
      await updateChannel.mutateAsync({
        id: editingChannel.id,
        ...values,
        groupId: values.groupId ?? null,
      });
    } else {
      await createChannel.mutateAsync({
        ...values,
        groupId: values.groupId ?? null,
      });
    }
    setModalOpen(false);
  };

  const handleDelete = (ch: Channel, e: React.MouseEvent) => {
    e.stopPropagation();
    Modal.confirm({
      title: `Удалить канал "${ch.name}"?`,
      content: 'Все новости этого канала будут удалены.',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: () => deleteChannel.mutateAsync(ch.id),
    });
  };

  const openFetchModal = (ch: Channel, e: React.MouseEvent) => {
    e.stopPropagation();
    setFetchTargetId(ch.id);
    setFetchSince(ch.lastFetchedAt ? dayjs.unix(ch.lastFetchedAt) : null);
    setFetchModalOpen(true);
  };

  const handleFetch = async () => {
    if (!fetchTargetId) return;
    await fetchChannel.mutateAsync({
      id: fetchTargetId,
      since: fetchSince ? fetchSince.toISOString() : undefined,
    });
    setFetchModalOpen(false);
  };

  return (
    <div className="channel-sidebar">
      <div className="channel-sidebar__header">
        <Text strong style={{ fontSize: 14 }} className="sidebar-title">
          Каналы
        </Text>
        <Space size={4}>
          <Tooltip title="Посчитать непрочитанные в Telegram">
            <Button icon={<ReloadOutlined />} onClick={() => countUnread.mutate()} loading={countUnread.isPending}>
              <span className="btn-text">Обновить</span>
            </Button>
          </Tooltip>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            <span className="btn-text">Добавить</span>
          </Button>
        </Space>
      </div>

      <div className="channel-sidebar__list">
        {isLoading && <div style={{ padding: 16 }}>Загрузка...</div>}
        {channels.map((ch) => (
          <div
            key={ch.id}
            className={`channel-item ${selectedChannelId === ch.id ? 'channel-item--active' : ''}`}
            onClick={() => setSelectedChannelId(ch.id)}
          >
            <div className="channel-item__info">
              <Text strong ellipsis>
                {ch.isUnavailable ? (
                  <Tooltip title="Канал недоступен в Telegram (удалён или закрыт)">
                    <WarningOutlined style={{ color: '#ff4d4f', marginRight: 4 }} />
                  </Tooltip>
                ) : null}
                {ch.name}
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                @{ch.telegramId}
              </Text>
              {ch.lastFetchedAt && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Обновлено: {dayjs.unix(ch.lastFetchedAt).format('DD.MM.YY HH:mm')}
                </Text>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <Space className="channel-item__actions" size={4}>
                <Tooltip title="Загрузить новости">
                  <Button
                    icon={<ReloadOutlined />}
                    size="small"
                    type="text"
                    loading={fetchChannel.isPending && fetchTargetId === ch.id}
                    onClick={(e) => openFetchModal(ch, e)}
                  />
                </Tooltip>
                <Tooltip title="Редактировать">
                  <Button icon={<EditOutlined />} size="small" type="text" onClick={(e) => openEdit(ch, e)} />
                </Tooltip>
                <Tooltip title="Удалить">
                  <Button
                    icon={<DeleteOutlined />}
                    size="small"
                    type="text"
                    danger
                    onClick={(e) => handleDelete(ch, e)}
                  />
                </Tooltip>
              </Space>
              <Badge count={(ch.unreadCount || 0) + (pendingCounts[ch.id] || 0)} size="small" />
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        title={editingChannel ? 'Редактировать канал' : 'Добавить канал'}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={createChannel.isPending || updateChannel.isPending}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }} autoComplete="off">
          <Form.Item
            name="telegramId"
            label="Telegram ID / username"
            rules={[{ required: true, message: 'Введите username канала' }]}
          >
            <Input placeholder="durov, @durov или https://t.me/durov" autoComplete="off" />
          </Form.Item>
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input placeholder="Мой любимый канал" autoComplete="off" />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} placeholder="Необязательно" autoComplete="off" />
          </Form.Item>
          <Form.Item name="channelType" label="Тип канала" initialValue="none">
            <Select>
              <Select.Option value="none">Не выбрано</Select.Option>
              <Select.Option value="link_continuation">Ссылка — продолжение новости</Select.Option>
              <Select.Option value="media_content">Медиа контент (фото/видео)</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="groupId" label="Группа">
            <Select allowClear placeholder="Общее (без группы)">
              {groups.map((g) => (
                <Select.Option key={g.id} value={g.id}>
                  <span style={{ color: g.color }}>■</span> {g.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Fetch Modal */}
      <Modal
        open={fetchModalOpen}
        title="Загрузить новости"
        onCancel={() => setFetchModalOpen(false)}
        onOk={handleFetch}
        okText="Загрузить"
        cancelText="Отмена"
        confirmLoading={fetchChannel.isPending}
      >
        <div style={{ marginTop: 16 }}>
          <p>Загрузить новости начиная с:</p>
          <DatePicker
            showTime
            value={fetchSince}
            onChange={(val) => setFetchSince(val)}
            placeholder="Дата (оставьте пустым для последней)"
            style={{ width: '100%' }}
            format="DD.MM.YYYY HH:mm"
          />
          <p style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
            Если дата не выбрана, будет использована дата последней выгрузки.
          </p>
        </div>
      </Modal>
    </div>
  );
}
