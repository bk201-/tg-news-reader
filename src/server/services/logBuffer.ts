import { Writable } from 'node:stream';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogEntry {
  time: number;
  level: number;
  module?: string;
  msg: string;
  [key: string]: unknown;
}

export const LEVEL_NAMES: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

export const LEVEL_MAP: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

// ─── Circular buffer ──────────────────────────────────────────────────────────

const MAX_ENTRIES = 2000;
const _entries: LogEntry[] = [];

export function getLogEntries(sinceMs: number, minLevel: number): LogEntry[] {
  const result: LogEntry[] = [];
  for (const e of _entries) {
    if (e.time >= sinceMs && e.level >= minLevel) result.push(e);
  }
  return result;
}

export function getBufferSize(): number {
  return _entries.length;
}

// ─── Writable stream consumed by pino multistream ────────────────────────────

export const logBufferStream = new Writable({
  write(chunk: Buffer, _encoding, callback) {
    try {
      const line = chunk.toString().trim();
      if (line) {
        const entry = JSON.parse(line) as LogEntry;
        _entries.push(entry);
        if (_entries.length > MAX_ENTRIES) _entries.shift();
      }
    } catch {
      // ignore JSON parse errors (e.g. partial writes)
    }
    callback();
  },
});
