import React, { useState } from 'react';
import { Button, Modal, Form, Tooltip, Typography, theme } from 'antd';
import { FolderFilled, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Group } from '@shared/types.ts';
import { useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup, useVerifyGroupPIN } from '../../api/groups';
import { useChannels } from '../../api/channels';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { GroupItem } from './GroupItem';
import { GroupFormModal, PRESET_COLORS } from './GroupFormModal';
import type { GroupFormValues } from './GroupFormModal';
import { GroupPinModal } from './GroupPinModal';

const { Text } = Typography;

export function GroupPanel() {
  const { data: groups = [] } = useGroups();
  const { data: channels = [] } = useChannels();
  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup();
  const deleteGroup = useDeleteGroup();
  const verifyPIN = useVerifyGroupPIN();

  const { selectedGroupId, setSelectedGroupId, pendingCounts } = useUIStore();
  const { unlockedGroupIds } = useAuthStore();
  const { token } = theme.useToken();
  const { t } = useTranslation();

  // ── Form modal state ──────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [form] = Form.useForm<GroupFormValues>();

  // ── PIN modal state ───────────────────────────────────────────────────
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinTarget, setPinTarget] = useState<Group | null>(null);
  const [pinError, setPinError] = useState('');
  const [pinValue, setPinValue] = useState('');

  // ── Unread counts ─────────────────────────────────────────────────────
  const generalCount = channels
    .filter((ch) => !ch.groupId)
    .reduce((s, ch) => s + (ch.unreadCount || 0) + (pendingCounts[ch.id] || 0), 0);
  const groupCounts = groups.reduce<Record<number, number>>((acc, g) => {
    acc[g.id] = channels
      .filter((ch) => ch.groupId === g.id)
      .reduce((s, ch) => s + (ch.unreadCount || 0) + (pendingCounts[ch.id] || 0), 0);
    return acc;
  }, {});

  // ── Handlers ──────────────────────────────────────────────────────────
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
      title: t('groups.delete_confirm_title', { name: g.name }),
      content: t('groups.delete_confirm_content'),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
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
      setSelectedGroupId(pinTarget.id);
      setPinModalOpen(false);
    } catch {
      setPinError(t('groups.pin_modal.wrong_pin'));
    }
  };

  const handlePinChange = (val: string) => {
    setPinValue(val);
    setPinError('');
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="group-panel">
      {/* "Общее" — always first */}
      <Tooltip title={t('groups.general_tooltip')} placement="right">
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
            {t('groups.general')}
          </Text>
        </div>
      </Tooltip>

      {/* User groups */}
      {groups.map((g) => (
        <GroupItem
          key={g.id}
          group={g}
          isActive={selectedGroupId === g.id}
          isLocked={g.hasPIN && !unlockedGroupIds.includes(g.id)}
          count={groupCounts[g.id] || 0}
          onClick={() => handleGroupClick(g)}
          onEdit={() => openEdit(g)}
          onDelete={() => handleDelete(g)}
        />
      ))}

      {/* Add group button */}
      <Tooltip title={t('groups.new_group_tooltip')} placement="right">
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          className="group-panel__add-btn"
          onClick={openCreate}
          size="small"
        />
      </Tooltip>

      <GroupFormModal
        open={modalOpen}
        editingGroup={editingGroup}
        form={form}
        selectedColor={selectedColor}
        onColorChange={setSelectedColor}
        confirmLoading={createGroup.isPending || updateGroup.isPending}
        onClose={() => setModalOpen(false)}
        onSave={() => void handleSave()}
      />

      <GroupPinModal
        open={pinModalOpen}
        pinTarget={pinTarget}
        pinValue={pinValue}
        pinError={pinError}
        confirmLoading={verifyPIN.isPending}
        onClose={() => setPinModalOpen(false)}
        onConfirm={(pin?: string) => void handleVerifyPIN(pin)}
        onPinChange={handlePinChange}
      />
    </div>
  );
}
