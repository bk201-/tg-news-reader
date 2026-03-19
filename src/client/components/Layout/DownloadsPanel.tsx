import React, { useState } from 'react';
import { Badge, Button, Drawer, List, Typography, Tag, Space, Tooltip, Spin, theme } from 'antd';
import {
  CloudDownloadOutlined,
  DeleteOutlined,
  RocketOutlined,
  WarningOutlined,
  FileTextOutlined,
  PictureOutlined,
  PushpinOutlined,
  PushpinFilled,
} from '@ant-design/icons';
import { useDownloads, useDownloadsSSE, useCancelDownload, usePrioritizeDownload } from '../../api/downloads';
import { useUIStore } from '../../store/uiStore';
import type { DownloadTask } from '@shared/types.ts';

const { Text } = Typography;

function TaskStatus({ task }: { task: DownloadTask }) {
  if (task.status === 'processing') return <Tag color="processing">Загружается</Tag>;
  if (task.status === 'failed')
    return (
      <Tag color="error" icon={<WarningOutlined />}>
        Ошибка
      </Tag>
    );
  if (task.priority >= 10) return <Tag color="warning">Срочно</Tag>;
  return <Tag>В очереди</Tag>;
}

interface TaskListProps {
  tasks: DownloadTask[];
  cancelDownload: { mutate: (id: number) => void };
  prioritizeDownload: { mutate: (id: number) => void };
}

function TaskList({ tasks, cancelDownload, prioritizeDownload }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center' }}>
        <CloudDownloadOutlined style={{ fontSize: 32, opacity: 0.3 }} />
        <div style={{ marginTop: 8 }}>
          <Text type="secondary">Нет активных загрузок</Text>
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
              <Tooltip title="Поднять приоритет" key="boost">
                <Button size="small" icon={<RocketOutlined />} onClick={() => prioritizeDownload.mutate(task.id)} />
              </Tooltip>
            ) : null,
            task.status !== 'processing' ? (
              <Tooltip title="Отменить" key="cancel">
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
                  {task.newsText?.substring(0, 80) || '(без текста)'}
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

/** Inline sidebar rendered next to the news feed when the panel is pinned. */
export function DownloadsPinnedContent() {
  const { token } = theme.useToken();
  const { data: tasks = [] } = useDownloads();
  const cancelDownload = useCancelDownload();
  const prioritizeDownload = usePrioritizeDownload();
  const { toggleDownloadsPanelPin } = useUIStore();
  const activeCount = tasks.filter((t) => t.status === 'pending' || t.status === 'processing').length;

  return (
    <div
      style={{
        width: 300,
        flexShrink: 0,
        borderLeft: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 14px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <Space size={6}>
          {activeCount > 0 && <Spin size="small" />}
          <Text strong style={{ fontSize: 13 }}>
            {activeCount > 0 ? `Загрузки (${activeCount})` : 'Загрузки'}
          </Text>
        </Space>
        <Tooltip title="Открепить панель" placement="left">
          <Button
            type="text"
            icon={<PushpinFilled style={{ color: token.colorPrimary }} />}
            onClick={toggleDownloadsPanelPin}
          />
        </Tooltip>
      </div>
      {/* Task list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 4px' }}>
        <TaskList tasks={tasks} cancelDownload={cancelDownload} prioritizeDownload={prioritizeDownload} />
      </div>
    </div>
  );
}

/** Header badge button + Drawer (used when panel is NOT pinned). */
export function DownloadsPanel() {
  const [open, setOpen] = useState(false);
  const { data: tasks = [] } = useDownloads();
  const cancelDownload = useCancelDownload();
  const prioritizeDownload = usePrioritizeDownload();
  const { downloadsPanelPinned, toggleDownloadsPanelPin } = useUIStore();

  // SSE always active — mounted once for the whole app lifetime
  useDownloadsSSE();

  const activeCount = tasks.filter((t) => t.status === 'pending' || t.status === 'processing').length;

  const drawerTitle = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 4 }}>
      <Space size={6}>
        {activeCount > 0 && <Spin size="small" />}
        <span>{activeCount > 0 ? `Загрузки — ${activeCount} активных` : 'Загрузки'}</span>
      </Space>
      <Tooltip title="Закрепить панель справа" placement="left">
        <Button
          size="small"
          type="text"
          icon={<PushpinOutlined />}
          onClick={() => {
            toggleDownloadsPanelPin();
            setOpen(false);
          }}
        />
      </Tooltip>
    </div>
  );

  return (
    <>
      <Tooltip title={downloadsPanelPinned ? 'Загрузки (закреплена)' : 'Загрузки'} placement="bottomLeft">
        <Badge count={activeCount} size="small" offset={[-4, 4]}>
          <Button
            type="text"
            icon={<CloudDownloadOutlined />}
            onClick={() => {
              if (!downloadsPanelPinned) setOpen(true);
            }}
            style={{ color: '#fff', opacity: downloadsPanelPinned ? 0.75 : 1 }}
          />
        </Badge>
      </Tooltip>

      {!downloadsPanelPinned && (
        <Drawer title={drawerTitle} placement="right" width={420} open={open} onClose={() => setOpen(false)}>
          <TaskList tasks={tasks} cancelDownload={cancelDownload} prioritizeDownload={prioritizeDownload} />
        </Drawer>
      )}
    </>
  );
}
