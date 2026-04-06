import React, { useState, useEffect, useRef } from 'react';
import { Button, Drawer, Select, Tooltip, Typography, Badge } from 'antd';
import { FileTextOutlined, ReloadOutlined, VerticalAlignBottomOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import { useServerLogs, LOG_LEVEL_OPTIONS, HOURS_OPTIONS } from '../../api/logs';
import { LogEntryList } from './LogEntryList';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  iconBtn: css`
    color: ${token.colorTextLightSolid};
  `,
  toolbar: css`
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  `,
  meta: css`
    font-size: 11px;
    color: ${token.colorTextQuaternary};
    margin-left: auto;
  `,
  drawerBody: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    padding: 12px 16px;
  `,
}));

export function LogsPanel() {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(2);
  const [level, setLevel] = useState('info');
  const { styles } = useStyles();
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);

  const { data, isFetching, refetch } = useServerLogs(hours, level, open);
  const entries = data?.entries ?? [];
  const errorCount = entries.filter((e) => e.level >= 50).length;

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries.length]);

  const handleScrollBottom = () => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  };

  return (
    <>
      <Tooltip title={t('logs.button_tooltip')}>
        <Badge count={errorCount} size="small" offset={[-4, 4]}>
          <Button
            type="text"
            icon={<FileTextOutlined />}
            onClick={() => setOpen(true)}
            aria-label={t('logs.button_tooltip')}
            className={styles.iconBtn}
          />
        </Badge>
      </Tooltip>

      <Drawer
        title={t('logs.title')}
        placement="right"
        size="large"
        open={open}
        onClose={() => setOpen(false)}
        styles={{ body: { padding: 0 } }}
      >
        <div className={styles.drawerBody}>
          <div className={styles.toolbar}>
            <Select
              size="small"
              value={level}
              onChange={setLevel}
              options={LOG_LEVEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              style={{ width: 90 }}
            />
            <Select
              size="small"
              value={hours}
              onChange={setHours}
              options={HOURS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              style={{ width: 80 }}
            />
            <Button size="small" icon={<ReloadOutlined spin={isFetching} />} onClick={() => void refetch()}>
              {t('logs.refresh')}
            </Button>
            <Button
              size="small"
              icon={<VerticalAlignBottomOutlined />}
              onClick={handleScrollBottom}
              title={t('logs.scroll_bottom')}
            />
            <Text className={styles.meta}>
              {t('logs.entry_count', { count: entries.length })}
              {data && ` · ${t('logs.buffer_size', { count: data.bufferSize })}`}
            </Text>
          </div>

          <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <LogEntryList entries={entries} emptyText={t('logs.empty')} />
          </div>
        </div>
      </Drawer>
    </>
  );
}
