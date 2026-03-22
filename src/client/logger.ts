/**
 * Client-side logger — mirrors the server pino API:
 *   logger.info({ module: 'auth' }, 'login success')
 *   logger.error({ module: 'downloads', err }, 'SSE failed')
 *
 * Level order: debug < info < warn < error
 * Default level: 'debug' in dev, 'warn' in production.
 * Override via VITE_LOG_LEVEL env var.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';
type Meta = Record<string, unknown>;

const LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const isDev = import.meta.env.DEV;
const envLevel = import.meta.env.VITE_LOG_LEVEL as string | undefined;
const minLevel = LEVELS[(envLevel as Level) ?? (isDev ? 'debug' : 'warn')] ?? (isDev ? 0 : 2);

/* Colours for dev console (Chrome DevTools palette) */
const COLOURS: Record<Level, string> = {
  debug: 'color:#8b8b8b',
  info: 'color:#1677ff',
  warn: 'color:#fa8c16;font-weight:600',
  error: 'color:#f5222d;font-weight:600',
};

function emit(level: Level, meta: Meta, msg: string): void {
  if (LEVELS[level] < minLevel) return;

  if (isDev) {
    const label = `%c[${level.toUpperCase()}]`;
    const style = COLOURS[level];
    const { module: mod, ...rest } = meta;
    const prefix = mod ? `[${typeof mod === 'string' ? mod : JSON.stringify(mod)}]` : '';
    const extraArgs = Object.keys(rest).length ? [rest] : [];
    const fn =
      level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : level === 'info'
            ? console.info
            : console.debug;
    fn(label + ' ' + prefix, style, msg, ...extraArgs);
  } else {
    // Production: plain structured output (only warn/error reach here by default)
    const fn = level === 'error' ? console.error : console.warn;
    fn(JSON.stringify({ level, ...meta, msg, time: Date.now() }));
  }
}

export const logger = {
  debug: (meta: Meta, msg: string) => emit('debug', meta, msg),
  info: (meta: Meta, msg: string) => emit('info', meta, msg),
  warn: (meta: Meta, msg: string) => emit('warn', meta, msg),
  error: (meta: Meta, msg: string) => emit('error', meta, msg),
};
