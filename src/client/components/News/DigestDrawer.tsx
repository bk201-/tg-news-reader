import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Drawer, Spin, Typography, Alert } from 'antd';
import { CopyOutlined, CloseOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { streamDigest, type DigestParams } from '../../api/digest';
import { message } from 'antd';

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
  markdown: css`
    font-size: 14px;
    line-height: 1.7;
    h2 {
      font-size: 16px;
      font-weight: 600;
      margin: 16px 0 6px;
      color: ${token.colorText};
    }
    h3 {
      font-size: 14px;
      font-weight: 600;
      margin: 12px 0 4px;
      color: ${token.colorText};
    }
    ul {
      padding-left: 20px;
      margin: 4px 0;
    }
    li {
      margin: 3px 0;
    }
    strong {
      color: ${token.colorText};
    }
    p {
      margin: 6px 0;
    }
  `,
  spinner: css`
    display: flex;
    align-items: center;
    gap: 8px;
    color: ${token.colorTextSecondary};
  `,
  footer: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0 0;
    border-top: 1px solid ${token.colorBorderSecondary};
    flex-shrink: 0;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setText('');
    setError(null);
    setLoading(true);

    try {
      for await (const chunk of streamDigest(params, ctrl.signal)) {
        setText((prev) => prev + chunk);
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
      setError(null);
      setLoading(false);
    }
  }, [open, run]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    void message.success(t('digest.copied'));
  };

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

        {loading && (
          <div className={styles.spinner}>
            <Spin size="small" />
            <Text type="secondary">{t('digest.generating')}</Text>
          </div>
        )}

        {text && (
          <div className={styles.markdown}>
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        )}

        {!loading && !text && !error && <Text type="secondary">{t('digest.empty')}</Text>}

        {text && !loading && (
          <div className={styles.footer}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('digest.powered_by')}
            </Text>
            <Button icon={<CopyOutlined />} size="small" onClick={() => void handleCopy()}>
              {t('digest.copy')}
            </Button>
          </div>
        )}
      </div>
    </Drawer>
  );
}
