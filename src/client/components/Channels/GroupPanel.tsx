import React, { useState } from 'react';
import { Button, Modal, Form, Input, Tooltip, Dropdown, Typography, theme } from 'antd';
import {
  FolderFilled,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  LockOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import type { Group } from '@shared/types.ts';
import { useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup, useVerifyGroupPIN } from '../../api/groups';
import { useChannels } from '../../api/channels';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';

const { Text } = Typography;

// Preset color palette for groups
const PRESET_COLORS = [
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

interface GroupFormValues {
  name: string;
  color: string;
  pin?: string;
  removePin?: boolean;
}

export function GroupPanel() {
  const { data: groups = [] } = useGroups();
  const { data: channels = [] } = useChannels();
  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup();
  const deleteGroup = useDeleteGroup();
  const verifyPIN = useVerifyGroupPIN();

  const { selectedGroupId, setSelectedGroupId } = useUIStore();
  const { unlockedGroupIds } = useAuthStore();
  const { token } = theme.useToken();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinTarget, setPinTarget] = useState<Group | null>(null);
  const [pinError, setPinError] = useState('');
  const [pinValue, setPinValue] = useState('');

  const [form] = Form.useForm<GroupFormValues>();

  // Count unread per group
  const generalCount = channels.filter((ch) => !ch.groupId).reduce((s, ch) => s + (ch.unreadCount || 0), 0);
  const groupCounts = groups.reduce<Record<number, number>>((acc, g) => {
    acc[g.id] = channels.filter((ch) => ch.groupId === g.id).reduce((s, ch) => s + (ch.unreadCount || 0), 0);
    return acc;
  }, {});

  const openCreate = () => {
    setEditingGroup(null);
    setSelectedColor(PRESET_COLORS[0]);
    form.resetFields();
    form.setFieldValue('color', PRESET_COLORS[0]);
    setModalOpen(true);
  };

  const openEdit = (g: Group) => {
    setEditingGroup(g);
    setSelectedColor(g.color);
    form.setFieldsValue({ name: g.name, color: g.color });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    if (editingGroup) {
      await updateGroup.mutateAsync({
        id: editingGroup.id,
        name: values.name,
        color: selectedColor,
        ...(values.pin ? { pin: values.pin } : {}),
        ...(values.removePin ? { pin: null } : {}),
      });
    } else {
      await createGroup.mutateAsync({
        name: values.name,
        color: selectedColor,
        ...(values.pin ? { pin: values.pin } : {}),
      });
    }
    setModalOpen(false);
  };

  const handleDelete = (g: Group) => {
    Modal.confirm({
      title: `Удалить группу "${g.name}"?`,
      content: 'Каналы из группы переместятся в "Общее".',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: () =>
        deleteGroup.mutateAsync(g.id).then(() => {
          if (selectedGroupId === g.id) setSelectedGroupId(null);
        }),
    });
  };

  const handleGroupClick = (g: Group) => {
    if (g.hasPIN && !unlockedGroupIds.includes(g.id)) {
      setPinTarget(g);
      setPinValue('');
      setPinError('');
      setPinModalOpen(true);
      return;
    }
    setSelectedGroupId(g.id);
  };

  const handleVerifyPIN = async (pin?: string) => {
    if (!pinTarget) return;
    const value = pin ?? pinValue;
    if (!value) return;
    try {
      await verifyPIN.mutateAsync({ id: pinTarget.id, pin: value });
      // token updated in useVerifyGroupPIN.onSuccess → unlockedGroupIds in authStore updated
      setSelectedGroupId(pinTarget.id);
      setPinModalOpen(false);
    } catch {
      setPinError('Неверный PIN');
    }
  };

  const renderGroupItem = (g: Group) => {
    const isActive = selectedGroupId === g.id;
    const isLocked = g.hasPIN && !unlockedGroupIds.includes(g.id);
    const count = groupCounts[g.id] || 0;

    const contextItems = [
      { key: 'edit', label: 'Редактировать', icon: <EditOutlined /> },
      { key: 'delete', label: 'Удалить', icon: <DeleteOutlined />, danger: true },
    ];

    return (
      <Dropdown
        key={g.id}
        menu={{
          items: contextItems,
          onClick: ({ key }) => {
            if (key === 'edit') openEdit(g);
            else if (key === 'delete') handleDelete(g);
          },
        }}
        trigger={['contextMenu']}
      >
        <div
          className={`group-item${isActive ? ' group-item--active' : ''}`}
          style={{ '--group-color': g.color } as React.CSSProperties}
          onClick={() => handleGroupClick(g)}
        >
          <div className="group-item__icon-wrap">
            {isLocked ? (
              <LockOutlined style={{ fontSize: 22, color: g.color }} />
            ) : (
              <FolderFilled style={{ fontSize: 22, color: g.color }} />
            )}
            {count > 0 && (
              <span className="group-item__badge" style={{ background: token.colorPrimary }}>
                {count > 99 ? '99+' : count}
              </span>
            )}
          </div>
          <Text
            className="group-item__label"
            style={{ fontSize: 10, textAlign: 'center', lineHeight: 1.2, marginTop: 2 }}
            ellipsis
          >
            {g.name}
          </Text>
        </div>
      </Dropdown>
    );
  };

  return (
    <div className="group-panel">
      {/* "Общее" — always first */}
      <Tooltip title="Общее (без группы)" placement="right">
        <div
          className={`group-item${selectedGroupId === null ? ' group-item--active' : ''}`}
          style={{ '--group-color': token.colorTextSecondary } as React.CSSProperties}
          onClick={() => setSelectedGroupId(null)}
        >
          <div className="group-item__icon-wrap">
            <FolderFilled style={{ fontSize: 22, color: token.colorTextSecondary }} />
            {generalCount > 0 && (
              <span className="group-item__badge" style={{ background: token.colorPrimary }}>
                {generalCount > 99 ? '99+' : generalCount}
              </span>
            )}
          </div>
          <Text
            className="group-item__label"
            style={{
              fontSize: 10,
              textAlign: 'center',
              lineHeight: 1.2,
              marginTop: 2,
              color: token.colorTextSecondary,
            }}
            ellipsis
          >
            Общее
          </Text>
        </div>
      </Tooltip>

      {/* User groups */}
      {groups.map(renderGroupItem)}

      {/* Add group button */}
      <Tooltip title="Новая группа" placement="right">
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          className="group-panel__add-btn"
          onClick={openCreate}
          size="small"
        />
      </Tooltip>

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        title={editingGroup ? 'Редактировать группу' : 'Новая группа'}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={createGroup.isPending || updateGroup.isPending}
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
                  onClick={() => setSelectedColor(c)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: c,
                    cursor: 'pointer',
                    border: selectedColor === c ? `3px solid ${token.colorText}` : '3px solid transparent',
                    boxShadow: selectedColor === c ? `0 0 0 1px ${c}` : 'none',
                    transition: 'all 0.15s',
                  }}
                />
              ))}
            </div>
          </Form.Item>
          <Form.Item
            name="pin"
            label={
              editingGroup?.hasPIN ? 'Новый PIN (оставьте пустым чтобы не менять)' : 'PIN (необязательно, 4 цифры)'
            }
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

      {/* PIN unlock modal */}
      <Modal
        open={pinModalOpen}
        title={
          <span>
            <LockOutlined style={{ marginRight: 8, color: pinTarget?.color }} />
            Введите PIN для «{pinTarget?.name}»
          </span>
        }
        onCancel={() => setPinModalOpen(false)}
        onOk={() => void handleVerifyPIN()}
        okText="Открыть"
        cancelText="Отмена"
        confirmLoading={verifyPIN.isPending}
        afterOpenChange={(open) => {
          if (open) setPinValue('');
        }}
      >
        <div
          style={{ marginTop: 16, textAlign: 'center' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleVerifyPIN();
          }}
        >
          <Input.OTP
            length={4}
            autoFocus
            value={pinValue}
            onChange={(val) => {
              setPinValue(val);
              setPinError('');
              // Auto-submit when all 4 digits entered
              if (val.length === 4) void handleVerifyPIN(val);
            }}
            styles={{ root: { justifyContent: 'center' }, input: { width: 56, height: 56, fontSize: 24 } }}
          />
          {pinError && (
            <Text type="danger" style={{ display: 'block', marginTop: 8 }}>
              {pinError}
            </Text>
          )}
        </div>
      </Modal>
    </div>
  );
}
