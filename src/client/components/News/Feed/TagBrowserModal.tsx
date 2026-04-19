import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Table, Tag, Button, Badge, Space, Typography, App } from 'antd';
import { NumberOutlined, TagsOutlined, UndoOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import { useFilters, useCreateFilter, useDeleteFilter } from '../../../api/filters';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  tagRow: css`
    cursor: pointer;
    &:hover {
      border-color: ${token.colorPrimary};
      color: ${token.colorPrimary};
    }
  `,
  activeTag: css`
    border-color: ${token.colorPrimary};
    color: ${token.colorPrimary};
    background: ${token.colorPrimaryBg};
  `,
  pendingLabel: css`
    font-size: 11px;
    color: ${token.colorWarning};
  `,
  filteredLabel: css`
    font-size: 11px;
    color: ${token.colorTextSecondary};
  `,
  removingLabel: css`
    font-size: 11px;
    color: ${token.colorError};
    text-decoration: line-through;
  `,
  titleSecondary: css`
    font-size: 12px;
    color: ${token.colorTextSecondary};
    font-weight: normal;
  `,
}));

interface TagBrowserModalProps {
  open: boolean;
  channelId: number;
  tagCounts: { tag: string; count: number }[];
  activeHashTag: string | null;
  onSetHashTag: (tag: string) => void;
  onClose: () => void;
}

type TagRow = { tag: string; count: number };

export function TagBrowserModal({
  open,
  channelId,
  tagCounts,
  activeHashTag,
  onSetHashTag,
  onClose,
}: TagBrowserModalProps) {
  const { t } = useTranslation();
  const { styles, cx } = useStyles();
  const { message } = App.useApp();

  const { data: filters = [] } = useFilters(channelId);
  const createFilter = useCreateFilter(channelId);
  const deleteFilter = useDeleteFilter(channelId);

  // ── Local pending state — only applied on OK ─────────────────────────
  // pendingAdd: full tag strings (e.g. '#crypto') to create as filters
  const [pendingAdd, setPendingAdd] = useState<Set<string>>(new Set());
  // pendingRemove: filter IDs to delete
  const [pendingRemove, setPendingRemove] = useState<Set<number>>(new Set());

  // Reset pending state whenever the modal opens fresh
  useEffect(() => {
    if (open) {
      setPendingAdd(new Set());
      setPendingRemove(new Set());
    }
  }, [open]);

  // norm → filterId map for existing tag filters from API
  const filteredTagMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of filters) {
      if (f.type === 'tag') {
        map.set(f.value.toLowerCase().replace(/^#/, ''), f.id);
      }
    }
    return map;
  }, [filters]);

  // Toggle a tag's pending state (no network calls here)
  const handleToggle = (tag: string) => {
    const norm = tag.replace(/^#/, '');
    const existingId = filteredTagMap.get(norm);

    if (existingId !== undefined) {
      setPendingRemove((prev) => {
        const next = new Set(prev);
        if (next.has(existingId)) next.delete(existingId);
        else next.add(existingId);
        return next;
      });
    } else {
      setPendingAdd((prev) => {
        const next = new Set(prev);
        if (next.has(tag)) next.delete(tag);
        else next.add(tag);
        return next;
      });
    }
  };

  // Commit all pending changes on OK
  const handleOk = async () => {
    if (pendingAdd.size === 0 && pendingRemove.size === 0) {
      onClose();
      return;
    }

    await Promise.all([
      ...[...pendingAdd].map((tag) => createFilter.mutateAsync({ name: tag, type: 'tag', value: tag.toLowerCase() })),
      ...[...pendingRemove].map((id) => deleteFilter.mutateAsync(id)),
    ]);

    void message.success(t('tags.changes_applied', { count: pendingAdd.size + pendingRemove.size }));
    onClose();
  };

  const isPendingChanges = pendingAdd.size > 0 || pendingRemove.size > 0;
  const isCommitting = createFilter.isPending || deleteFilter.isPending;
  const totalChanges = pendingAdd.size + pendingRemove.size;

  const columns = [
    {
      title: t('tags.col_tag'),
      key: 'tag',
      render: (_: unknown, record: TagRow) => {
        const isActive = !!activeHashTag && activeHashTag.toLowerCase() === record.tag.toLowerCase();
        return (
          <Tag
            icon={<NumberOutlined />}
            className={cx(styles.tagRow, isActive && styles.activeTag)}
            onClick={() => {
              onSetHashTag(record.tag);
              onClose();
            }}
          >
            {record.tag.replace(/^#/, '')}
          </Tag>
        );
      },
    },
    {
      title: t('tags.col_count'),
      dataIndex: 'count',
      key: 'count',
      width: 80,
      defaultSortOrder: 'descend' as const,
      sorter: (a: TagRow, b: TagRow) => a.count - b.count,
      render: (count: number) => <Badge count={count} color="blue" overflowCount={999} showZero />,
    },
    {
      title: '',
      key: 'actions',
      width: 180,
      render: (_: unknown, record: TagRow) => {
        const norm = record.tag.replace(/^#/, '');
        const existingId = filteredTagMap.get(norm);
        const isPendingRm = existingId !== undefined && pendingRemove.has(existingId);
        const isPendingAd = pendingAdd.has(record.tag);

        // State 1: existing filter, not pending remove → "Filtered" + remove button
        if (existingId !== undefined && !isPendingRm) {
          return (
            <Space size={4}>
              <Text className={styles.filteredLabel}>{t('tags.filtered')}</Text>
              <Button
                icon={<UndoOutlined />}
                size="small"
                type="text"
                danger
                title={t('tags.remove_filter')}
                onClick={() => handleToggle(record.tag)}
              />
            </Space>
          );
        }

        // State 2: existing filter, pending remove → "Removing…" + undo
        if (existingId !== undefined && isPendingRm) {
          return (
            <Space size={4}>
              <Text className={styles.removingLabel}>{t('tags.pending_remove')}</Text>
              <Button
                icon={<UndoOutlined />}
                size="small"
                type="text"
                title={t('tags.undo')}
                onClick={() => handleToggle(record.tag)}
              />
            </Space>
          );
        }

        // State 3: pending add → "Adding…" + undo
        if (isPendingAd) {
          return (
            <Space size={4}>
              <Text className={styles.pendingLabel}>{t('tags.pending_add')}</Text>
              <Button
                icon={<UndoOutlined />}
                size="small"
                type="text"
                title={t('tags.undo')}
                onClick={() => handleToggle(record.tag)}
              />
            </Space>
          );
        }

        // State 4: no filter, not pending → "Add to filters" button
        return (
          <Button size="small" type="text" onClick={() => handleToggle(record.tag)}>
            {t('tags.add_filter')}
          </Button>
        );
      },
    },
  ];

  return (
    <Modal
      open={open}
      title={
        <Space>
          <TagsOutlined />
          <span>{t('tags.title')}</span>
          {tagCounts.length > 0 && <span className={styles.titleSecondary}>· {tagCounts.length}</span>}
        </Space>
      }
      onCancel={onClose}
      onOk={() => void handleOk()}
      okText={isPendingChanges ? t('tags.ok_with_changes', { count: totalChanges }) : t('common.close')}
      cancelText={t('common.cancel')}
      cancelButtonProps={{ style: { display: isPendingChanges ? undefined : 'none' } }}
      okButtonProps={{ loading: isCommitting }}
      width={520}
    >
      <Table
        dataSource={tagCounts}
        columns={columns}
        rowKey="tag"
        size="small"
        pagination={tagCounts.length > 20 ? { pageSize: 20, showSizeChanger: false, size: 'small' } : false}
        locale={{ emptyText: t('tags.empty') }}
      />
    </Modal>
  );
}
