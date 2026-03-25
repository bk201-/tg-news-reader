import { useAuthStore } from '../store/authStore';

export interface DigestParams {
  channelIds?: number[];
  groupId?: number | null;
  since?: string;
  until?: string;
}

/**
 * Streams a digest from POST /api/digest.
 * Returns an async generator that yields text chunks.
 * Caller is responsible for aborting via AbortController.
 */
export async function* streamDigest(params: DigestParams, signal: AbortSignal): AsyncGenerator<string, void, unknown> {
  const token = useAuthStore.getState().accessToken;

  const response = await fetch('/api/digest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
    signal,
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({ error: 'Unknown error' }))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines from buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('event: chunk')) continue;
      if (line.startsWith('data: ')) {
        const rawData = line.slice(6).trim();
        if (!rawData) continue;

        try {
          const parsed = JSON.parse(rawData) as { content?: string; message?: string };
          if (parsed.content !== undefined) {
            yield parsed.content;
          }
          // 'done' and 'error' events handled by caller checking the generator return
        } catch {
          // skip malformed lines
        }
      }
    }
  }
}
