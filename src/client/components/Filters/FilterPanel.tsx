import React, { useMemo } from 'react';
import { Modal, Form, Input, Select, Button, Table, Switch, Tag, Space, Typography, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { Filter } from '@shared/types.ts';
import { useFilters, useCreateFilter, useUpdateFilter, useDeleteFilter } from '../../api/filters';
import { useUIStore } from '../../store/uiStore';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
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
  summary: css`
    margin-top: 16px;
    padding: 8px 12px;
    background: ${token.colorFillAlter};
    border-radius: 6px;
  `,
}));

interface FilterPanelProps {
  channelId: number;
}

export function FilterPanel({ channelId }: FilterPanelProps) {
  const { filterPanelOpen, setFilterPanelOpen } = useUIStore();
  const { data: filters = [] } = useFilters(channelId);
  const createFilter = useCreateFilter(channelId);
  const updateFilter = useUpdateFilter(channelId);
  const deleteFilter = useDeleteFilter(channelId);
  const [form] = Form.useForm();
  const { t } = useTranslation();
  const { styles } = useStyles();

  const tagFilters = useMemo(() => filters.filter((f) => f.type === 'tag'), [filters]);
  const keywordFilters = useMemo(() => filters.filter((f) => f.type === 'keyword'), [filters]);

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
      width={600}
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
        pagination={false}
        locale={{ emptyText: t('filters.empty') }}
      />

      <div className={styles.summary}>
        <Text strong>{t('filters.active_tags')} </Text>
        {tagFilters
          .filter((f) => f.isActive)
          .map((f) => (
            <Tag key={f.id} color="blue">
              {f.value}
            </Tag>
          ))}
        {tagFilters.filter((f) => f.isActive).length === 0 && <Text type="secondary">{t('filters.none')}</Text>}
        <br />
        <Text strong>{t('filters.keywords')} </Text>
        {keywordFilters
          .filter((f) => f.isActive)
          .map((f) => (
            <Tag key={f.id} color="green">
              {f.value}
            </Tag>
          ))}
        {keywordFilters.filter((f) => f.isActive).length === 0 && <Text type="secondary">{t('filters.none')}</Text>}
      </div>
    </Modal>
  );
}
