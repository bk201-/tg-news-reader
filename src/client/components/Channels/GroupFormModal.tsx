import React, { useState } from 'react';
import { Modal, Form, Input } from 'antd';
import { UnlockOutlined } from '@ant-design/icons';
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
  const [colorBorder, setColorBorder] = useState(selectedColor);

  // keep local highlight in sync when modal reopens
  const handleColorClick = (c: string) => {
    setColorBorder(c);
    onColorChange(c);
  };

  return (
    <Modal
      open={open}
      title={editingGroup ? 'Редактировать группу' : 'Новая группа'}
      onCancel={onClose}
      onOk={onSave}
      okText="Сохранить"
      cancelText="Отмена"
      confirmLoading={confirmLoading}
      afterOpenChange={(visible) => {
        if (visible) setColorBorder(selectedColor);
      }}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
          <Input placeholder="Новости, Работа, Хобби..." autoComplete="off" />
        </Form.Item>

        <Form.Item label="Цвет">
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
          label={editingGroup?.hasPIN ? 'Новый PIN (оставьте пустым чтобы не менять)' : 'PIN (необязательно, 4 цифры)'}
          rules={[{ pattern: /^\d{4}$/, message: 'PIN должен быть 4 цифры', warningOnly: false }]}
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
              Убрать PIN
            </label>
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
