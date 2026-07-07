import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';

/**
 * CORS restricted to the chat and admin origins only (§2). Origins are read from
 * Worker vars (ADMIN_BASE_URL, CHAT_BASE_URL) with localhost dev defaults. Any
 * other Origin receives no CORS headers, so browsers block it.
 */
/** Allow both localhost and 127.0.0.1 forms of a dev origin (browser IPv4/IPv6). */
function withLoopbackVariants(origins: string[]): string[] {
  const out = new Set<string>();
  for (const o of origins) {
    out.add(o);
    if (o.includes('://localhost')) out.add(o.replace('://localhost', '://127.0.0.1'));
    else if (o.includes('://127.0.0.1')) out.add(o.replace('://127.0.0.1', '://localhost'));
  }
  return [...out];
}

export function corsMiddleware(): MiddlewareHandler<AppEnv> {
  return (c, next) => {
    const allowed = withLoopbackVariants([
      c.env.ADMIN_BASE_URL || 'http://localhost:5174',
      c.env.CHAT_BASE_URL || 'http://localhost:5173',
    ]);
    return cors({
      origin: (origin) => (allowed.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      maxAge: 86400,
    })(c, next);
  };
}
