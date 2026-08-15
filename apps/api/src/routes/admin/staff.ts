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
