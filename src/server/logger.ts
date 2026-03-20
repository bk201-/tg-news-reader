import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Centralised pino logger instance.
 *
 * Dev:  pino-pretty — colourised, human-readable, timestamp HH:MM:ss
 * Prod: JSON to stdout — consumed by Azure Log Analytics or shell redirect
 *
 * Level override: LOG_LEVEL env variable (debug | info | warn | error)
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          messageFormat: '[{module}] {msg}',
        },
      }
    : undefined,
});
