import type { Context } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildKbCsv, type KbRule } from '@vertex/shared';
import type { AppEnv } from '../../types';
import { importCsvSchema, undoImportSchema } from '../../dto';
import { fetchAllRules } from '../../lib/kbRules';
import { applyImportDiff, diffImport, importPreviewBody } from './rulesBulk';

async function staffNameMap(db: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await db.from('staff').select('id,name');
  return new Map(((data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
}

/** GET /api/admin/rules/export — knowledge as an Excel-friendly CSV (§7.4 v1.7). */
export async function exportRules(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const scope = c.req.query('scope') === 'all' ? 'all' : 'filtered';
  const filters =
    scope === 'all'
      ? {}
      : { q: c.req.query('q')?.trim(), category: c.req.query('category'), status: c.req.query('status') };
  try {
    const [rules, names] = await Promise.all([fetchAllRules(db, filters), staffNameMap(db)]);
    const csv = buildKbCsv(rules, names);
    c.header('content-type', 'text/csv; charset=utf-8');
    c.header('content-disposition', `attachment; filename="knowledge-${scope}.csv"`);
    return c.body(csv);
  } catch {
    return c.json({ error: 'server_error' }, 500);
  }
}

/**
 * POST /api/admin/rules/import/preview — diff only, no writes (§7.4.1).
 * ★v1.8: both modes add rules with new IDs; Replace all also archives rules
 * missing from the sheet (§7.4.2).
 */
export async function previewImport(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const parsed = importCsvSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
  const d = await diffImport(db, parsed.data.csv, parsed.data.mode);
  if (d.headerError) return c.json({ error: 'invalid_csv', message: d.headerError }, 400);
  return c.json(importPreviewBody(d));
}

/** POST /api/admin/rules/import/apply — one-transaction apply with a backup (§7.4.1). */
export async function applyImport(c: Context<AppEnv>): Promise<Response> {
  const parsed = importCsvSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
  return applyImportDiff(c, parsed.data.csv, parsed.data.mode, parsed.data.confirm);
}

/*
 * Legacy (v1.7): imports before v1.8 were backed up in kb_import_snapshots.
 * New imports use kb_rule_snapshots (Backups); this endpoint only undoes the
 * old ones.
 */

const RESTORE_FIELDS = [
  'rule_text',
  'fee_amounts_jpy',
  'fee_is_fixed',
  'links',
  'audience',
  'ai_can_answer',
  'status',
  'review_reason',
] as const;

/** POST /api/admin/rules/import/undo — restore the last (or a given) snapshot (§7.4 v1.7). */
export async function undoImport(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const staff = c.get('staff');
  const parsed = undoImportSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  let query = db.from('kb_import_snapshots').select('*').eq('undone', false).order('created_at', { ascending: false }).limit(1);
  if (parsed.data.snapshot_id) query = db.from('kb_import_snapshots').select('*').eq('id', parsed.data.snapshot_id).limit(1);
  const { data } = await query;
  const snapshot = ((data ?? []) as { id: string; rows: KbRule[]; undone: boolean }[])[0];
  if (!snapshot) return c.json({ error: 'not_found', message: 'No import to undo.' }, 404);
  if (snapshot.undone) return c.json({ error: 'already_undone' }, 409);

  const now = new Date().toISOString();
  let restored = 0;
  for (const row of snapshot.rows) {
    const patch: Record<string, unknown> = { updated_by: staff.userId, updated_at: now };
    for (const f of RESTORE_FIELDS) patch[f] = (row as unknown as Record<string, unknown>)[f];
    const { data: after, error } = await db.from('kb_rules').update(patch).eq('id', row.id).select().single();
    if (error || !after) continue;
    restored += 1;
    await db.from('kb_change_log').insert({
      rule_id: row.id,
      changed_by: staff.userId,
      before: after, // best-effort; the restore target is `row`
      after: row,
      source: 'csv_import_undo',
    });
  }
  await db.from('kb_import_snapshots').update({ undone: true }).eq('id', snapshot.id);
  return c.json({ restored, snapshot_id: snapshot.id });
}
