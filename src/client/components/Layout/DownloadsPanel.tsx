import React, { useState } from 'react';
import { Badge, Button, Drawer, Space, Tooltip, Spin } from 'antd';
import { CloudDownloadOutlined, PushpinOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { TaskList } from './DownloadTaskList';
import { useDownloads, useDownloadsSSE, useCancelDownload, usePrioritizeDownload } from '../../api/downloads';
import { useUIStore } from '../../store/uiStore';

/** Header badge button + Drawer (used when panel is NOT pinned).
 *  Also mounts useDownloadsSSE() once for the whole app lifetime. */
export function DownloadsPanel() {
  const [open, setOpen] = useState(false);
  const { data: tasks = [] } = useDownloads();
  const cancelDownload = useCancelDownload();
  const prioritizeDownload = usePrioritizeDownload();
  const { downloadsPanelPinned, toggleDownloadsPanelPin } = useUIStore();
  const { t } = useTranslation();

  // SSE always active — mounted once for the whole app lifetime
  useDownloadsSSE();

  const activeCount = tasks.filter((t) => t.status === 'pending' || t.status === 'processing').length;

  const drawerTitle = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 4 }}>
      <Space size={6}>
        {activeCount > 0 && <Spin size="small" />}
        <span>{activeCount > 0 ? t('downloads.title_active', { count: activeCount }) : t('downloads.title')}</span>
      </Space>
      <Tooltip title={t('downloads.pin_tooltip')} placement="left">
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
      <Tooltip
        title={downloadsPanelPinned ? t('downloads.panel_tooltip_pinned') : t('downloads.panel_tooltip')}
        placement="bottomLeft"
      >
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
