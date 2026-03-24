import React from 'react';
import { List, Typography, Tag, Space, Button, Spin } from 'antd';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';
import {
  CloudDownloadOutlined,
  DeleteOutlined,
  RocketOutlined,
  WarningOutlined,
  FileTextOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { DownloadTask } from '@shared/types.ts';

const { Text } = Typography;

const useStyles = createStyles(({ css }) => ({
  empty: css`
    padding: 32px 0;
    text-align: center;
  `,
  emptyIcon: css`
    font-size: 32px;
    opacity: 0.3;
  `,
  emptyText: css`
    margin-top: 8px;
  `,
  typeIcon: css`
    font-size: 18px;
    opacity: 0.6;
  `,
  taskTitle: css`
    font-size: 12px;
  `,
  taskUrl: css`
    font-size: 11px;
  `,
  taskError: css`
    font-size: 11px;
    display: block;
    margin-top: 2px;
  `,
}));

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
  const { styles } = useStyles();
  if (tasks.length === 0) {
    return (
      <div className={styles.empty}>
        <CloudDownloadOutlined className={styles.emptyIcon} />
        <div className={styles.emptyText}>
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
                <PictureOutlined className={styles.typeIcon} />
              ) : (
                <FileTextOutlined className={styles.typeIcon} />
              )
            }
            title={
              <Space size={4} wrap>
                <Text strong className={styles.taskTitle}>
                  {task.channelName ?? '—'}
                </Text>
                <TaskStatus task={task} />
              </Space>
            }
            description={
              <>
                <Text className={styles.taskUrl} type="secondary" ellipsis>
                  {task.newsText?.substring(0, 80) || t('downloads.no_text')}
                </Text>
                {task.status === 'failed' && task.error && (
                  <Text type="danger" className={styles.taskError}>
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
