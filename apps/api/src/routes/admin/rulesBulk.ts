import type { Context } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeRuleChanges,
  normalizeRuleId,
  parseImportCsv,
  ruleIdProblem,
  type EditableValues,
  type FieldChange,
  type KbRule,
  type ParsedImportRow,
} from '@vertex/shared';
import type { AppEnv, Deps } from '../../types';
import { disableViewSchema } from '../../dto';
import { fetchAllRules } from '../../lib/kbRules';

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

// --- CSV import: Add/Update only + Replace all (★v1.8 CS-managed knowledge) --

export type ImportMode = 'update' | 'replace';

export interface ImportChange {
  id: string;
  category: string;
  decision: ParsedImportRow['decision'];
  changes: FieldChange[];
  patch: EditableValues;
}

export interface NewRuleRow {
  line: number;
  id: string;
  category: string;
  subcategory: string;
  values: Required<Pick<EditableValues, 'rule_text'>> & EditableValues;
}

export interface ImportDiff {
  headerError?: string;
  mode: ImportMode;
  changes: ImportChange[];
  newRules: NewRuleRow[];
  /** Replace all only: rules missing from the sheet (→ archived). */
  toArchive: { id: string; category: string; status: string }[];
  errors: { line: number; id: string; reason: string }[];
  ignored: number;
  unchanged: number;
  activeBefore: number;
  activeAfter: number;
}

/**
 * Diff a CS sheet against ALL current rules (spec v1.8 §7.4.1). Rule IDs are
 * case-insensitive (stored upper-case). A known ID is an update; an unknown ID
 * is a NEW rule and must follow the Rule ID convention (§3.1, e.g. DR001).
 * In Replace all mode, every non-archived rule missing from the sheet is set
 * aside (archived). Shared by preview and apply so apply never trusts a stale
 * preview.
 */
export async function diffImport(db: SupabaseClient, csv: string, mode: ImportMode): Promise<ImportDiff> {
  const { headerError, rows } = parseImportCsv(csv, { allowNew: true });
  const all = await fetchAllRules(db, {});
  const activeBefore = all.filter(aiUsable).length;
  const base = { mode, changes: [], newRules: [], toArchive: [], errors: [], ignored: 0, unchanged: 0, activeBefore };
  if (headerError) return { headerError, ...base, activeAfter: activeBefore };

  const byId = new Map(all.map((r) => [normalizeRuleId(r.id), r]));
  const inSheet = new Set<string>();
  const firstLine = new Map<string, number>();
  const changes: ImportChange[] = [];
  const newRules: NewRuleRow[] = [];
  const errors: ImportDiff['errors'] = [];
  let ignored = 0;
  let unchanged = 0;
  let newUsable = 0;
  const after = new Map(all.map((r) => [r.id, { ...r }]));

  for (const row of rows) {
    if (row.skip) {
      ignored += 1;
      continue;
    }
    const id = normalizeRuleId(row.id);
    // A listed id is never archived, even if its row has an error (a typo must
    // not take a rule out of service).
    if (id) inSheet.add(id);
    if (id && firstLine.has(id)) {
      errors.push({
        line: row.line,
        id,
        reason: `Rule ID "${id}" appears more than once (lines ${firstLine.get(id)} and ${row.line}). Keep one row per Rule ID.`,
      });
      continue;
    }
    if (id) firstLine.set(id, row.line);
    if (row.errors.length > 0) {
      errors.push({ line: row.line, id, reason: row.errors.join(' ') });
      continue;
    }

    const current = id ? byId.get(id) : undefined;
    if (!current) {
      // New rule: the ID must follow the convention, and it needs a Topic.
      const problem = ruleIdProblem(id);
      if (problem) {
        errors.push({ line: row.line, id, reason: problem });
        continue;
      }
      if (!row.topic) {
        errors.push({
          line: row.line,
          id,
          reason: 'This new rule has no Topic. Fill in the Topic column (for example "Deposit refund").',
        });
        continue;
      }
      if (!row.values.rule_text) {
        errors.push({ line: row.line, id, reason: 'This new rule has no Answer text. Add the text the bot should use.' });
        continue;
      }
      const values = { ...row.values, rule_text: row.values.rule_text };
      newRules.push({ line: row.line, id, category: row.topic, subcategory: row.subtopic, values });
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
    changes.push({ id: current.id, category: current.category, decision: row.decision, changes: fieldChanges, patch });
    after.set(current.id, { ...current, ...(patch as Partial<KbRule>) });
  }

  const toArchive =
    mode === 'replace'
      ? all
          .filter((r) => r.status !== 'archived' && !inSheet.has(normalizeRuleId(r.id)))
          .map((r) => ({ id: r.id, category: r.category, status: r.status }))
      : [];
  for (const r of toArchive) after.set(r.id, { ...after.get(r.id)!, status: 'archived' });

  const activeAfter = [...after.values()].filter(aiUsable).length + newUsable;
  return { mode, changes, newRules, toArchive, errors, ignored, unchanged, activeBefore, activeAfter };
}

/** Preview payload (no writes). */
export function importPreviewBody(d: ImportDiff) {
  return {
    mode: d.mode,
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

/**
 * Apply an import in ONE Postgres call (kb_import_apply = one transaction):
 * snapshot → update → add → archive (Replace all) → change log. Either all of
 * it happens or none of it — the knowledge base is never seen empty or half
 * replaced. Replace all requires confirm === 'REPLACE'.
 */
export async function applyImportDiff(
  c: Context<AppEnv>,
  csv: string,
  mode: ImportMode,
  confirm: string | undefined,
): Promise<Response> {
  const deps = c.get('deps');
  const { db } = deps;
  const staff = c.get('staff');
  if (mode === 'replace' && confirm !== 'REPLACE') {
    return c.json({ error: 'confirm_required', message: 'Type REPLACE to confirm replacing all rules.' }, 400);
  }

  const d = await diffImport(db, csv, mode);
  if (d.headerError) return c.json({ error: 'invalid_csv', message: d.headerError }, 400);
  if (d.changes.length + d.newRules.length + d.toArchive.length === 0) {
    return c.json({ applied: 0, added: 0, archived: 0, skipped: d.errors.length, snapshot_id: null, errors: d.errors });
  }

  const note =
    mode === 'replace'
      ? `Replace all: ${d.changes.length} updated, ${d.newRules.length} added, ${d.toArchive.length} archived`
      : `CSV import: ${d.changes.length} updated, ${d.newRules.length} added`;
  const { data, error } = await db.rpc('kb_import_apply', {
    p_mode: mode,
    p_patches: d.changes.map((x) => ({ id: x.id, patch: x.patch })),
    p_new: d.newRules.map((n) => ({
      id: n.id,
      category: n.category,
      subcategory: n.subcategory,
      rule_text: n.values.rule_text,
      fee_amounts_jpy: n.values.fee_amounts_jpy ?? [],
      fee_is_fixed: n.values.fee_is_fixed ?? false,
      links: n.values.links ?? [],
      audience: n.values.audience ?? 'customer',
      ai_can_answer: n.values.ai_can_answer ?? true,
      status: n.values.status ?? 'active',
    })),
    p_archive: d.toArchive.map((x) => x.id),
    p_staff: staff.userId,
    p_note: note,
  });
  if (error || !data) {
    return c.json({ error: 'server_error', message: 'Nothing was changed. Please try again.' }, 500);
  }
  const r = data as { snapshot_id: string; applied: number; added: number; archived: number };

  await notifyBulk(
    deps,
    `${mode === 'replace' ? 'Replace all' : 'CSV import'} by ${staff.name}: ${r.applied} updated, ${r.added} added` +
      `${mode === 'replace' ? `, ${r.archived} archived (not deleted)` : ''}. ` +
      `Rules the bot can use: ${d.activeBefore} → ${d.activeAfter}. A backup was saved; it can be undone.`,
  );
  return c.json({
    applied: r.applied,
    added: r.added,
    archived: r.archived,
    skipped: d.errors.length,
    snapshot_id: r.snapshot_id,
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
