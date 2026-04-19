import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Drawer, Progress, Typography, message } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import { DigestBatchPanel } from './DigestBatchPanel';
import { useBatchDigest, type BatchDigestStatus } from './useBatchDigest';
import { useBatchQueue } from './useBatchQueue';
import { saveBatchResult, loadBatchResult, type BatchScope } from './batchPersistence';
import { DigestDrawer } from './DigestDrawer';
import type { DigestParams } from '../../../api/digest';
import { useMarkAllRead } from '../../../api/news';

const { Text } = Typography;

/** Batch size (news items per batch). */
export const DIGEST_BATCH_SIZE = 50;
/**
 * Max concurrent batches running at once. Each batch is an SSE stream that
 * polls the server every second during article prefetch — keep this low so
 * the server-side worker pool (only a few workers can parse jsdom) is not
 * overwhelmed by simultaneous digest requests.
 */
export const DIGEST_MAX_PARALLEL = 3;

const useStyles = createStyles(({ css, token }) => ({
  body: css`
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    overflow-y: auto;
  `,
  header: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  counter: css`
    font-size: 13px;
    color: ${token.colorTextSecondary};
    flex-shrink: 0;
  `,
  overallProgress: css`
    flex: 1;
    max-width: 240px;
  `,
  list: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
}));

interface DigestProgressDrawerProps {
  open: boolean;
  /** All visible newsIds in chronological order (oldest first). */
  newsIds: readonly number[];
  /** Extra digest params (since/until/channelIds) — newsIds is always overridden per batch. */
  baseParams: Omit<DigestParams, 'newsIds'>;
  /** Scope for localStorage persistence. */
  scope: BatchScope;
  onClose: () => void;
}

export function DigestProgressDrawer({ open, newsIds, baseParams, scope, onClose }: DigestProgressDrawerProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();

  // Stable per-batch slicing
  const batches = useMemo(() => {
    const chunks: number[][] = [];
    for (let i = 0; i < newsIds.length; i += DIGEST_BATCH_SIZE) {
      chunks.push(newsIds.slice(i, i + DIGEST_BATCH_SIZE));
    }
    return chunks;
  }, [newsIds]);

  const queue = useBatchQueue(batches.length, DIGEST_MAX_PARALLEL);

  const [doneCount, setDoneCount] = useState(0);
  const [digestOpenedSet, setDigestOpenedSet] = useState<Set<number>>(new Set());
  const [drawerBatchIndex, setDrawerBatchIndex] = useState<number | null>(null);

  // Per-batch cached/live results, keyed by index
  const [batchResults, setBatchResults] = useState<Record<number, { result: string; refMap: Record<number, number> }>>(
    {},
  );

  // Hold latest batches/scope in refs so memoized callbacks can read them without
  // being invalidated on every render (which would invalidate BatchRow memo).
  const batchesRef = useRef(batches);
  batchesRef.current = batches;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  // Reset when the feed changes or drawer re-opens
  useEffect(() => {
    if (!open) return;
    setDigestOpenedSet(new Set());
    setDrawerBatchIndex(null);
    // Pre-fill results from localStorage
    const restored: Record<number, { result: string; refMap: Record<number, number> }> = {};
    let restoredDone = 0;
    batches.forEach((ids, i) => {
      const cached = loadBatchResult(scope, i, ids);
      if (cached) {
        restored[i] = { result: cached.result, refMap: cached.refMap };
        restoredDone++;
      }
    });
    setBatchResults(restored);
    setDoneCount(restoredDone);
    // oxlint-disable-next-line react/exhaustive-deps
  }, [open, newsIds]);

  // ── Memoized handlers: accept `index` as an arg so the reference stays stable ──
  // across renders. This lets BatchRow be React.memo-wrapped and avoid re-rendering
  // every row on every state change in this parent.

  const handleBatchDone = useCallback(
    (index: number, data: { result: string; refMap: Record<number, number> }) => {
      setBatchResults((prev) => {
        if (prev[index]) return prev; // already stored — idempotent
        return { ...prev, [index]: data };
      });
      setDoneCount((n) => n + 1);
      const ids = batchesRef.current[index];
      if (ids) saveBatchResult(scopeRef.current, index, { ...data, newsIds: [...ids] });
      queue.release(index);
    },
    [queue],
  );

  const handleBatchError = useCallback(
    (index: number) => {
      queue.release(index);
    },
    [queue],
  );

  const handleShow = useCallback((index: number) => {
    setDrawerBatchIndex(index);
    setDigestOpenedSet((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const handleCloseDigestDrawer = useCallback(() => setDrawerBatchIndex(null), []);

  // ── Mark-as-read ──
  const markAllRead = useMarkAllRead();
  const markAllReadMutate = markAllRead.mutate;
  const handleMarkRead = useCallback(
    (index: number) => {
      const ids = batchesRef.current[index];
      if (!ids || ids.length === 0) return;
      markAllReadMutate({ newsIds: [...ids] });
      void message.success(t('digest.batch_marked_count', { count: ids.length }));
    },
    [markAllReadMutate, t],
  );

  const handleRetry = useCallback(
    (index: number) => {
      queue.activate(index);
    },
    [queue],
  );

  const total = batches.length;
  const activeBatch = drawerBatchIndex !== null ? batchResults[drawerBatchIndex] : null;

  // Memoized so DigestDrawer does not think params changed on every parent re-render.
  const activeDigestParams = useMemo<DigestParams | null>(() => {
    if (drawerBatchIndex === null) return null;
    const ids = batches[drawerBatchIndex];
    if (!ids) return null;
    return { ...baseParams, newsIds: [...ids] };
  }, [drawerBatchIndex, batches, baseParams]);

  return (
    <>
      <Drawer
        title={t('digest.progress_title', { count: total })}
        placement="right"
        size="large"
        open={open}
        onClose={onClose}
        closeIcon={<CloseOutlined />}
        styles={{ body: { padding: 0 } }}
      >
        <div className={styles.body}>
          <div className={styles.header}>
            <Text className={styles.counter}>{t('digest.batch_count_label', { done: doneCount, total })}</Text>
            <Progress
              percent={total > 0 ? Math.round((doneCount / total) * 100) : 0}
              size="small"
              className={styles.overallProgress}
            />
          </div>
          <div className={styles.list}>
            {batches.map((batchIds, i) => (
              <BatchRow
                key={`${i}-${batchIds[0]}-${batchIds[batchIds.length - 1]}`}
                index={i}
                newsIds={batchIds}
                baseParams={baseParams}
                enabled={queue.enabled.has(i)}
                cached={batchResults[i]}
                fromItem={i * DIGEST_BATCH_SIZE + 1}
                toItem={i * DIGEST_BATCH_SIZE + batchIds.length}
                digestOpened={digestOpenedSet.has(i)}
                onDone={handleBatchDone}
                onError={handleBatchError}
                onShow={handleShow}
                onMarkRead={handleMarkRead}
                onRetry={handleRetry}
              />
            ))}
          </div>
        </div>
      </Drawer>

      {activeBatch && activeDigestParams && (
        <DigestDrawer
          open
          params={activeDigestParams}
          onClose={handleCloseDigestDrawer}
          initialText={activeBatch.result}
          initialRefMap={activeBatch.refMap}
        />
      )}
    </>
  );
}

// ─── Per-batch row (owns one useBatchDigest instance) ────────────────────────

interface BatchRowProps {
  index: number;
  newsIds: readonly number[];
  baseParams: Omit<DigestParams, 'newsIds'>;
  enabled: boolean;
  cached: { result: string; refMap: Record<number, number> } | undefined;
  fromItem: number;
  toItem: number;
  digestOpened: boolean;
  onDone: (index: number, data: { result: string; refMap: Record<number, number> }) => void;
  onError: (index: number) => void;
  onShow: (index: number) => void;
  onMarkRead: (index: number) => void;
  onRetry: (index: number) => void;
}

const BatchRow = memo(function BatchRow({
  index,
  newsIds,
  baseParams,
  enabled,
  cached,
  fromItem,
  toItem,
  digestOpened,
  onDone,
  onError,
  onShow,
  onMarkRead,
  onRetry,
}: BatchRowProps) {
  const hasCached = !!cached;
  const batch = useBatchDigest(newsIds, baseParams, enabled && !hasCached);

  // Keep latest parent callbacks in refs so the terminal-transition effect has no
  // callback deps — otherwise a parent re-render would reset lastStatusRef logic.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Notify parent on terminal state transitions (exactly once per transition)
  const lastStatusRef = useRef<BatchDigestStatus | 'cached-done'>(hasCached ? 'cached-done' : 'idle');
  useEffect(() => {
    if (hasCached) {
      lastStatusRef.current = 'cached-done';
      return;
    }
    if (batch.status === 'done' && lastStatusRef.current !== 'done') {
      lastStatusRef.current = 'done';
      onDoneRef.current(index, { result: batch.result, refMap: batch.refMap });
    } else if (batch.status === 'error' && lastStatusRef.current !== 'error') {
      lastStatusRef.current = 'error';
      onErrorRef.current(index);
    } else if (batch.status !== 'done' && batch.status !== 'error') {
      lastStatusRef.current = batch.status;
    }
    // oxlint-disable-next-line react/exhaustive-deps
  }, [batch.status, hasCached, index]);

  // Stable per-row handlers bound to `index`. useCallback keeps refs stable so
  // DigestBatchPanel (also memo) does not re-render unless state actually changes.
  const batchRetry = batch.retry;
  const handleShowClick = useCallback(() => onShow(index), [onShow, index]);
  const handleMarkReadClick = useCallback(() => onMarkRead(index), [onMarkRead, index]);
  const handleRetryClick = useCallback(() => {
    onRetry(index);
    batchRetry();
  }, [onRetry, index, batchRetry]);

  const effectiveStatus: BatchDigestStatus = hasCached ? 'done' : batch.status;
  const effectiveError = hasCached ? null : batch.error;
  const effectiveProgress = hasCached ? null : batch.progress;

  return (
    <DigestBatchPanel
      index={index}
      fromItem={fromItem}
      toItem={toItem}
      status={effectiveStatus}
      progress={effectiveProgress}
      error={effectiveError}
      digestOpened={digestOpened}
      onShow={handleShowClick}
      onMarkRead={handleMarkReadClick}
      onRetry={handleRetryClick}
    />
  );
});
