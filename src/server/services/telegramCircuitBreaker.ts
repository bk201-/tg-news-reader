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

/** Returns true for Telegram "file reference expired" errors. These are NOT circuit-breaker failures. */
export function isFileReferenceExpiredError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.constructor.name === 'FileReferenceExpiredError' ||
    msg.includes('file_reference_expired') ||
    msg.includes('file reference') ||
    msg.includes('fileref')
  );
}

// ─── Reconnect callback ───────────────────────────────────────────────────────

// Injected by telegram.ts to avoid circular imports. Called when AUTH_KEY_UNREGISTERED
// is caught and the circuit attempts an automatic reconnect.
type ReconnectFn = () => Promise<void>;
let _reconnectFn: ReconnectFn | null = null;

export function setReconnectCallback(fn: ReconnectFn): void {
  _reconnectFn = fn;
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
  private _sessionExpired = false;

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

  isSessionExpired(): boolean {
    return this._sessionExpired;
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this._sessionExpired = false;
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

  private async handleAuthKeyUnregistered(): Promise<void> {
    logger.warn({ module: 'telegram' }, 'AUTH_KEY_UNREGISTERED — attempting automatic reconnect');
    if (_reconnectFn) {
      try {
        await _reconnectFn();
        logger.info({ module: 'telegram' }, 'Telegram auto-reconnect succeeded — session restored');
        this._sessionExpired = false;
        return;
      } catch (reconnectErr) {
        logger.warn({ module: 'telegram', err: reconnectErr }, 'Telegram auto-reconnect failed');
      }
    }
    // Reconnect failed (or no callback registered) — mark as expired
    if (!this._sessionExpired) {
      this._sessionExpired = true;
      void sendAlert(
        'Telegram session expired (AUTH_KEY_UNREGISTERED) — run <code>npm run tg:auth</code> and redeploy',
        'auth-key-unregistered',
      );
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
      // Session expired → attempt auto-reconnect, then alert if still failing (permanent)
      if (err instanceof Error && err.message.includes('AUTH_KEY_UNREGISTERED')) {
        await this.handleAuthKeyUnregistered();
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

/** Expose session-expired flag for GET /api/health */
export function getTelegramSessionExpired(): boolean {
  return telegramCircuit.isSessionExpired();
}
