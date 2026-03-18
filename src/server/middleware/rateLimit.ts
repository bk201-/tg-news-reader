import { rateLimiter } from 'hono-rate-limiter';

export const rateLimitMiddleware = rateLimiter({
  windowMs: 60 * 1000, // 1-minute window
  limit: 120, // max 120 requests per window
  standardHeaders: 'draft-6',
  keyGenerator: (c) =>
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.raw.headers.get('x-real-ip') ?? 'unknown',
  message: { error: 'Too many requests, please slow down.' },
});
