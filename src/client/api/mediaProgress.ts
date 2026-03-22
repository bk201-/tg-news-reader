import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { logger } from '../logger';
import type { NewsItem } from '@shared/types.ts';

interface MediaProgressEvent {
  type: 'item' | 'complete';
  newsId?: number;
  localMediaPath?: string;
  done: number;
  total: number;
}

export function useMediaProgressSSE(
  channelId: number | null,
  key: number,
  onProgress?: (done: number, total: number) => void,
  onComplete?: () => void,
) {
  const qc = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const onProgressRef = useRef(onProgress);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onProgressRef.current = onProgress;
  });
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    if (!channelId) return;

    const token = accessToken ? `?token=${encodeURIComponent(accessToken)}` : '';
    const es = new EventSource(`/api/channels/${channelId}/media-progress${token}`);

    es.addEventListener('item', (e: MessageEvent) => {
      const data = JSON.parse(e.data as string) as MediaProgressEvent;
      if (!data.newsId || !data.localMediaPath) return;

      qc.setQueriesData<NewsItem[]>({ queryKey: ['news', channelId] }, (old) => {
        if (!old) return old;
        return old.map((item) => (item.id === data.newsId ? { ...item, localMediaPath: data.localMediaPath } : item));
      });

      onProgressRef.current?.(data.done, data.total);
    });

    es.addEventListener('complete', (e: MessageEvent) => {
      const data = JSON.parse(e.data as string) as MediaProgressEvent;
      es.close();
      void qc.invalidateQueries({ queryKey: ['news', channelId] });
      onProgressRef.current?.(data.done, data.total);
      onCompleteRef.current?.();
    });

    // Server aborted processing (new fetch started) — close silently, new SSE will open
    es.addEventListener('aborted', () => {
      es.close();
    });

    es.onerror = () => {
      logger.warn({ module: 'mediaProgress', channelId }, 'SSE error — closing stream');
      es.close();
      void qc.invalidateQueries({ queryKey: ['news', channelId] });
      onCompleteRef.current?.();
    };

    return () => es.close();
  }, [channelId, key, qc, accessToken]); // key forces reconnect on each fetch
}
