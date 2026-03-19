import React from 'react';
import { Modal, Form, Input, Select, Spin } from 'antd';
import type { FormInstance } from 'antd';
import type { Channel, Group } from '@shared/types.ts';

interface ChannelFormModalProps {
  open: boolean;
  editingChannel: Channel | null;
  form: FormInstance;
  groups: Group[];
  lookupLoading: boolean;
  confirmLoading: boolean;
  onClose: () => void;
  onSave: () => void;
  onTelegramIdBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
}

export function ChannelFormModal({
  open,
  editingChannel,
  form,
  groups,
  lookupLoading,
  confirmLoading,
  onClose,
  onSave,
  onTelegramIdBlur,
}: ChannelFormModalProps) {
  return (
    <Modal
      open={open}
      title={editingChannel ? 'Редактировать канал' : 'Добавить канал'}
      onCancel={onClose}
      onOk={onSave}
      okText="Сохранить"
      cancelText="Отмена"
      confirmLoading={confirmLoading}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }} autoComplete="off">
        <Form.Item
          name="telegramId"
          label="Telegram ID / username"
          rules={[{ required: true, message: 'Введите username канала' }]}
        >
          <Input placeholder="durov, @durov или https://t.me/durov" autoComplete="off" onBlur={onTelegramIdBlur} />
        </Form.Item>
        <Spin spinning={lookupLoading} size="small">
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input placeholder="Мой любимый канал" autoComplete="off" />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} placeholder="Необязательно" autoComplete="off" />
          </Form.Item>
        </Spin>
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
  );
}
