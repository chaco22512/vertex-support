import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';

/**
 * CORS restricted to the chat and admin origins only (§2). Origins are read from
 * Worker vars (ADMIN_BASE_URL, CHAT_BASE_URL) with localhost dev defaults. Any
 * other Origin receives no CORS headers, so browsers block it.
 */
export function corsMiddleware(): MiddlewareHandler<AppEnv> {
  return (c, next) => {
    const allowed = [
      c.env.ADMIN_BASE_URL || 'http://localhost:5174',
      c.env.CHAT_BASE_URL || 'http://localhost:5173',
    ];
    return cors({
      origin: (origin) => (allowed.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      maxAge: 86400,
    })(c, next);
  };
}
