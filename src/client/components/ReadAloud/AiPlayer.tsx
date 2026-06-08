import { ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { Alert, Button, Progress, Spin, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGenerateTts, useTtsAudioUrl, useTtsStatus } from '../../api/tts';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  wrap: css`
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  loading: css`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px;
    background: ${token.colorFillTertiary};
    border-radius: ${token.borderRadius}px;
  `,
  loadingText: css`
    color: ${token.colorTextSecondary};
    font-size: 13px;
  `,
  audio: css`
    width: 100%;
  `,
  progress: css`
    flex: 1;
  `,
  footerRow: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
  `,
  poweredBy: css`
    font-size: 11px;
    color: ${token.colorTextSecondary};
  `,
  actions: css`
    display: flex;
    gap: 8px;
  `,
}));

const ICON_STOP = <StopOutlined />;
const ICON_RETRY = <ReloadOutlined />;

export interface AiPlayerProps {
  text: string;
  defaultVoice: string;
  /** Returns to the choice screen and tears down audio + generation. */
  onStop: () => void;
}

/**
 * AI player — kicks off OpenAI TTS generation and plays the resulting MP3 with
 * a native `<audio>` element so the user gets full seek/scrubbing/playback-rate controls.
 *
 * Flow:
 *   1. mount → POST /api/tts → server returns hash (cached=true on hit, false otherwise)
 *   2. when cached=false → poll /status until status=done
 *   3. swap loading spinner for <audio src=ttsAudioUrl(hash) controls autoPlay>
 *   4. on error → show alert + retry button
 */
export function AiPlayer({ text, defaultVoice, onStop }: AiPlayerProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  const [hash, setHash] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const generateMutation = useGenerateTts();
  const statusQuery = useTtsStatus(hash);
  const audioUrl = useTtsAudioUrl(hash);

  // Kick off generation exactly once on mount
  const kickedOffRef = useRef(false);
  const triggerGeneration = useCallback(() => {
    generateMutation.mutate(
      { text, voice: defaultVoice },
      {
        onSuccess: (data) => setHash(data.hash),
      },
    );
  }, [generateMutation, text, defaultVoice]);

  useEffect(() => {
    if (kickedOffRef.current) return;
    kickedOffRef.current = true;
    triggerGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause audio on unmount so it doesn't outlive the modal
  useEffect(() => {
    return () => {
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      const el = audioRef.current;
      if (el && !el.paused) el.pause();
    };
  }, []);

  const handleStop = useCallback(() => {
    const el = audioRef.current;
    if (el && !el.paused) el.pause();
    onStop();
  }, [onStop]);

  const handleRetry = useCallback(() => {
    setHash(null);
    kickedOffRef.current = false;
    generateMutation.reset();
    statusQuery.refetch().catch(() => {});
    triggerGeneration();
    kickedOffRef.current = true;
  }, [generateMutation, statusQuery, triggerGeneration]);

  // ── Render branches ──
  const generateError = generateMutation.error;
  if (generateError) {
    const isUnavailable = generateError.status === 503;
    const isTooLong = generateError.status === 413;
    const msg = isUnavailable
      ? t('tts.ai_unavailable')
      : isTooLong
        ? t('tts.ai_too_long')
        : generateError.message || t('tts.ai_failed');
    return (
      <div className={styles.wrap}>
        <Alert type="error" title={msg} showIcon />
        <div className={styles.actions}>
          {!isUnavailable && !isTooLong && (
            <Button icon={ICON_RETRY} onClick={handleRetry}>
              {t('tts.ai_retry')}
            </Button>
          )}
          <Button icon={ICON_STOP} onClick={onStop}>
            {t('tts.stop')}
          </Button>
        </div>
      </div>
    );
  }

  const status = statusQuery.data;
  const isReady = status?.status === 'done' && audioUrl;
  const isFailed = status?.status === 'failed';
  const isGenerating = !isReady && !isFailed;

  if (isFailed) {
    return (
      <div className={styles.wrap}>
        <Alert type="error" title={status?.error ?? t('tts.ai_failed')} showIcon />
        <div className={styles.actions}>
          <Button icon={ICON_RETRY} onClick={handleRetry}>
            {t('tts.ai_retry')}
          </Button>
          <Button icon={ICON_STOP} onClick={onStop}>
            {t('tts.stop')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {isGenerating && (
        <div className={styles.loading}>
          <Spin size="small" />
          <Text className={styles.loadingText}>
            {status && status.chunksTotal > 1
              ? t('tts.ai_generating_progress', {
                  done: status.chunksDone,
                  total: status.chunksTotal,
                })
              : t('tts.ai_generating')}
          </Text>
          {status && status.chunksTotal > 1 && (
            <Progress
              percent={Math.round((status.chunksDone / status.chunksTotal) * 100)}
              showInfo={false}
              size="small"
              className={styles.progress}
            />
          )}
        </div>
      )}

      {isReady && <audio ref={audioRef} className={styles.audio} src={audioUrl ?? undefined} controls autoPlay />}

      <div className={styles.footerRow}>
        <span className={styles.poweredBy}>{t('tts.ai_powered_by')}</span>
        <Button icon={ICON_STOP} onClick={handleStop} size="small">
          {t('tts.stop')}
        </Button>
      </div>
    </div>
  );
}
