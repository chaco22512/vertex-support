import type { Context } from 'hono';
import type { AppEnv } from '../../types';
import { createStaffSchema, updateStaffSchema } from '../../dto';

/** GET /api/admin/staff — list (§7.6). */
export async function listStaff(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const { data, error } = await db.from('staff').select('*').order('name', { ascending: true });
  if (error) return c.json({ error: 'server_error' }, 500);
  return c.json({ staff: data ?? [] });
}

/** POST /api/admin/staff — invite + create staff row (§7.6). */
export async function createStaff(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const parsed = createStaffSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  // Send a Supabase Auth invitation email; the returned user id links the staff row.
  const invite = await db.auth.admin.inviteUserByEmail(parsed.data.email);
  if (invite.error || !invite.data.user) {
    return c.json({ error: 'invite_failed', detail: invite.error?.message }, 502);
  }

  const { data, error } = await db
    .from('staff')
    .insert({
      id: invite.data.user.id,
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role ?? 'staff',
      languages: parsed.data.languages ?? ['en'],
      channels: parsed.data.channels ?? ['webchat'],
      slack_member_id: parsed.data.slack_member_id ?? '',
      is_active: true,
    })
    .select()
    .single();
  if (error || !data) return c.json({ error: 'server_error' }, 500);
  return c.json({ staff: data }, 201);
}

/** PATCH /api/admin/staff/:id — edit (§7.6). */
export async function updateStaff(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const id = c.req.param('id') ?? '';
  const parsed = updateStaffSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const { data, error } = await db.from('staff').update(parsed.data).eq('id', id).select().single();
  if (error || !data) return c.json({ error: 'server_error' }, 500);
  return c.json({ staff: data });
}
