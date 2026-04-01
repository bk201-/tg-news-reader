import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Drawer, Progress, Spin, Typography, Alert } from 'antd';
import { CopyOutlined, CloseOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import { message } from 'antd';
import { streamDigest, type DigestParams } from '../../api/digest';
import { useUIStore } from '../../store/uiStore';
import { DigestBody } from './DigestBody';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  body: css`
    padding: 16px 20px;
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  spinner: css`
    display: flex;
    align-items: center;
    gap: 8px;
    color: ${token.colorTextSecondary};
  `,
  prefetchWrap: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px 0 8px;
  `,
  prefetchLabel: css`
    font-size: 13px;
    color: ${token.colorTextSecondary};
  `,
  prefetchError: css`
    font-size: 12px;
    color: ${token.colorError};
  `,
  footer: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0 0;
    border-top: 1px solid ${token.colorBorderSecondary};
    flex-shrink: 0;
  `,
  poweredBy: css`
    font-size: 12px;
    color: ${token.colorTextSecondary};
  `,
}));

interface DigestDrawerProps {
  open: boolean;
  params: DigestParams;
  onClose: () => void;
}

export function DigestDrawer({ open, params, onClose }: DigestDrawerProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();
  const [text, setText] = useState('');
  const [refMap, setRefMap] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefetchProgress, setPrefetchProgress] = useState<{
    done: number;
    total: number;
    errors: number;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { setSelectedNewsId } = useUIStore();

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setText('');
    setRefMap({});
    setError(null);
    setPrefetchProgress(null);
    setLoading(true);

    try {
      for await (const event of streamDigest(params, ctrl.signal)) {
        if (event.type === 'chunk') {
          setPrefetchProgress(null); // clear circle on first chunk
          setText((prev) => prev + event.content);
        } else if (event.type === 'ref_map') {
          setRefMap(event.map);
        } else if (event.type === 'prefetch_progress') {
          setPrefetchProgress({ done: event.done, total: event.total, errors: event.errors });
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message ?? t('digest.error_generic'));
    } finally {
      setLoading(false);
    }
  }, [params, t]);

  useEffect(() => {
    if (open) {
      void run();
    } else {
      abortRef.current?.abort();
      setText('');
      setRefMap({});
      setError(null);
      setPrefetchProgress(null);
      setLoading(false);
    }
  }, [open, run]);

  const handleRefClick = useCallback(
    (newsId: number) => {
      setSelectedNewsId(newsId);
      onClose();
    },
    [setSelectedNewsId, onClose],
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    void message.success(t('digest.copied'));
  };

  const isPrefetching = loading && prefetchProgress !== null;

  return (
    <Drawer
      title={t('digest.title')}
      placement="right"
      width={520}
      open={open}
      onClose={onClose}
      closeIcon={<CloseOutlined />}
      styles={{ body: { padding: 0 } }}
    >
      <div className={styles.body}>
        {error && <Alert type="error" message={error} showIcon />}

        {isPrefetching && (
          <div className={styles.prefetchWrap}>
            <Progress
              type="circle"
              size={80}
              percent={Math.round(((prefetchProgress.done + prefetchProgress.errors) / prefetchProgress.total) * 100)}
            />
            <Text className={styles.prefetchLabel}>
              {t('digest.prefetching', {
                done: prefetchProgress.done,
                total: prefetchProgress.total,
              })}
            </Text>
            {prefetchProgress.errors > 0 && (
              <Text className={styles.prefetchError}>
                {t('digest.prefetching_errors', { errors: prefetchProgress.errors })}
              </Text>
            )}
          </div>
        )}

        {loading && !isPrefetching && (
          <div className={styles.spinner}>
            <Spin size="small" />
            <Text type="secondary">{t('digest.generating')}</Text>
          </div>
        )}

        {text && <DigestBody text={text} refMap={refMap} onRefClick={handleRefClick} />}

        {!loading && !text && !error && <Text type="secondary">{t('digest.empty')}</Text>}

        {text && !loading && (
          <div className={styles.footer}>
            <span className={styles.poweredBy}>{t('digest.powered_by')}</span>
            <Button icon={<CopyOutlined />} size="small" onClick={() => void handleCopy()}>
              {t('digest.copy')}
            </Button>
          </div>
        )}
      </div>
    </Drawer>
  );
}
