import React, { useMemo } from 'react';
import { Modal, Table, Tag, Button, Badge, Space, Typography, App } from 'antd';
import { DeleteOutlined, TagsOutlined, NumberOutlined } from '@ant-design/icons';
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
  filteredLabel: css`
    font-size: 11px;
    color: ${token.colorTextSecondary};
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

  // Build a map: normalised tag value → filter id (for already-filtered tags)
  const filteredTagMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of filters) {
      if (f.type === 'tag') {
        const norm = f.value.toLowerCase().replace(/^#/, '');
        map.set(norm, f.id);
      }
    }
    return map;
  }, [filters]);

  const handleAddFilter = async (tag: string) => {
    await createFilter.mutateAsync({ name: tag, type: 'tag', value: tag.toLowerCase() });
    void message.success(t('tags.filter_added', { tag }));
  };

  const handleRemoveFilter = (filterId: number, tag: string) => {
    deleteFilter.mutate(filterId);
    void message.success(t('tags.filter_removed', { tag }));
  };

  const handleTagClick = (tag: string) => {
    onSetHashTag(tag);
    onClose();
  };

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
            onClick={() => handleTagClick(record.tag)}
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
      width: 170,
      render: (_: unknown, record: TagRow) => {
        const norm = record.tag.toLowerCase().replace(/^#/, '');
        const filterId = filteredTagMap.get(norm);
        if (filterId !== undefined) {
          return (
            <Space size={4}>
              <Text className={styles.filteredLabel}>{t('tags.filtered')}</Text>
              <Button
                icon={<DeleteOutlined />}
                size="small"
                type="text"
                danger
                title={t('tags.remove_filter')}
                onClick={() => handleRemoveFilter(filterId, record.tag)}
                loading={deleteFilter.isPending}
              />
            </Space>
          );
        }
        return (
          <Button
            size="small"
            type="text"
            onClick={() => void handleAddFilter(record.tag)}
            loading={createFilter.isPending}
          >
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
      footer={null}
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
