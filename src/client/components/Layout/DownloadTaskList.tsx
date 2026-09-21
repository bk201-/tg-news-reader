import { CloudDownloadOutlined } from '@ant-design/icons';
import type { DownloadTask } from '@shared/types.ts';
import { Alert, List, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadTaskRow } from './DownloadTaskRow';

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

export interface TaskMutation {
  mutate: (id: number) => void;
  error?: Error | null;
  isPending?: boolean;
  variables?: number;
}

export interface TaskListProps {
  tasks: DownloadTask[];
  cancelDownload: TaskMutation;
  prioritizeDownload: TaskMutation;
}

export function TaskList({ tasks, cancelDownload, prioritizeDownload }: TaskListProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();
  const mediaTasks = useMemo(() => tasks.filter((task) => task.type === 'media'), [tasks]);
  const articleTasks = useMemo(() => tasks.filter((task) => task.type === 'article'), [tasks]);
  const showGroups = mediaTasks.length > 0 && articleTasks.length > 0;
  const renderItem = useCallback(
    (task: DownloadTask) => (
      <DownloadTaskRow task={task} cancelDownload={cancelDownload} prioritizeDownload={prioritizeDownload} />
    ),
    [cancelDownload, prioritizeDownload],
  );
  const error = cancelDownload.error ?? prioritizeDownload.error;

  return (
    <>
      {error && <Alert type="error" showIcon title={error.message} />}
      {tasks.length === 0 ? (
        <div className={styles.empty}>
          <CloudDownloadOutlined className={styles.emptyIcon} />
          <div className={styles.emptyText}>
            <Typography.Text type="secondary">{t('downloads.empty')}</Typography.Text>
          </div>
        </div>
      ) : showGroups ? (
        <>
          <div className={styles.sectionDivider}>{t('downloads.section_media')}</div>
          <List dataSource={mediaTasks} renderItem={renderItem} />
          <div className={styles.sectionDivider}>{t('downloads.section_articles')}</div>
          <List dataSource={articleTasks} renderItem={renderItem} />
        </>
      ) : (
        <List dataSource={tasks} renderItem={renderItem} />
      )}
    </>
  );
}
