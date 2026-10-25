import type { Context } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeRuleChanges,
  parseImportCsv,
  type EditableValues,
  type FieldChange,
  type KbRule,
  type ParsedImportRow,
} from '@vertex/shared';
import type { AppEnv, Deps } from '../../types';
import { disableViewSchema } from '../../dto';
import { fetchAllRules } from '../../lib/kbRules';
import { nextRuleId } from './rules';

/**
 * Safe bulk knowledge operations (spec v1.8 §7.4.2) — the safe version of the
 * CS "all clear" request. Nothing is ever deleted: Replace all archives rules
 * missing from the sheet, Disable all disables a view. Every operation first
 * snapshots the whole knowledge base (latest 5 kept) and runs as set-based
 * Postgres functions (one request each — per-rule writes would exceed the
 * Workers subrequest limit). Undo / restore come from those snapshots.
 */

/** What the AI can actually use (§4.1: active + customer + ai_can_answer). */
function aiUsable(r: Pick<KbRule, 'status' | 'audience' | 'ai_can_answer'>): boolean {
  return r.status === 'active' && r.audience === 'customer' && r.ai_can_answer;
}

async function notifyBulk(deps: Deps, text: string): Promise<void> {
  const link = `${deps.adminOrigin.replace(/\/$/, '')}/knowledge`;
  await deps.sendSlack(`🗂 Knowledge bulk change — ${text}\n▶ Knowledge: ${link}`);
}

// --- Replace all (CSV) ------------------------------------------------------

export interface ReplaceChange {
  id: string;
  category: string;
  decision: ParsedImportRow['decision'];
  changes: FieldChange[];
  patch: EditableValues;
}

export interface NewRuleRow {
  line: number;
  /** Given in the sheet, or '' → assigned M### on apply. */
  id: string;
  category: string;
  subcategory: string;
  values: Required<Pick<EditableValues, 'rule_text'>> & EditableValues;
}

export interface ReplaceDiff {
  headerError?: string;
  changes: ReplaceChange[];
  newRules: NewRuleRow[];
  toArchive: { id: string; category: string; status: string }[];
  errors: { line: number; id: string; reason: string }[];
  ignored: number;
  unchanged: number;
  activeBefore: number;
  activeAfter: number;
}

/**
 * Diff a full replacement sheet against ALL current rules: changed rows, new
 * rows (blank or unknown Rule ID, Topic must be an existing category), and the
 * rules missing from the sheet (→ archived). Shared by preview and apply so
 * apply never trusts a stale preview.
 */
export async function diffReplace(db: SupabaseClient, csv: string): Promise<ReplaceDiff> {
  const empty = { changes: [], newRules: [], toArchive: [], errors: [], ignored: 0, unchanged: 0 };
  const { headerError, rows } = parseImportCsv(csv, { allowNew: true });
  const all = await fetchAllRules(db, {});
  const activeBefore = all.filter(aiUsable).length;
  if (headerError) return { headerError, ...empty, activeBefore, activeAfter: activeBefore };

  const byId = new Map(all.map((r) => [r.id, r]));
  const categories = new Set(all.map((r) => r.category));
  const inSheet = new Set<string>();
  const seen = new Set<string>();
  const changes: ReplaceChange[] = [];
  const newRules: NewRuleRow[] = [];
  const errors: ReplaceDiff['errors'] = [];
  let ignored = 0;
  let unchanged = 0;
  let newUsable = 0;
  const after = new Map(all.map((r) => [r.id, { ...r }]));

  for (const row of rows) {
    if (row.skip) {
      ignored += 1;
      continue;
    }
    // A listed id is never archived, even if the row has an error (a typo must
    // not take a rule out of service).
    if (row.id) inSheet.add(row.id);
    if (row.id && seen.has(row.id)) {
      errors.push({ line: row.line, id: row.id, reason: `Rule ID "${row.id}" appears more than once.` });
      continue;
    }
    if (row.id) seen.add(row.id);
    if (row.errors.length > 0) {
      errors.push({ line: row.line, id: row.id, reason: row.errors.join(' ') });
      continue;
    }

    const current = row.id ? byId.get(row.id) : undefined;
    if (!current) {
      // New rule (blank or unknown id).
      if (!row.topic) {
        errors.push({ line: row.line, id: row.id, reason: 'A new rule needs a Topic.' });
        continue;
      }
      if (!categories.has(row.topic)) {
        errors.push({
          line: row.line,
          id: row.id,
          reason: `Topic "${row.topic}" does not exist yet. Use an existing Topic so the bot can find the rule.`,
        });
        continue;
      }
      if (!row.values.rule_text) {
        errors.push({ line: row.line, id: row.id, reason: 'A new rule needs an Answer text.' });
        continue;
      }
      const values = { ...row.values, rule_text: row.values.rule_text };
      newRules.push({ line: row.line, id: row.id, category: row.topic, subcategory: row.subtopic, values });
      const usable = aiUsable({
        status: values.status ?? 'active',
        audience: values.audience ?? 'customer',
        ai_can_answer: values.ai_can_answer ?? true,
      });
      if (usable) newUsable += 1;
      continue;
    }

    // A rule that is in the sheet comes back into service unless the sheet
    // itself says Archived.
    const effective =
      current.status === 'archived' && row.values.status === undefined
        ? { ...row, values: { ...row.values, status: 'active' as const } }
        : row;
    const { changes: fieldChanges, patch } = computeRuleChanges(current, effective);
    if (fieldChanges.length === 0) {
      unchanged += 1;
      continue;
    }
    changes.push({ id: row.id, category: current.category, decision: row.decision, changes: fieldChanges, patch });
    after.set(row.id, { ...current, ...(patch as Partial<KbRule>) });
  }

  const toArchive = all
    .filter((r) => r.status !== 'archived' && !inSheet.has(r.id))
    .map((r) => ({ id: r.id, category: r.category, status: r.status }));
  for (const r of toArchive) after.set(r.id, { ...after.get(r.id)!, status: 'archived' });

  const activeAfter = [...after.values()].filter(aiUsable).length + newUsable;
  return { changes, newRules, toArchive, errors, ignored, unchanged, activeBefore, activeAfter };
}

/** Preview payload for Replace all (no writes). */
export function replacePreviewBody(d: ReplaceDiff) {
  return {
    mode: 'replace' as const,
    summary: {
      changed: d.changes.length,
      unchanged: d.unchanged,
      ignored: d.ignored,
      errors: d.errors.length,
      added: d.newRules.length,
      archived: d.toArchive.length,
    },
    changes: d.changes,
    new_rules: d.newRules.slice(0, 200).map((n) => ({
      line: n.line,
      id: n.id,
      category: n.category,
      text: n.values.rule_text.slice(0, 160),
    })),
    to_archive: { count: d.toArchive.length, sample: d.toArchive.slice(0, 50) },
    active_before: d.activeBefore,
    active_after: d.activeAfter,
    errors: d.errors,
  };
}

/** Assign M### ids to new rows without one (sequential after the last M id). */
async function assignIds(db: SupabaseClient, rows: NewRuleRow[]): Promise<string[]> {
  const first = await nextRuleId(db);
  let n = Number(first.slice(1));
  return rows.map((r) => {
    if (r.id) return r.id;
    const id = `M${String(n).padStart(3, '0')}`;
    n += 1;
    return id;
  });
}

/**
 * Apply Replace all: snapshot → patch changed rules → insert new rules →
 * archive rules missing from the sheet → Slack. Requires confirm === 'REPLACE'.
 */
export async function applyReplace(c: Context<AppEnv>, csv: string, confirm: string | undefined): Promise<Response> {
  const deps = c.get('deps');
  const { db } = deps;
  const staff = c.get('staff');
  if (confirm !== 'REPLACE') {
    return c.json({ error: 'confirm_required', message: 'Type REPLACE to confirm replacing all rules.' }, 400);
  }

  const d = await diffReplace(db, csv);
  if (d.headerError) return c.json({ error: 'invalid_csv', message: d.headerError }, 400);
  if (d.changes.length + d.newRules.length + d.toArchive.length === 0) {
    return c.json({ applied: 0, added: 0, archived: 0, skipped: d.errors.length, snapshot_id: null, errors: d.errors });
  }

  const newIds = await assignIds(db, d.newRules);
  const affected = [...d.changes.map((x) => x.id), ...newIds, ...d.toArchive.map((x) => x.id)];
  const { data: snapId, error: snapErr } = await db.rpc('kb_take_snapshot', {
    p_kind: 'replace_all',
    p_staff: staff.userId,
    p_affected: affected,
    p_note: `Replace all: ${d.changes.length} changed, ${d.newRules.length} added, ${d.toArchive.length} archived`,
  });
  if (snapErr || !snapId) return c.json({ error: 'server_error', message: 'Could not save a backup; nothing changed.' }, 500);

  let applied = 0;
  if (d.changes.length > 0) {
    const { data, error } = await db.rpc('kb_apply_patches', {
      p_patches: d.changes.map((x) => ({ id: x.id, patch: x.patch })),
      p_staff: staff.userId,
      p_source: 'replace_all',
    });
    if (error) return c.json({ error: 'server_error', snapshot_id: snapId }, 500);
    applied = Number(data ?? 0);
  }

  let added = 0;
  if (d.newRules.length > 0) {
    const now = new Date().toISOString();
    const inserts = d.newRules.map((n, i) => ({
      id: newIds[i],
      category: n.category,
      subcategory: n.subcategory,
      rule_text: n.values.rule_text,
      fee_amounts_jpy: n.values.fee_amounts_jpy ?? [],
      fee_is_fixed: n.values.fee_is_fixed ?? false,
      links: n.values.links ?? [],
      audience: n.values.audience ?? 'customer',
      ai_can_answer: n.values.ai_can_answer ?? true,
      status: n.values.status ?? 'active',
      updated_by: staff.userId,
      updated_at: now,
    }));
    const { data: created, error } = await db.from('kb_rules').insert(inserts).select();
    if (error) return c.json({ error: 'server_error', snapshot_id: snapId }, 500);
    const rows = (created ?? []) as Record<string, unknown>[];
    added = rows.length;
    if (rows.length > 0) {
      await db.from('kb_change_log').insert(
        rows.map((r) => ({ rule_id: r.id, changed_by: staff.userId, before: {}, after: r, source: 'replace_all' })),
      );
    }
  }

  let archived = 0;
  if (d.toArchive.length > 0) {
    const { data, error } = await db.rpc('kb_bulk_set_status', {
      p_ids: d.toArchive.map((x) => x.id),
      p_status: 'archived',
      p_staff: staff.userId,
      p_source: 'replace_all',
    });
    if (error) return c.json({ error: 'server_error', snapshot_id: snapId }, 500);
    archived = Number(data ?? 0);
  }

  await notifyBulk(
    deps,
    `Replace all by ${staff.name}: ${applied} updated, ${added} added, ${archived} archived (not deleted). ` +
      `Rules the bot can use: ${d.activeBefore} → ${d.activeAfter}. A backup was saved; it can be undone.`,
  );
  return c.json({
    applied,
    added,
    archived,
    skipped: d.errors.length,
    snapshot_id: snapId,
    active_after: d.activeAfter,
    errors: d.errors,
  });
}

// --- Disable all in this view ----------------------------------------------

/** POST /api/admin/rules/disable-view — disable exactly the ids in the admin's view. */
export async function disableView(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const { db } = deps;
  const staff = c.get('staff');
  const parsed = disableViewSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const all = await fetchAllRules(db, {});
  const wanted = new Set(parsed.data.ids);
  const unknown = parsed.data.ids.filter((id) => !all.some((r) => r.id === id));
  if (unknown.length > 0) return c.json({ error: 'unknown_ids', ids: unknown.slice(0, 20) }, 409);
  const targets = all.filter((r) => wanted.has(r.id) && r.status !== 'disabled' && r.status !== 'archived');
  if (targets.length === 0) return c.json({ disabled: 0, snapshot_id: null });

  const activeAfter = all.filter((r) => aiUsable(r) && !wanted.has(r.id)).length;
  const ids = targets.map((r) => r.id);
  const { data: snapId, error: snapErr } = await db.rpc('kb_take_snapshot', {
    p_kind: 'disable_view',
    p_staff: staff.userId,
    p_affected: ids,
    p_note: `Disable all in view: ${parsed.data.description || 'custom view'}`,
  });
  if (snapErr || !snapId) return c.json({ error: 'server_error', message: 'Could not save a backup; nothing changed.' }, 500);

  const { data, error } = await db.rpc('kb_bulk_set_status', {
    p_ids: ids,
    p_status: 'disabled',
    p_staff: staff.userId,
    p_source: 'disable_view',
  });
  if (error) return c.json({ error: 'server_error', snapshot_id: snapId }, 500);
  const disabled = Number(data ?? 0);

  await notifyBulk(
    deps,
    `Disable all in view by ${staff.name} (${parsed.data.description || 'custom view'}): ${disabled} rule(s) disabled ` +
      `(not deleted). Rules the bot can use: ${activeAfter}. A backup was saved; it can be undone.`,
  );
  return c.json({ disabled, snapshot_id: snapId, active_after: activeAfter });
}

// --- Backups (snapshots) ---------------------------------------------------

interface SnapshotRow {
  id: string;
  kind: string;
  created_by: string | null;
  created_at: string;
  rule_count: number;
  affected_ids: string[];
  undone: boolean;
  note: string;
}

/** GET /api/admin/rules/snapshots — the kept backups, newest first (no rule data). */
export async function listSnapshots(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const { data, error } = await db
    .from('kb_rule_snapshots')
    .select('id,kind,created_by,created_at,rule_count,affected_ids,undone,note')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return c.json({ error: 'server_error' }, 500);
  const rows = (data ?? []) as SnapshotRow[];
  const { data: staffRows } = await db.from('staff').select('id,name');
  const names = new Map(((staffRows ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  return c.json({
    snapshots: rows.map((s) => ({
      id: s.id,
      kind: s.kind,
      created_at: s.created_at,
      created_by_name: (s.created_by && names.get(s.created_by)) || '',
      rule_count: s.rule_count,
      affected_count: s.affected_ids.length,
      undone: s.undone,
      note: s.note,
    })),
  });
}

async function loadSnapshot(db: SupabaseClient, id: string): Promise<SnapshotRow | null> {
  const { data } = await db
    .from('kb_rule_snapshots')
    .select('id,kind,created_by,created_at,rule_count,affected_ids,undone,note')
    .eq('id', id)
    .maybeSingle();
  return (data as SnapshotRow | null) ?? null;
}

/** POST /api/admin/rules/snapshots/:id/undo — put back only what that operation changed. */
export async function undoSnapshot(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const staff = c.get('staff');
  const snap = await loadSnapshot(deps.db, c.req.param('id') ?? '');
  if (!snap) return c.json({ error: 'not_found' }, 404);
  if (snap.undone) return c.json({ error: 'already_undone' }, 409);
  if (snap.kind === 'restore') return c.json({ error: 'use_restore', message: 'Use "Restore everything" for this backup.' }, 409);

  const { data, error } = await deps.db.rpc('kb_restore_snapshot', {
    p_snapshot: snap.id,
    p_staff: staff.userId,
    p_only_affected: true,
  });
  if (error) return c.json({ error: 'server_error' }, 500);
  const restored = Number(data ?? 0);
  await notifyBulk(deps, `Undo by ${staff.name}: "${snap.note}" was undone (${restored} rule(s) put back).`);
  return c.json({ restored, snapshot_id: snap.id });
}

/** POST /api/admin/rules/snapshots/:id/restore — the whole knowledge base back to that point. */
export async function restoreSnapshot(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const staff = c.get('staff');
  const snap = await loadSnapshot(deps.db, c.req.param('id') ?? '');
  if (!snap) return c.json({ error: 'not_found' }, 404);

  // A restore is itself undoable: back up the current state first.
  const current = await fetchAllRules(deps.db, {});
  const { error: snapErr } = await deps.db.rpc('kb_take_snapshot', {
    p_kind: 'restore',
    p_staff: staff.userId,
    p_affected: current.map((r) => r.id),
    p_note: `Before restoring the backup from ${snap.created_at.slice(0, 16).replace('T', ' ')} UTC`,
  });
  if (snapErr) return c.json({ error: 'server_error', message: 'Could not save a backup; nothing changed.' }, 500);

  const { data, error } = await deps.db.rpc('kb_restore_snapshot', {
    p_snapshot: snap.id,
    p_staff: staff.userId,
    p_only_affected: false,
  });
  if (error) return c.json({ error: 'server_error' }, 500);
  const restored = Number(data ?? 0);
  await notifyBulk(
    deps,
    `Restore by ${staff.name}: all knowledge put back to ${snap.created_at.slice(0, 16).replace('T', ' ')} UTC ` +
      `(${restored} rule(s) changed). The state before the restore was saved as a backup.`,
  );
  return c.json({ restored, snapshot_id: snap.id });
}
