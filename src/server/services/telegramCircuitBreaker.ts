import { logger } from '../logger.js';
import { sendAlert } from './alertBot.js';

// ─── Transient error detection ────────────────────────────────────────────────

/** Extract wait duration from gramjs FloodWaitError (has a `seconds` property). */
function getFloodWaitSeconds(err: unknown): number {
  if (!(err instanceof Error)) return 0;
  if (err.constructor.name === 'FloodWaitError') {
    return (err as unknown as { seconds?: number }).seconds ?? 30;
  }
  return 0;
}

export function isTransientTelegramError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.constructor.name === 'FloodWaitError' ||
    msg.includes('timeout') ||
    msg.includes('flood') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('disconnected') ||
    msg.includes('connection') ||
    msg.includes('network error') ||
    msg.includes('socket')
  );
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

const MAX_TG_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 16_000;

async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_TG_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_TG_RETRIES - 1) break; // exhausted
      if (!isTransientTelegramError(err)) throw err; // permanent — don't retry

      // FloodWait: respect Telegram's mandatory wait time
      const floodSec = getFloodWaitSeconds(err);
      const delay =
        floodSec > 0 ? floodSec * 1_000 : Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);

      logger.warn(
        { module: 'telegram', context, attempt: attempt + 1, delayMs: delay },
        `transient Telegram error — retrying in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr;
}

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

type CircuitState = 'closed' | 'open' | 'half-open';

class TelegramCircuitBreaker {
  private _state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(
    private readonly failureThreshold: number,
    private readonly halfOpenAfterMs: number,
  ) {}

  getState(): CircuitState {
    if (this._state === 'open' && Date.now() - this.openedAt >= this.halfOpenAfterMs) {
      this._state = 'half-open';
      logger.info({ module: 'telegram' }, 'circuit breaker → half-open (probing)');
    }
    return this._state;
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    if (this._state !== 'closed') {
      logger.info({ module: 'telegram' }, 'circuit breaker → closed');
      this._state = 'closed';
    }
  }

  private recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.failureThreshold && this._state === 'closed') {
      this._state = 'open';
      this.openedAt = Date.now();
      logger.error(
        { module: 'telegram', consecutiveFailures: this.consecutiveFailures },
        'circuit breaker → OPEN — Telegram unreachable, blocking calls for 30s',
      );
      void sendAlert('Telegram circuit breaker OPEN — Telegram unreachable, calls blocked for 30s', 'circuit-open');
    }
  }

  async execute<T>(fn: () => Promise<T>, context: string): Promise<T> {
    const state = this.getState();
    if (state === 'open') {
      const retryInSec = Math.ceil((this.halfOpenAfterMs - (Date.now() - this.openedAt)) / 1_000);
      throw new Error(`Telegram circuit breaker OPEN — retry in ${retryInSec}s`);
    }

    try {
      const result = await withRetry(fn, context);
      this.recordSuccess();
      return result;
    } catch (err) {
      if (isTransientTelegramError(err)) this.recordFailure();
      // Session expired → alert immediately (permanent, not caught by circuit breaker)
      if (err instanceof Error && err.message.includes('AUTH_KEY_UNREGISTERED')) {
        void sendAlert(
          'Telegram session expired (AUTH_KEY_UNREGISTERED) — run <code>npm run tg:auth</code> and redeploy',
          'auth-key-unregistered',
        );
      }
      throw err;
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const telegramCircuit = new TelegramCircuitBreaker(
  5, // open after 5 consecutive transient failures
  30_000, // half-open after 30s
);

/** Expose state for GET /api/health */
export function getTelegramCircuitState(): CircuitState {
  return telegramCircuit.getState();
}
