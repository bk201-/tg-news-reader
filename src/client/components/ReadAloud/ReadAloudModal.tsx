import {
  CaretRightOutlined,
  PauseOutlined,
  RobotOutlined,
  SoundOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { Alert, Button, Modal, Progress, Tooltip, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { splitSentences } from './splitSentences';
import { useNativeTts } from './useNativeTts';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  meta: css`
    color: ${token.colorTextSecondary};
    font-size: 13px;
    margin-bottom: 16px;
  `,
  choiceRow: css`
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 16px;
  `,
  choiceButton: css`
    flex: 1 1 0;
    min-width: 160px;
    height: 56px;
  `,
  playerWrap: css`
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  controlsRow: css`
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
  `,
  positionLine: css`
    text-align: center;
    color: ${token.colorTextSecondary};
    font-size: 12px;
  `,
  stopRow: css`
    display: flex;
    justify-content: flex-end;
  `,
}));

const ICON_NATIVE = <SoundOutlined />;
const ICON_AI = <RobotOutlined />;
const ICON_PLAY = <CaretRightOutlined />;
const ICON_PAUSE = <PauseOutlined />;
const ICON_PREV = <StepBackwardOutlined />;
const ICON_NEXT = <StepForwardOutlined />;
const ICON_STOP = <StopOutlined />;

export interface ReadAloudModalProps {
  open: boolean;
  onClose: () => void;
  text: string;
  title?: string;
}

type ModalMode = 'choice' | 'native';

export function ReadAloudModal({ open, onClose, text, title }: ReadAloudModalProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  const sentences = useMemo(() => splitSentences(text), [text]);
  const charCount = text.length;
  const tts = useNativeTts(sentences);

  const [mode, setMode] = useState<ModalMode>('choice');

  // Reset to choice state and stop playback whenever the modal closes/opens with new text.
  useEffect(() => {
    if (!open) {
      tts.stop();
      setMode('choice');
    }
    // Intentionally not including `tts` — its identity changes every render and we only want
    // to react to open/text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text]);

  const handlePickNative = useCallback(() => {
    if (!tts.supported || sentences.length === 0) return;
    setMode('native');
    tts.start(0);
  }, [tts, sentences.length]);

  const handlePlayPause = useCallback(() => {
    if (tts.status === 'playing') tts.pause();
    else if (tts.status === 'paused') tts.resume();
    else tts.start(tts.currentIndex);
  }, [tts]);

  const handleStop = useCallback(() => {
    tts.stop();
    setMode('choice');
  }, [tts]);

  const modalTitle = title ? `${t('tts.modal_title')} — ${title}` : t('tts.modal_title');
  const progressPct =
    tts.total > 0 ? Math.round(((Math.min(tts.currentIndex, tts.total - 1) + 1) / tts.total) * 100) : 0;

  return (
    <Modal title={modalTitle} open={open} onCancel={onClose} footer={null} destroyOnHidden>
      <div className={styles.meta}>
        <Text type="secondary">{t('tts.char_count', { count: charCount })}</Text>
      </div>

      {mode === 'choice' && (
        <>
          {!tts.supported && <Alert type="warning" title={t('tts.native_unsupported')} showIcon />}
          {tts.supported && sentences.length === 0 && <Alert type="warning" title={t('tts.empty_text')} showIcon />}
          <div className={styles.choiceRow}>
            <Button
              className={styles.choiceButton}
              icon={ICON_NATIVE}
              onClick={handlePickNative}
              disabled={!tts.supported || sentences.length === 0}
              size="large"
            >
              {t('tts.choice_native')}
            </Button>
            <Tooltip title={t('tts.ai_coming_soon')}>
              <Button className={styles.choiceButton} icon={ICON_AI} disabled size="large">
                {t('tts.choice_ai')}
              </Button>
            </Tooltip>
          </div>
        </>
      )}

      {mode === 'native' && (
        <div className={styles.playerWrap}>
          <div className={styles.controlsRow}>
            <Tooltip title={t('tts.prev_tooltip')}>
              <Button
                icon={ICON_PREV}
                shape="circle"
                onClick={tts.prev}
                disabled={tts.currentIndex <= 0}
                aria-label={t('tts.prev_tooltip')}
              />
            </Tooltip>
            <Tooltip title={tts.status === 'playing' ? t('tts.pause_tooltip') : t('tts.play_tooltip')}>
              <Button
                icon={tts.status === 'playing' ? ICON_PAUSE : ICON_PLAY}
                shape="circle"
                size="large"
                type="primary"
                onClick={handlePlayPause}
                aria-label={tts.status === 'playing' ? t('tts.pause_tooltip') : t('tts.play_tooltip')}
              />
            </Tooltip>
            <Tooltip title={t('tts.next_tooltip')}>
              <Button
                icon={ICON_NEXT}
                shape="circle"
                onClick={tts.next}
                disabled={tts.currentIndex >= tts.total - 1}
                aria-label={t('tts.next_tooltip')}
              />
            </Tooltip>
          </div>

          <Progress percent={progressPct} showInfo={false} />

          <div className={styles.positionLine}>
            {t('tts.position', {
              current: Math.min(tts.currentIndex + 1, tts.total),
              total: tts.total,
            })}
          </div>

          <div className={styles.stopRow}>
            <Button icon={ICON_STOP} onClick={handleStop} size="small">
              {t('tts.stop')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
