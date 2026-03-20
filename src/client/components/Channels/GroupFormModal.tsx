import React, { useState } from 'react';
import { Modal, Form, Input } from 'antd';
import { UnlockOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { FormInstance } from 'antd';
import type { Group } from '@shared/types.ts';

export const PRESET_COLORS = [
  '#1677ff', // blue (default)
  '#52c41a', // green
  '#fa8c16', // orange
  '#eb2f96', // pink
  '#722ed1', // purple
  '#13c2c2', // cyan
  '#f5222d', // red
  '#faad14', // gold
  '#8c8c8c', // gray
  '#2f54eb', // geekblue
];

export interface GroupFormValues {
  name: string;
  color: string;
  pin?: string;
  removePin?: boolean;
}

interface GroupFormModalProps {
  open: boolean;
  editingGroup: Group | null;
  form: FormInstance<GroupFormValues>;
  selectedColor: string;
  onColorChange: (color: string) => void;
  confirmLoading: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function GroupFormModal({
  open,
  editingGroup,
  form,
  selectedColor,
  onColorChange,
  confirmLoading,
  onClose,
  onSave,
}: GroupFormModalProps) {
  const { t } = useTranslation();
  const [colorBorder, setColorBorder] = useState(selectedColor);

  // keep local highlight in sync when modal reopens
  const handleColorClick = (c: string) => {
    setColorBorder(c);
    onColorChange(c);
  };

  return (
    <Modal
      open={open}
      title={editingGroup ? t('groups.form.title_edit') : t('groups.form.title_add')}
      onCancel={onClose}
      onOk={onSave}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      confirmLoading={confirmLoading}
      afterOpenChange={(visible) => {
        if (visible) setColorBorder(selectedColor);
      }}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item name="name" label={t('groups.form.name_label')} rules={[{ required: true, message: t('groups.form.name_required') }]}>
          <Input placeholder={t('groups.form.name_placeholder')} autoComplete="off" />
        </Form.Item>

        <Form.Item label={t('groups.form.color_label')}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRESET_COLORS.map((c) => (
              <div
                key={c}
                onClick={() => handleColorClick(c)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: c,
                  cursor: 'pointer',
                  border: colorBorder === c ? `3px solid rgba(0,0,0,0.35)` : '3px solid transparent',
                  boxShadow: colorBorder === c ? `0 0 0 2px ${c}` : 'none',
                  transition: 'all 0.15s',
                }}
              />
            ))}
          </div>
        </Form.Item>

        <Form.Item
          name="pin"
          label={editingGroup?.hasPIN ? t('groups.form.pin_label_existing') : t('groups.form.pin_label_new')}
          rules={[{ pattern: /^\d{4}$/, message: t('groups.form.pin_pattern'), warningOnly: false }]}
        >
          <Input.Password
            placeholder="1234"
            maxLength={4}
            autoComplete="new-password"
            inputMode="numeric"
            style={{ letterSpacing: '0.3em' }}
          />
        </Form.Item>

        {editingGroup?.hasPIN && (
          <Form.Item name="removePin" valuePropName="checked">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" onChange={(e) => form.setFieldValue('removePin', e.target.checked)} />
              <UnlockOutlined />
              {t('groups.form.remove_pin')}
            </label>
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
