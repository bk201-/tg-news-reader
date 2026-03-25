import React, { useState } from 'react';
import { Modal, Form, Input, Select, Spin } from 'antd';
import type { FormInstance } from 'antd';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { Channel, Group } from '@shared/types.ts';

const useStyles = createStyles(({ css }) => ({
  form: css`
    margin-top: 16px;
  `,
}));

/** Same normalization as the server — strips URL prefixes, @, and path suffixes. */
function normalizeTelegramId(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^@/, '')
    .split('/')[0];
}

interface ChannelFormModalProps {
  open: boolean;
  editingChannel: Channel | null;
  /** Full list of existing channels — used for duplicate validation */
  allChannels: Channel[];
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
  allChannels,
  form,
  groups,
  lookupLoading,
  confirmLoading,
  onClose,
  onSave,
  onTelegramIdBlur,
}: ChannelFormModalProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();
  const [hasErrors, setHasErrors] = useState(false);

  const telegramIdRules = [
    { required: true, message: t('channels.form.telegram_id_required') },
    {
      validator: (_: unknown, value: string) => {
        if (!value || editingChannel) return Promise.resolve();
        const normalized = normalizeTelegramId(value);
        const dup = allChannels.find((ch) => ch.telegramId.toLowerCase() === normalized.toLowerCase());
        if (dup) return Promise.reject(new Error(t('channels.form.already_exists')));
        return Promise.resolve();
      },
    },
  ];

  return (
    <Modal
      open={open}
      title={editingChannel ? t('channels.form.title_edit') : t('channels.form.title_add')}
      onCancel={onClose}
      onOk={onSave}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      confirmLoading={confirmLoading}
      okButtonProps={{ disabled: hasErrors }}
    >
      <Form
        form={form}
        layout="vertical"
        className={styles.form}
        autoComplete="off"
        onFieldsChange={(_, allFields) => setHasErrors(allFields.some((f) => (f.errors?.length ?? 0) > 0))}
      >
        <Form.Item
          name="telegramId"
          label={t('channels.form.telegram_id_label')}
          rules={telegramIdRules}
          validateTrigger={['onBlur']}
        >
          <Input
            placeholder={t('channels.form.telegram_id_placeholder')}
            autoComplete="off"
            onBlur={onTelegramIdBlur}
          />
        </Form.Item>
        <Spin spinning={lookupLoading} size="small">
          <Form.Item
            name="name"
            label={t('channels.form.name_label')}
            rules={[{ required: true, message: t('channels.form.name_required') }]}
          >
            <Input placeholder={t('channels.form.name_placeholder')} autoComplete="off" />
          </Form.Item>
          <Form.Item name="description" label={t('channels.form.description_label')}>
            <Input.TextArea rows={2} placeholder={t('channels.form.description_placeholder')} autoComplete="off" />
          </Form.Item>
        </Spin>
        <Form.Item name="channelType" label={t('channels.form.channel_type_label')} initialValue="news">
          <Select>
            <Select.Option value="news">{t('channels.form.type_news')}</Select.Option>
            <Select.Option value="news_link">{t('channels.form.type_news_link')}</Select.Option>
            <Select.Option value="media">{t('channels.form.type_media')}</Select.Option>
            <Select.Option value="blog">{t('channels.form.type_blog')}</Select.Option>
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
