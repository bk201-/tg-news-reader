import React from 'react';
import { Dropdown, Typography, theme } from 'antd';
import { FolderFilled, LockOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Group } from '@shared/types.ts';

const { Text } = Typography;

interface GroupItemProps {
  group: Group;
  isActive: boolean;
  isLocked: boolean;
  count: number;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function GroupItem({ group, isActive, isLocked, count, onClick, onEdit, onDelete }: GroupItemProps) {
  const { token } = theme.useToken();
  const { t } = useTranslation();

  return (
    <Dropdown
      menu={{
        items: [
          { key: 'edit', label: t('groups.context_edit'), icon: <EditOutlined /> },
          { key: 'delete', label: t('groups.context_delete'), icon: <DeleteOutlined />, danger: true },
        ],
        onClick: ({ key }) => {
          if (key === 'edit') onEdit();
          else if (key === 'delete') onDelete();
        },
      }}
      trigger={['contextMenu']}
    >
      <div
        className={`group-item${isActive ? ' group-item--active' : ''}`}
        style={{ '--group-color': group.color } as React.CSSProperties}
        onClick={onClick}
      >
        <div className="group-item__icon-wrap">
          {isLocked ? (
            <LockOutlined style={{ fontSize: 22, color: group.color }} />
          ) : (
            <FolderFilled style={{ fontSize: 22, color: group.color }} />
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
          {group.name}
        </Text>
      </div>
    </Dropdown>
  );
}
