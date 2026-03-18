import React, { useMemo } from 'react';
import { Modal, Form, Input, Select, Button, Table, Switch, Tag, Space, Typography, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Filter } from '@shared/types.ts';
import { useFilters, useCreateFilter, useUpdateFilter, useDeleteFilter } from '../../api/filters';
import { useUIStore } from '../../store/uiStore';

const { Text } = Typography;

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
      title: `Удалить фильтр "${f.name}"?`,
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: () => deleteFilter.mutateAsync(f.id),
    });
  };

  const columns = [
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Filter) => (
        <Space>
          <Tag color={record.type === 'tag' ? 'blue' : 'green'}>{record.type === 'tag' ? '#' : '🔤'}</Tag>
          <Text>{name}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            ({record.value})
          </Text>
        </Space>
      ),
    },
    {
      title: 'Активен',
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
      title="Управление фильтрами"
      onCancel={() => setFilterPanelOpen(false)}
      footer={null}
      width={600}
    >
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">
          Новости, совпадающие с активными фильтрами, будут <strong>скрыты</strong>. Сначала проверяются теги (#), затем
          ключевые слова.
        </Text>
      </div>

      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="type" initialValue="tag" rules={[{ required: true }]}>
          <Select style={{ width: 120 }}>
            <Select.Option value="tag">Тег #</Select.Option>
            <Select.Option value="keyword">Ключевое слово</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="name" rules={[{ required: true, message: 'Введите название' }]} style={{ flex: 1 }}>
          <Input placeholder="Название фильтра" />
        </Form.Item>
        <Form.Item name="value" rules={[{ required: true, message: 'Введите значение' }]} style={{ flex: 1 }}>
          <Input placeholder="Значение (напр. #news или keyword)" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} loading={createFilter.isPending}>
            Добавить
          </Button>
        </Form.Item>
      </Form>

      <Divider style={{ margin: '8px 0' }} />

      <Table
        dataSource={filters}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        locale={{ emptyText: 'Фильтры не добавлены' }}
      />

      <div style={{ marginTop: 16, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6 }}>
        <Text strong>Активные теги: </Text>
        {tagFilters
          .filter((f) => f.isActive)
          .map((f) => (
            <Tag key={f.id} color="blue">
              {f.value}
            </Tag>
          ))}
        {tagFilters.filter((f) => f.isActive).length === 0 && <Text type="secondary">нет</Text>}
        <br />
        <Text strong>Ключевые слова: </Text>
        {keywordFilters
          .filter((f) => f.isActive)
          .map((f) => (
            <Tag key={f.id} color="green">
              {f.value}
            </Tag>
          ))}
        {keywordFilters.filter((f) => f.isActive).length === 0 && <Text type="secondary">нет</Text>}
      </div>
    </Modal>
  );
}
