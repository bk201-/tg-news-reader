import { Dropdown, Typography } from 'antd';
import { FolderFilled, LockOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Group } from '@shared/types.ts';
import { useGroupItemStyles } from './groupItemStyles';

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
  const { styles, cx } = useGroupItemStyles(group.color);
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
        role="option"
        aria-selected={isActive}
        tabIndex={0}
        className={cx(styles.item, isActive && styles.itemActive)}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <div className={styles.iconWrap}>
          {isLocked ? (
            <LockOutlined className={styles.icon} style={{ color: group.color }} />
          ) : (
            <FolderFilled className={styles.icon} style={{ color: group.color }} />
          )}
          {count > 0 && <span className={styles.badge}>{count > 999 ? '999+' : count}</span>}
        </div>
        <Text className={styles.label} ellipsis>
          {group.name}
        </Text>
      </div>
    </Dropdown>
  );
}
