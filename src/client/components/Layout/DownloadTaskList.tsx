import {
  CloudDownloadOutlined,
  DeleteOutlined,
  FileTextOutlined,
  PictureOutlined,
  RocketOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { DownloadTask } from '@shared/types.ts';
import { Button, List, Space, Spin, Tag, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MaybeTooltip as Tooltip } from '../common/MaybeTooltip';

const { Text } = Typography;

const ICON_WARNING = <WarningOutlined />;
const ICON_ROCKET = <RocketOutlined />;
const ICON_DELETE = <DeleteOutlined />;
const SPIN_SMALL = <Spin size="small" />;

const useStyles = createStyles(({ css, token }) => ({
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
  sectionDivider: css`
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: ${token.colorTextTertiary};
    padding: 8px 12px 4px;
    border-top: 1px solid ${token.colorBorderSecondary};
    margin-top: 4px;
  `,
}));

function TaskStatus({ task }: { task: DownloadTask }) {
  const { t } = useTranslation();
  if (task.status === 'processing') return <Tag color="processing">{t('downloads.status_processing')}</Tag>;
  if (task.status === 'failed')
    return (
      <Tag color="error" icon={ICON_WARNING}>
        {t('downloads.status_error')}
      </Tag>
    );
  if (task.priority >= 10) return <Tag color="warning">{t('downloads.status_priority')}</Tag>;
  return <Tag>{t('downloads.status_queued')}</Tag>;
}

/** Single download task row — stable handlers + memoized title/description/actions. */
function TaskRow({
  task,
  cancelDownload,
  prioritizeDownload,
  styles,
  t,
}: {
  task: DownloadTask;
  cancelDownload: { mutate: (id: number) => void };
  prioritizeDownload: { mutate: (id: number) => void };
  styles: ReturnType<typeof useStyles>['styles'];
  t: (key: string) => string;
}) {
  const handleBoost = useCallback(() => prioritizeDownload.mutate(task.id), [prioritizeDownload, task.id]);
  const handleCancel = useCallback(() => cancelDownload.mutate(task.id), [cancelDownload, task.id]);

  const actions = useMemo(
    () =>
      [
        task.status !== 'processing' && task.priority < 10 ? (
          <Tooltip title={t('downloads.boost_tooltip')} placement="left" key="boost">
            <Button size="small" icon={ICON_ROCKET} onClick={handleBoost} />
          </Tooltip>
        ) : null,
        task.status !== 'processing' ? (
          <Tooltip title={t('downloads.cancel_tooltip')} placement="left" key="cancel">
            <Button size="small" danger icon={ICON_DELETE} onClick={handleCancel} />
          </Tooltip>
        ) : null,
      ].filter(Boolean),
    [task.status, task.priority, t, handleBoost, handleCancel],
  );

  const avatar = useMemo(() => {
    if (task.status === 'processing') return SPIN_SMALL;
    if (task.type === 'media') return <PictureOutlined className={styles.typeIcon} />;
    return <FileTextOutlined className={styles.typeIcon} />;
  }, [task.status, task.type, styles.typeIcon]);

  const title = useMemo(
    () => (
      <Space size={4} wrap>
        <Text strong className={styles.taskTitle}>
          {task.channelName ?? '—'}
        </Text>
        <TaskStatus task={task} />
      </Space>
    ),
    [styles.taskTitle, task],
  );

  const description = useMemo(
    () => (
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
    ),
    [styles.taskUrl, styles.taskError, task.newsText, task.status, task.error, t],
  );

  return (
    <List.Item key={task.id} actions={actions}>
      <List.Item.Meta avatar={avatar} title={title} description={description} />
    </List.Item>
  );
}

export interface TaskListProps {
  tasks: DownloadTask[];
  cancelDownload: { mutate: (id: number) => void };
  prioritizeDownload: { mutate: (id: number) => void };
}

function TaskItems({
  tasks,
  cancelDownload,
  prioritizeDownload,
  styles,
  t,
}: TaskListProps & { styles: ReturnType<typeof useStyles>['styles']; t: (key: string) => string }) {
  const renderItem = useCallback(
    (task: DownloadTask) => (
      <TaskRow
        task={task}
        cancelDownload={cancelDownload}
        prioritizeDownload={prioritizeDownload}
        styles={styles}
        t={t}
      />
    ),
    [cancelDownload, prioritizeDownload, styles, t],
  );

  return <List dataSource={tasks} renderItem={renderItem} />;
}

export function TaskList({ tasks, cancelDownload, prioritizeDownload }: TaskListProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  const mediaTasks = useMemo(() => tasks.filter((task) => task.type === 'media'), [tasks]);
  const articleTasks = useMemo(() => tasks.filter((task) => task.type === 'article'), [tasks]);
  const showGroups = mediaTasks.length > 0 && articleTasks.length > 0;

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

  if (!showGroups) {
    return (
      <TaskItems
        tasks={tasks}
        cancelDownload={cancelDownload}
        prioritizeDownload={prioritizeDownload}
        styles={styles}
        t={t}
      />
    );
  }

  return (
    <>
      <div className={styles.sectionDivider}>{t('downloads.section_media')}</div>
      <TaskItems
        tasks={mediaTasks}
        cancelDownload={cancelDownload}
        prioritizeDownload={prioritizeDownload}
        styles={styles}
        t={t}
      />
      <div className={styles.sectionDivider}>{t('downloads.section_articles')}</div>
      <TaskItems
        tasks={articleTasks}
        cancelDownload={cancelDownload}
        prioritizeDownload={prioritizeDownload}
        styles={styles}
        t={t}
      />
    </>
  );
}
