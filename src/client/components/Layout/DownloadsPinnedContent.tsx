import React from 'react';
import { Typography, Space, Button, Tooltip, Spin, theme } from 'antd';
import { PushpinFilled } from '@ant-design/icons';
import { TaskList } from './DownloadTaskList';
import { useDownloads, useCancelDownload, usePrioritizeDownload } from '../../api/downloads';
import { useUIStore } from '../../store/uiStore';

const { Text } = Typography;

/** Inline sidebar rendered next to the news feed when the downloads panel is pinned. */
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
      <div style={{ flex: 1, overflow: 'auto', padding: '0 4px' }}>
        <TaskList tasks={tasks} cancelDownload={cancelDownload} prioritizeDownload={prioritizeDownload} />
      </div>
    </div>
  );
}
