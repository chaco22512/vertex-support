import type { Context } from 'hono';
import type { AppEnv } from '../../types';
import { createStaffSchema, updateStaffSchema } from '../../dto';
import { buildStaffInviteEmail } from '../../lib/emailTemplates';

/** GET /api/admin/staff — list (§7.6). */
export async function listStaff(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const { data, error } = await db.from('staff').select('*').order('name', { ascending: true });
  if (error) return c.json({ error: 'server_error' }, 500);
  return c.json({ staff: data ?? [] });
}

/** POST /api/admin/staff — invite + create staff row (§7.6). */
export async function createStaff(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const { db } = deps;
  const parsed = createStaffSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  // Create the auth user + invite. redirectTo is pinned to the admin set-password
  // page so the link never depends solely on Supabase's Site URL config.
  // When a verified branded sender is configured (EMAIL_FROM ≠ resend.dev), send our
  // own SIM Point-branded invite via Resend (with how-to steps); otherwise fall back
  // to Supabase's built-in invitation email so delivery is never regressed (§7.6 v1.7).
  const redirectTo = `${deps.adminOrigin.replace(/\/$/, '')}/set-password`;
  const branded = !deps.emailFrom.includes('resend.dev');

  let userId: string;
  if (branded) {
    const { data: link, error: linkErr } = await db.auth.admin.generateLink({
      type: 'invite',
      email: parsed.data.email,
      options: { redirectTo },
    });
    if (linkErr || !link?.user) {
      return c.json({ error: 'invite_failed', detail: linkErr?.message }, 502);
    }
    userId = link.user.id;
    const { subject, html } = buildStaffInviteEmail(link.properties.action_link, parsed.data.name);
    await deps.sendEmail({ to: parsed.data.email, subject, html });
  } else {
    const invite = await db.auth.admin.inviteUserByEmail(parsed.data.email, { redirectTo });
    if (invite.error || !invite.data.user) {
      return c.json({ error: 'invite_failed', detail: invite.error?.message }, 502);
    }
    userId = invite.data.user.id;
  }

  const { data, error } = await db
    .from('staff')
    .insert({
      id: userId,
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

/**
 * DELETE /api/admin/staff/:id — permanently remove a staff member (§7.6 v1.7).
 * Guards against locking everyone out: you cannot delete your own account or the
 * last active admin. Clears the staff foreign keys (unassigns conversations /
 * messages, drops drafts), deletes the staff row (which immediately blocks their
 * admin access), then best-effort removes the Supabase auth user — this can fail
 * if they authored knowledge changes (kb_change_log preserves that history), in
 * which case the login record is kept but access is already revoked.
 */
export async function deleteStaff(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const { db } = deps;
  const requester = c.get('staff');
  const id = c.req.param('id') ?? '';

  if (id === requester.userId) return c.json({ error: 'cannot_delete_self' }, 400);

  const { data: target } = await db.from('staff').select('id,role,is_active').eq('id', id).maybeSingle();
  if (!target) return c.json({ error: 'not_found' }, 404);
  const t = target as { id: string; role: string; is_active: boolean };

  if (t.role === 'admin' && t.is_active) {
    const { data: admins } = await db.from('staff').select('id').eq('role', 'admin').eq('is_active', true);
    if (((admins ?? []) as unknown[]).length <= 1) return c.json({ error: 'last_active_admin' }, 400);
  }

  // Clear staff foreign keys so the staff row can be deleted.
  await db.from('conversations').update({ assigned_staff: null }).eq('assigned_staff', id);
  await db.from('messages').update({ staff_id: null }).eq('staff_id', id);
  await db.from('reply_drafts').delete().eq('staff_id', id);

  const { error } = await db.from('staff').delete().eq('id', id);
  if (error) return c.json({ error: 'server_error' }, 500);

  // Best-effort auth-user removal (audit log may reference them → keep it).
  await db.from('kb_rules').update({ updated_by: null }).eq('updated_by', id);
  let authUserRemoved = false;
  try {
    const res = await db.auth.admin.deleteUser(id);
    authUserRemoved = !res.error;
  } catch {
    authUserRemoved = false;
  }

  return c.json({ deleted: true, auth_user_removed: authUserRemoved });
}
