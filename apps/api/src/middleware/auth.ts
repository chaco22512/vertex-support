import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';

/**
 * Require a valid Supabase Auth JWT belonging to an active staff member (§2/§7).
 * The resolved staff context is placed on the context for handlers.
 */
export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return c.json({ error: 'unauthorized' }, 401);

  const staff = await c.get('deps').verifyStaff(token);
  if (!staff || !staff.isActive) return c.json({ error: 'unauthorized' }, 401);

  c.set('staff', staff);
  await next();
  return undefined;
};

/** Require the admin role (knowledge & staff management, §7.4/§7.6, criterion 7). */
export const adminOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('staff').role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  await next();
  return undefined;
};
