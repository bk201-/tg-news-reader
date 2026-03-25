import React, { useMemo } from 'react';
import { Modal, Form, Input, Select, Button, Table, Switch, Tag, Space, Typography, Divider, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { Filter } from '@shared/types.ts';
import { useFilters, useFilterStats, useCreateFilter, useUpdateFilter, useDeleteFilter } from '../../api/filters';
import { useUIStore } from '../../store/uiStore';

const { Text } = Typography;

const useStyles = createStyles(({ css }) => ({
  description: css`
    margin-bottom: 16px;
  `,
  form: css`
    margin-bottom: 16px;
  `,
  formType: css`
    width: 120px;
  `,
  formField: css`
    flex: 1;
  `,
  divider: css`
    margin: 8px 0;
  `,
  metaText: css`
    font-size: 11px;
  `,
  statTag: css`
    cursor: default;
    margin: 0;
  `,
}));

interface FilterPanelProps {
  channelId: number;
}

export function FilterPanel({ channelId }: FilterPanelProps) {
  const { filterPanelOpen, setFilterPanelOpen } = useUIStore();
  const { data: filters = [] } = useFilters(channelId);
  const { data: stats = [] } = useFilterStats(channelId);
  const statsMap = useMemo(() => new Map(stats.map((s) => [s.filterId, s])), [stats]);
  const createFilter = useCreateFilter(channelId);
  const updateFilter = useUpdateFilter(channelId);
  const deleteFilter = useDeleteFilter(channelId);
  const [form] = Form.useForm();
  const { t } = useTranslation();
  const { styles } = useStyles();

  const handleAdd = async () => {
    const values = (await form.validateFields()) as { name: string; type: 'tag' | 'keyword'; value: string };
    await createFilter.mutateAsync(values);
    form.resetFields();
  };

  const handleToggle = (f: Filter, isActive: boolean) => {
    updateFilter.mutate({ id: f.id, isActive: isActive ? 1 : 0 });
  };

  const handleDelete = (f: Filter) => {
    Modal.confirm({
      title: t('filters.delete_confirm_title', { name: f.name }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => deleteFilter.mutateAsync(f.id),
    });
  };

  const columns = [
    {
      title: t('filters.col_name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Filter) => (
        <Space>
          <Tag color={record.type === 'tag' ? 'blue' : 'green'}>{record.type === 'tag' ? '#' : '🔤'}</Tag>
          <Text>{name}</Text>
          <Text type="secondary" className={styles.metaText}>
            ({record.value})
          </Text>
        </Space>
      ),
    },
    {
      title: t('filters.col_active'),
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (isActive: number, record: Filter) => (
        <Switch checked={isActive === 1} size="small" onChange={(v) => handleToggle(record, v)} />
      ),
    },
    {
      title: t('filters.col_stats'),
      key: 'stats',
      width: 70,
      render: (_: unknown, record: Filter) => {
        const s = statsMap.get(record.id);
        const hits7 = s?.hitsLast7 ?? 0;
        const total = s?.hitsTotal ?? 0;
        const tip =
          total > 0
            ? `${t('filters.stats_total', { count: total })}${s?.lastHitDate ? ` · ${s.lastHitDate}` : ''}`
            : t('filters.stats_never');
        return (
          <Tooltip title={tip}>
            <Tag color={hits7 > 0 ? 'blue' : undefined} className={styles.statTag}>
              {hits7}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 40,
      render: (_: unknown, record: Filter) => (
        <Button icon={<DeleteOutlined />} size="small" type="text" danger onClick={() => handleDelete(record)} />
      ),
    },
  ];

  return (
    <Modal
      open={filterPanelOpen}
      title={t('filters.title')}
      onCancel={() => setFilterPanelOpen(false)}
      footer={null}
      width={680}
    >
      <div className={styles.description}>
        <Text type="secondary">{t('filters.description')}</Text>
      </div>

      <Form form={form} layout="inline" className={styles.form}>
        <Form.Item name="type" initialValue="tag" rules={[{ required: true }]}>
          <Select className={styles.formType}>
            <Select.Option value="tag">{t('filters.type_tag')}</Select.Option>
            <Select.Option value="keyword">{t('filters.type_keyword')}</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="name" rules={[{ required: true, message: t('common.none') }]} className={styles.formField}>
          <Input placeholder={t('filters.name_placeholder')} />
        </Form.Item>
        <Form.Item name="value" rules={[{ required: true, message: t('common.none') }]} className={styles.formField}>
          <Input placeholder={t('filters.value_placeholder')} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} loading={createFilter.isPending}>
            {t('filters.add')}
          </Button>
        </Form.Item>
      </Form>

      <Divider className={styles.divider} />

      <Table
        dataSource={filters}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={filters.length > 20 ? { pageSize: 20, showSizeChanger: false, size: 'small' } : false}
        locale={{ emptyText: t('filters.empty') }}
      />
    </Modal>
  );
}
