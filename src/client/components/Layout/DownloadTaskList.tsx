import React from 'react';
import { List, Typography, Tag, Space, Button, Tooltip, Spin } from 'antd';
import {
  CloudDownloadOutlined,
  DeleteOutlined,
  RocketOutlined,
  WarningOutlined,
  FileTextOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { DownloadTask } from '@shared/types.ts';

const { Text } = Typography;

function TaskStatus({ task }: { task: DownloadTask }) {
  const { t } = useTranslation();
  if (task.status === 'processing') return <Tag color="processing">{t('downloads.status_processing')}</Tag>;
  if (task.status === 'failed')
    return (
      <Tag color="error" icon={<WarningOutlined />}>
        {t('downloads.status_error')}
      </Tag>
    );
  if (task.priority >= 10) return <Tag color="warning">{t('downloads.status_priority')}</Tag>;
  return <Tag>{t('downloads.status_queued')}</Tag>;
}

export interface TaskListProps {
  tasks: DownloadTask[];
  cancelDownload: { mutate: (id: number) => void };
  prioritizeDownload: { mutate: (id: number) => void };
}

export function TaskList({ tasks, cancelDownload, prioritizeDownload }: TaskListProps) {
  const { t } = useTranslation();
  if (tasks.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center' }}>
        <CloudDownloadOutlined style={{ fontSize: 32, opacity: 0.3 }} />
        <div style={{ marginTop: 8 }}>
          <Text type="secondary">{t('downloads.empty')}</Text>
        </div>
      </div>
    );
  }

  return (
    <List
      dataSource={tasks}
      renderItem={(task) => (
        <List.Item
          key={task.id}
          actions={[
            task.status !== 'processing' && task.priority < 10 ? (
              <Tooltip title={t('downloads.boost_tooltip')} placement="left" key="boost">
                <Button size="small" icon={<RocketOutlined />} onClick={() => prioritizeDownload.mutate(task.id)} />
              </Tooltip>
            ) : null,
            task.status !== 'processing' ? (
              <Tooltip title={t('downloads.cancel_tooltip')} placement="left" key="cancel">
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => cancelDownload.mutate(task.id)} />
              </Tooltip>
            ) : null,
          ].filter(Boolean)}
        >
          <List.Item.Meta
            avatar={
              task.status === 'processing' ? (
                <Spin size="small" />
              ) : task.type === 'media' ? (
                <PictureOutlined style={{ fontSize: 18, opacity: 0.6 }} />
              ) : (
                <FileTextOutlined style={{ fontSize: 18, opacity: 0.6 }} />
              )
            }
            title={
              <Space size={4} wrap>
                <Text strong style={{ fontSize: 12 }}>
                  {task.channelName ?? '—'}
                </Text>
                <TaskStatus task={task} />
              </Space>
            }
            description={
              <>
                <Text style={{ fontSize: 11 }} type="secondary" ellipsis>
                  {task.newsText?.substring(0, 80) || t('downloads.no_text')}
                </Text>
                {task.status === 'failed' && task.error && (
                  <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                    {task.error}
                  </Text>
                )}
              </>
            }
          />
        </List.Item>
      )}
    />
  );
}
