import type { Context } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { KbRule } from '@vertex/shared';
import {
  buildKbCsv,
  computeRuleChanges,
  parseImportCsv,
  type EditableValues,
  type FieldChange,
  type ParsedImportRow,
} from '@vertex/shared';
import type { AppEnv } from '../../types';
import { importCsvSchema, undoImportSchema } from '../../dto';

const PAGE = 1000;
const APPLY_CHUNK = 50;

/** Page through kb_rules (id order) applying optional filters — no 1000 cap. */
async function fetchAllRules(
  db: SupabaseClient,
  filters: { q?: string; category?: string; status?: string },
): Promise<KbRule[]> {
  const all: KbRule[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = db.from('kb_rules').select('*').order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.q) query = query.ilike('rule_text', `%${filters.q}%`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const page = (data ?? []) as KbRule[];
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
}

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

interface ChangeEntry {
  id: string;
  category: string;
  decision: ParsedImportRow['decision'];
  changes: FieldChange[];
  patch: EditableValues;
}

/**
 * Re-parse the CSV and diff it against the current DB. Shared by preview and
 * apply so apply never trusts a stale client-side preview.
 */
async function diffCsv(
  db: SupabaseClient,
  csv: string,
): Promise<{
  headerError?: string;
  entries: ChangeEntry[];
  errors: { line: number; id: string; reason: string }[];
  ignored: number;
  unchanged: number;
}> {
  const { headerError, rows } = parseImportCsv(csv);
  if (headerError) return { headerError, entries: [], errors: [], ignored: 0, unchanged: 0 };

  const ids = [...new Set(rows.filter((r) => !r.skip && r.errors.length === 0).map((r) => r.id))];
  const byId = new Map<string, KbRule>();
  for (let i = 0; i < ids.length; i += PAGE) {
    const { data } = await db.from('kb_rules').select('*').in('id', ids.slice(i, i + PAGE));
    for (const r of (data ?? []) as KbRule[]) byId.set(r.id, r);
  }

  const entries: ChangeEntry[] = [];
  const errors: { line: number; id: string; reason: string }[] = [];
  let ignored = 0;
  let unchanged = 0;
  for (const row of rows) {
    if (row.skip) {
      ignored += 1;
      continue;
    }
    if (row.errors.length > 0) {
      errors.push({ line: row.line, id: row.id, reason: row.errors.join(' ') });
      continue;
    }
    const current = byId.get(row.id);
    if (!current) {
      errors.push({ line: row.line, id: row.id, reason: `Unknown Rule ID "${row.id}".` });
      continue;
    }
    const { changes, patch } = computeRuleChanges(current, row);
    if (changes.length === 0) unchanged += 1;
    else entries.push({ id: row.id, category: current.category, decision: row.decision, changes, patch });
  }
  return { entries, errors, ignored, unchanged };
}

/** POST /api/admin/rules/import/preview — diff only, no writes (§7.4 v1.7). */
export async function previewImport(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const parsed = importCsvSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const { headerError, entries, errors, ignored, unchanged } = await diffCsv(db, parsed.data.csv);
  if (headerError) return c.json({ error: 'invalid_csv', message: headerError }, 400);
  return c.json({
    summary: { changed: entries.length, unchanged, ignored, errors: errors.length },
    changes: entries,
    errors,
  });
}

/** POST /api/admin/rules/import/apply — snapshot, apply, log (§7.4 v1.7). */
export async function applyImport(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const staff = c.get('staff');
  const parsed = importCsvSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const { headerError, entries, errors } = await diffCsv(db, parsed.data.csv);
  if (headerError) return c.json({ error: 'invalid_csv', message: headerError }, 400);
  if (entries.length === 0) return c.json({ applied: 0, skipped: errors.length, snapshot_id: null, errors });

  // Snapshot the current state of every rule we're about to change (for Undo).
  const ids = entries.map((e) => e.id);
  const before = new Map<string, KbRule>();
  for (let i = 0; i < ids.length; i += PAGE) {
    const { data } = await db.from('kb_rules').select('*').in('id', ids.slice(i, i + PAGE));
    for (const r of (data ?? []) as KbRule[]) before.set(r.id, r);
  }
  const { data: snap, error: snapErr } = await db
    .from('kb_import_snapshots')
    .insert({ created_by: staff.userId, rows: [...before.values()], applied_count: entries.length })
    .select('id')
    .single();
  if (snapErr || !snap) return c.json({ error: 'server_error' }, 500);
  const snapshotId = (snap as { id: string }).id;

  // Apply in chunks; log each change with source='csv_import'.
  const now = new Date().toISOString();
  let applied = 0;
  for (let i = 0; i < entries.length; i += APPLY_CHUNK) {
    await Promise.all(
      entries.slice(i, i + APPLY_CHUNK).map(async (e) => {
        const { data: after, error } = await db
          .from('kb_rules')
          .update({ ...e.patch, updated_by: staff.userId, updated_at: now })
          .eq('id', e.id)
          .select()
          .single();
        if (error || !after) return;
        applied += 1;
        await db.from('kb_change_log').insert({
          rule_id: e.id,
          changed_by: staff.userId,
          before: before.get(e.id) ?? {},
          after,
          source: 'csv_import',
        });
      }),
    );
  }
  return c.json({ applied, skipped: errors.length, snapshot_id: snapshotId, errors });
}

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
