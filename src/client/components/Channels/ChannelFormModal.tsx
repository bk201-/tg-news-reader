import React from 'react';
import { Modal, Form, Input, Select, Spin } from 'antd';
import type { FormInstance } from 'antd';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      title={editingChannel ? t('channels.form.title_edit') : t('channels.form.title_add')}
      onCancel={onClose}
      onOk={onSave}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      confirmLoading={confirmLoading}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }} autoComplete="off">
        <Form.Item
          name="telegramId"
          label={t('channels.form.telegram_id_label')}
          rules={[{ required: true, message: t('channels.form.telegram_id_required') }]}
        >
          <Input placeholder={t('channels.form.telegram_id_placeholder')} autoComplete="off" onBlur={onTelegramIdBlur} />
        </Form.Item>
        <Spin spinning={lookupLoading} size="small">
          <Form.Item name="name" label={t('channels.form.name_label')} rules={[{ required: true, message: t('channels.form.name_required') }]}>
            <Input placeholder={t('channels.form.name_placeholder')} autoComplete="off" />
          </Form.Item>
          <Form.Item name="description" label={t('channels.form.description_label')}>
            <Input.TextArea rows={2} placeholder={t('channels.form.description_placeholder')} autoComplete="off" />
          </Form.Item>
        </Spin>
        <Form.Item name="channelType" label={t('channels.form.channel_type_label')} initialValue="none">
          <Select>
            <Select.Option value="none">{t('channels.form.type_none')}</Select.Option>
            <Select.Option value="link_continuation">{t('channels.form.type_link')}</Select.Option>
            <Select.Option value="media_content">{t('channels.form.type_media')}</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="groupId" label={t('channels.form.group_label')}>
          <Select allowClear placeholder={t('channels.form.group_placeholder')}>
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
