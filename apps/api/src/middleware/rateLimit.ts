import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';

/** §2: same session limited to 10 requests per minute. */
export const RATE_LIMIT_MAX = 10;
export const RATE_LIMIT_WINDOW_SEC = 60;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSec: number;
}

/**
 * Fixed-window counter in KV, keyed by session token + window. Not strictly
 * atomic (KV is eventually consistent) but sufficient at this scale; swap for a
 * Durable Object if exact limiting is ever required.
 */
export async function checkRateLimit(
  kv: KVNamespace,
  token: string,
  now: number,
): Promise<RateLimitResult> {
  const windowMs = RATE_LIMIT_WINDOW_SEC * 1000;
  const windowIndex = Math.floor(now / windowMs);
  const key = `rl:${token}:${windowIndex}`;
  const resetSec = RATE_LIMIT_WINDOW_SEC - Math.floor((now % windowMs) / 1000);

  const current = Number((await kv.get(key)) ?? '0');
  if (current >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetSec };
  }
  await kv.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_WINDOW_SEC });
  return { allowed: true, remaining: RATE_LIMIT_MAX - (current + 1), resetSec };
}

export const rateLimitMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = c.req.param('token');
  if (!token) return c.json({ error: 'missing_token' }, 400);
  const { kv } = c.get('deps');
  const result = await checkRateLimit(kv, token, Date.now());
  if (!result.allowed) {
    return c.json({ error: 'rate_limited' }, 429, { 'Retry-After': String(result.resetSec) });
  }
  await next();
  return undefined;
};
