import type { Context } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppEnv } from '../../types';
import { approveRulesSchema, createRuleSchema, splitRuleSchema, updateRuleSchema } from '../../dto';

async function nextRuleId(db: SupabaseClient): Promise<string> {
  const { data } = await db
    .from('kb_rules')
    .select('id')
    .ilike('id', 'M%')
    .order('id', { ascending: false })
    .limit(1);
  const last = (data?.[0] as { id: string } | undefined)?.id;
  const n = last ? Number(last.slice(1)) + 1 : 1;
  return `M${String(n).padStart(3, '0')}`;
}

async function logChange(
  db: SupabaseClient,
  ruleId: string,
  changedBy: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Promise<void> {
  await db.from('kb_change_log').insert({ rule_id: ruleId, changed_by: changedBy, before, after });
}

/** GET /api/admin/rules — list / search (§7.4). */
export async function listRules(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const q = c.req.query('q')?.trim();
  const category = c.req.query('category');
  const status = c.req.query('status');

  let query = db.from('kb_rules').select('*').order('id', { ascending: true }).limit(1000);
  if (category) query = query.eq('category', category);
  if (status) query = query.eq('status', status);
  if (q) query = query.ilike('rule_text', `%${q}%`);

  const { data, error } = await query;
  if (error) return c.json({ error: 'server_error' }, 500);
  return c.json({ rules: data ?? [] });
}

/** POST /api/admin/rules — create a new rule (id M001…) (§7.4). */
export async function createRule(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const staff = c.get('staff');
  const parsed = createRuleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const id = await nextRuleId(db);
  const row = {
    id,
    category: parsed.data.category,
    subcategory: parsed.data.subcategory ?? '',
    rule_text: parsed.data.rule_text,
    fee_amounts_jpy: parsed.data.fee_amounts_jpy ?? [],
    links: parsed.data.links ?? [],
    audience: parsed.data.audience,
    ai_can_answer: parsed.data.ai_can_answer,
    requires_fee_disclaimer: parsed.data.requires_fee_disclaimer ?? false,
    status: parsed.data.status ?? 'active',
    updated_by: staff.userId,
  };
  const { data, error } = await db.from('kb_rules').insert(row).select().single();
  if (error || !data) return c.json({ error: 'server_error' }, 500);
  await logChange(db, id, staff.userId, {}, data as Record<string, unknown>);
  return c.json({ rule: data }, 201);
}

/** PATCH /api/admin/rules/:id — edit + change-log before/after (§7.4/§7.7). */
export async function updateRule(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const staff = c.get('staff');
  const id = c.req.param('id') ?? '';
  const parsed = updateRuleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const { data: before } = await db.from('kb_rules').select('*').eq('id', id).maybeSingle();
  if (!before) return c.json({ error: 'not_found' }, 404);

  const patch = { ...parsed.data, updated_by: staff.userId, updated_at: new Date().toISOString() };
  const { data: after, error } = await db
    .from('kb_rules')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error || !after) return c.json({ error: 'server_error' }, 500);
  await logChange(
    db,
    id,
    staff.userId,
    before as Record<string, unknown>,
    after as Record<string, unknown>,
  );
  return c.json({ rule: after });
}

/** POST /api/admin/rules/approve — bulk approve pending_review → active (§7.5). */
export async function approveRules(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const staff = c.get('staff');
  const parsed = approveRulesSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const { data, error } = await db
    .from('kb_rules')
    .update({ status: 'active', updated_by: staff.userId, updated_at: new Date().toISOString() })
    .in('id', parsed.data.ids)
    .eq('status', 'pending_review')
    .select('id');
  if (error) return c.json({ error: 'server_error' }, 500);
  const approved = ((data ?? []) as { id: string }[]).map((r) => r.id);
  for (const ruleId of approved) {
    await logChange(db, ruleId, staff.userId, { status: 'pending_review' }, { status: 'active' });
  }
  return c.json({ approved });
}

/** POST /api/admin/rules/:id/split — split into customer + internal rules (§7.5). */
export async function splitRule(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const staff = c.get('staff');
  const id = c.req.param('id') ?? '';
  const parsed = splitRuleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const { data: before } = await db.from('kb_rules').select('*').eq('id', id).maybeSingle();
  if (!before) return c.json({ error: 'not_found' }, 404);
  const original = before as Record<string, unknown>;

  // Original keeps the customer-facing half, becomes active + customer.
  const { data: updated, error: e1 } = await db
    .from('kb_rules')
    .update({
      rule_text: parsed.data.customer_text,
      audience: 'customer',
      status: 'active',
      updated_by: staff.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (e1 || !updated) return c.json({ error: 'server_error' }, 500);
  await logChange(db, id, staff.userId, original, updated as Record<string, unknown>);

  // Internal half becomes a new internal rule.
  const newId = await nextRuleId(db);
  const { data: created, error: e2 } = await db
    .from('kb_rules')
    .insert({
      id: newId,
      category: original.category as string,
      subcategory: (original.subcategory as string) ?? '',
      rule_text: parsed.data.internal_text,
      audience: 'internal',
      ai_can_answer: false,
      status: 'active',
      updated_by: staff.userId,
    })
    .select()
    .single();
  if (e2 || !created) return c.json({ error: 'server_error' }, 500);
  await logChange(db, newId, staff.userId, {}, created as Record<string, unknown>);

  return c.json({ customer_rule: updated, internal_rule: created });
}
