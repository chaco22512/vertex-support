import type { Context } from 'hono';
import { z } from 'zod';
import {
  OTHERS_TILE_ID,
  TILE_ICONS,
  TILE_LANGUAGES,
  TILE_LIMITS,
  RULE_ID_CODES,
  ruleIdCode,
  tileIdFromLabel,
  type KbRule,
} from '@vertex/shared';
import type { AppEnv, Deps } from '../../types';
import { fetchAllRules } from '../../lib/kbRules';
import { BEHAVIOUR_LIMITS } from '../../lib/aiBehaviour';
import { TILE_COLUMNS, loadTiles, publicTiles, type TileRow } from '../../lib/menu';

/**
 * ★2026-11-14 admin "Topics": CS adds, edits, reorders and hides the customer
 * chat tiles (table menu_tiles). Saved changes reach the chat on its next load
 * (GET /api/menu) and the AI on its next reply. Every change is written to
 * menu_tile_change_log and announced in Slack. Topic instructions written here
 * are saved as an AI behaviour DRAFT — they go live only through Publish (safety
 * tests, spec §7.8).
 */

const langKey = z.enum(TILE_LANGUAGES as [string, ...string[]]);
const tileBodySchema = z.object({
  labels: z.record(langKey, z.string().trim().max(TILE_LIMITS.label)),
  icon: z.string().refine((v) => v in TILE_ICONS, 'unknown icon'),
  id_prefixes: z
    .array(z.string().regex(/^[A-Z]{2,4}$/))
    .max(TILE_LIMITS.codes)
    .default([]),
  sub_questions: z
    .record(
      langKey,
      z.array(z.string().trim().max(TILE_LIMITS.subQuestion)).max(TILE_LIMITS.subQuestions),
    )
    .default({}),
  enabled: z.boolean().default(true),
});
const orderSchema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(100) });
const instructionsSchema = z.object({ text: z.string().max(BEHAVIOUR_LIMITS.max) });
const translateSchema = z.object({
  label: z.string().trim().min(1).max(TILE_LIMITS.label),
  sub_questions: z.array(z.string().trim().max(TILE_LIMITS.subQuestion)).max(TILE_LIMITS.subQuestions),
});

type TileBody = z.infer<typeof tileBodySchema>;

/** A rule the AI may use (Hard rule 3: never pending_review / internal). */
function aiUsable(r: Pick<KbRule, 'status' | 'audience' | 'ai_can_answer'>): boolean {
  return r.status === 'active' && r.audience === 'customer' && r.ai_can_answer;
}

/** AI-usable rule counts per topic code and per legacy category. */
async function ruleCounts(deps: Deps) {
  const rules = await fetchAllRules(deps.db, {});
  const byCode = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const allCodes = new Set<string>();
  for (const r of rules) {
    const code = ruleIdCode(r.id);
    if (code && r.status !== 'archived') allCodes.add(code);
    if (!aiUsable(r)) continue;
    if (code) byCode.set(code, (byCode.get(code) ?? 0) + 1);
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
  }
  return { byCode, byCategory, allCodes };
}

/**
 * True when no connected knowledge has an AI-usable rule, so every customer
 * who taps the tile goes to staff. GN (shared by every tile) does not count.
 */
export function hasNoKnowledge(
  tile: Pick<TileRow, 'id_prefixes' | 'kb_categories' | 'scope_of' | 'behavior'>,
  byCode: Map<string, number>,
  byCategory: Map<string, number>,
): boolean {
  if (tile.scope_of || tile.behavior === 'free_text') return false;
  const codes = (tile.id_prefixes ?? []).filter((c) => c !== 'GN' && c !== '*');
  const legacy = (tile.kb_categories ?? []).filter((c) => c !== '*' && c !== 'GENERAL RULES');
  const n =
    codes.reduce((s, c) => s + (byCode.get(c) ?? 0), 0) +
    legacy.reduce((s, c) => s + (byCategory.get(c) ?? 0), 0);
  return n === 0;
}

/** Topic text per tile: the latest version (what the editor shows) and the published one. */
async function topicTexts(deps: Deps) {
  const [{ data: latest }, { data: published }] = await Promise.all([
    deps.db
      .from('ai_prompt_versions')
      .select('id,state,common_behaviour,topic_instructions')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
    deps.db
      .from('ai_prompt_versions')
      .select('id,common_behaviour,topic_instructions')
      .eq('state', 'published')
      .maybeSingle(),
  ]);
  type V = {
    id: number;
    state?: string;
    common_behaviour: string;
    topic_instructions: Record<string, string>;
  };
  return { latest: (latest as V | null) ?? null, published: (published as V | null) ?? null };
}

/** Clean the editor's values: trim, drop empty languages / questions, English label required. */
function normalise(body: TileBody): { ok: true; value: TileBody } | { ok: false; message: string } {
  const labels: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.labels)) if (v?.trim()) labels[k] = v.trim();
  if (!labels.en) return { ok: false, message: 'Write the English label.' };
  const sub: Record<string, string[]> = {};
  for (const [k, list] of Object.entries(body.sub_questions)) {
    const clean = (list ?? []).map((s) => s.trim()).filter(Boolean);
    if (clean.length) sub[k] = clean;
  }
  return {
    ok: true,
    value: { ...body, labels, sub_questions: sub, id_prefixes: [...new Set(body.id_prefixes)] },
  };
}

async function logTile(
  deps: Deps,
  tileId: string,
  action: string,
  by: string,
  before: unknown,
  after: unknown,
) {
  await deps.db
    .from('menu_tile_change_log')
    .insert({ tile_id: tileId, action, changed_by: by, before, after });
}

const NOT_READY = {
  error: 'tiles_not_ready',
  message: 'Topics are not set up in the database yet. Ask the developer to apply the latest update.',
};

/** GET /api/menu — public: the chat menu (enabled tiles in order). tiles=null → use the built-in menu. */
export async function getPublicMenu(c: Context<AppEnv>): Promise<Response> {
  const tiles = await loadTiles(c.get('deps').db);
  c.header('Cache-Control', 'public, max-age=30');
  return c.json({ tiles: tiles ? publicTiles(tiles) : null });
}

/** GET /api/admin/tiles — tiles, codes with rule counts, icons, topic instructions. */
export async function listTiles(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const [tiles, counts, texts, labels] = await Promise.all([
    loadTiles(deps.db),
    ruleCounts(deps),
    topicTexts(deps),
    deps.db.from('kb_topic_codes').select('code,label'),
  ]);
  if (!tiles) return c.json(NOT_READY, 503);
  const labelOf = new Map(
    ((labels.data ?? []) as { code: string; label: string }[]).map((r) => [r.code, r.label]),
  );
  const codeSet = new Set([
    ...Object.keys(RULE_ID_CODES),
    ...counts.allCodes,
    ...labelOf.keys(),
    ...tiles.flatMap((t) => t.id_prefixes.filter((p) => /^[A-Z]{2,4}$/.test(p))),
  ]);
  const codes = [...codeSet].sort().map((code) => ({
    code,
    label: labelOf.get(code) || RULE_ID_CODES[code] || '',
    rule_count: counts.byCode.get(code) ?? 0,
  }));
  const unpublishedElsewhere = (tileId: string) => {
    const { latest, published } = texts;
    if (!latest || latest.state !== 'draft') return false;
    if ((latest.common_behaviour ?? '') !== (published?.common_behaviour ?? '')) return true;
    const ids = new Set([
      ...Object.keys(latest.topic_instructions ?? {}),
      ...Object.keys(published?.topic_instructions ?? {}),
    ]);
    ids.delete(tileId);
    return [...ids].some(
      (id) =>
        (latest.topic_instructions?.[id] ?? '') !== (published?.topic_instructions?.[id] ?? ''),
    );
  };
  return c.json({
    tiles: tiles.map((t) => ({
      ...t,
      no_knowledge: hasNoKnowledge(t, counts.byCode, counts.byCategory),
      instructions: texts.latest?.topic_instructions?.[t.id] ?? '',
      instructions_published: texts.published?.topic_instructions?.[t.id] ?? '',
      other_unpublished_changes: unpublishedElsewhere(t.id),
    })),
    codes,
    latest_version: texts.latest ? { id: texts.latest.id, state: texts.latest.state } : null,
    instructions_limits: BEHAVIOUR_LIMITS,
  });
}

/** POST /api/admin/tiles — add a tile (placed just before "Something else"). */
export async function createTile(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const staff = c.get('staff');
  const parsed = tileBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body', message: 'Some values are not valid.' }, 400);
  const n = normalise(parsed.data);
  if (!n.ok) return c.json({ error: 'invalid_body', message: n.message }, 400);

  const tiles = await loadTiles(deps.db);
  if (!tiles) return c.json(NOT_READY, 503);
  const taken = new Set(tiles.map((t) => t.id));
  const base = tileIdFromLabel(n.value.labels.en!);
  let id = base;
  for (let i = 2; taken.has(id); i += 1) id = `${base.slice(0, 28)}_${i}`;
  const position = Math.max(0, ...tiles.filter((t) => t.id !== OTHERS_TILE_ID).map((t) => t.position)) + 10;

  const row = {
    id,
    position,
    enabled: n.value.enabled,
    icon: n.value.icon,
    labels: n.value.labels,
    sub_questions: n.value.sub_questions,
    id_prefixes: n.value.id_prefixes,
    kb_categories: [],
    scope_of: null,
    behavior: '',
    updated_by: staff.userId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await deps.db.from('menu_tiles').insert(row).select(TILE_COLUMNS).single();
  if (error || !data) return c.json({ error: 'server_error', message: 'Not saved. Please try again.' }, 500);
  await logTile(deps, id, 'create', staff.userId, null, row);
  const counts = await ruleCounts(deps);
  const noKnowledge = hasNoKnowledge(row, counts.byCode, counts.byCategory);
  await deps.sendSlack(
    `🧩 New chat topic "${row.labels.en}" added by ${staff.name}` +
      `${row.enabled ? '' : ' (hidden)'} — knowledge: ${row.id_prefixes.join(', ') || '(none)'}.` +
      `${noKnowledge ? ' ⚠️ No knowledge yet: every customer who taps it goes to staff.' : ''}`,
  );
  return c.json({ tile: data, no_knowledge: noKnowledge }, 201);
}

/** PUT /api/admin/tiles/:id — edit a tile (labels, icon, knowledge, questions, shown/hidden). */
export async function updateTile(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const staff = c.get('staff');
  const id = c.req.param('id') ?? '';
  const parsed = tileBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body', message: 'Some values are not valid.' }, 400);
  const n = normalise(parsed.data);
  if (!n.ok) return c.json({ error: 'invalid_body', message: n.message }, 400);

  const { data: existing } = await deps.db.from('menu_tiles').select(TILE_COLUMNS).eq('id', id).maybeSingle();
  if (!existing) return c.json({ error: 'not_found' }, 404);
  const before = existing as TileRow;
  const isOthers = id === OTHERS_TILE_ID;
  if (isOthers && !n.value.enabled)
    return c.json({ error: 'cannot_hide', message: '"Something else" is always shown.' }, 400);

  const patch = {
    enabled: isOthers ? true : n.value.enabled,
    icon: n.value.icon,
    labels: n.value.labels,
    sub_questions: n.value.sub_questions,
    // "Something else" always uses everything; a tile sharing another's range keeps its own codes unused.
    id_prefixes: isOthers || before.scope_of ? before.id_prefixes : n.value.id_prefixes,
    updated_by: staff.userId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await deps.db
    .from('menu_tiles')
    .update(patch)
    .eq('id', id)
    .select(TILE_COLUMNS)
    .single();
  if (error || !data) return c.json({ error: 'server_error', message: 'Not saved. Please try again.' }, 500);

  const action =
    before.enabled !== patch.enabled ? (patch.enabled ? 'enable' : 'disable') : 'update';
  const pick = (t: Partial<TileRow>) => ({
    enabled: t.enabled,
    icon: t.icon,
    labels: t.labels,
    sub_questions: t.sub_questions,
    id_prefixes: t.id_prefixes,
  });
  await logTile(deps, id, action, staff.userId, pick(before), pick(patch));
  const counts = await ruleCounts(deps);
  const after = { ...before, ...patch };
  const noKnowledge = hasNoKnowledge(after, counts.byCode, counts.byCategory);
  const verb = action === 'enable' ? 'shown again' : action === 'disable' ? 'hidden' : 'edited';
  await deps.sendSlack(
    `🧩 Chat topic "${patch.labels.en}" ${verb} by ${staff.name}.` +
      `${noKnowledge && patch.enabled ? ' ⚠️ No knowledge: every customer who taps it goes to staff.' : ''}`,
  );
  return c.json({ tile: data, no_knowledge: noKnowledge });
}

/** POST /api/admin/tiles/order — set the display order ("Something else" stays last). */
export async function reorderTiles(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const staff = c.get('staff');
  const parsed = orderSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
  const tiles = await loadTiles(deps.db);
  if (!tiles) return c.json(NOT_READY, 503);
  const known = new Set(tiles.map((t) => t.id));
  const wanted = [...new Set(parsed.data.ids)].filter((i) => i !== OTHERS_TILE_ID);
  if (wanted.some((i) => !known.has(i)) || wanted.length !== tiles.length - (known.has(OTHERS_TILE_ID) ? 1 : 0))
    return c.json({ error: 'stale', message: 'The list changed. Reload and try again.' }, 409);

  const order = [...wanted, ...(known.has(OTHERS_TILE_ID) ? [OTHERS_TILE_ID] : [])];
  const before = tiles.map((t) => t.id);
  for (const [i, tileId] of order.entries()) {
    const position = (i + 1) * 10;
    if (tiles.find((t) => t.id === tileId)?.position === position) continue;
    const { error } = await deps.db.from('menu_tiles').update({ position }).eq('id', tileId);
    if (error) return c.json({ error: 'server_error', message: 'Not saved. Please try again.' }, 500);
  }
  await logTile(deps, '*', 'reorder', staff.userId, { order: before }, { order });
  await deps.sendSlack(`🧩 Chat topic order changed by ${staff.name}.`);
  return c.json({ order });
}

/**
 * POST /api/admin/tiles/:id/instructions — save this topic's instructions as a
 * new AI behaviour DRAFT (a copy of the latest version with only this topic
 * changed). Going live needs Publish (safety tests).
 */
export async function saveTileInstructions(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const staff = c.get('staff');
  const id = c.req.param('id') ?? '';
  const parsed = instructionsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: 'invalid_body', message: `Topic instructions can be at most ${BEHAVIOUR_LIMITS.max.toLocaleString()} characters.` }, 400);
  const tiles = await loadTiles(deps.db);
  if (!tiles?.some((t) => t.id === id)) return c.json({ error: 'not_found' }, 404);

  const { latest } = await topicTexts(deps);
  const topics = { ...(latest?.topic_instructions ?? {}) };
  const text = parsed.data.text.trim();
  if ((topics[id] ?? '') === text) return c.json({ version_id: latest?.id ?? null, unchanged: true });
  if (text) topics[id] = text;
  else delete topics[id];

  const label = tiles.find((t) => t.id === id)?.labels.en ?? id;
  const note = `Topic instructions for "${label}" edited in Topics`;
  const { data, error } = await deps.db
    .from('ai_prompt_versions')
    .insert({
      state: 'draft',
      common_behaviour: latest?.common_behaviour ?? '',
      topic_instructions: topics,
      note,
      based_on: latest?.id ?? null,
      created_by: staff.userId,
    })
    .select('id')
    .single();
  if (error || !data) return c.json({ error: 'server_error', message: 'Not saved. Please try again.' }, 500);
  const versionId = (data as { id: number }).id;
  await deps.db
    .from('ai_prompt_change_log')
    .insert({ version_id: versionId, action: 'save_draft', changed_by: staff.userId, detail: { note, topic: id } });
  return c.json({ version_id: versionId }, 201);
}

/**
 * POST /api/admin/tiles/translate — draft the other 4 languages of a label and
 * its sample questions in ONE AI call (counts toward the daily AI limit). The
 * result fills the editor only; CS reviews it before saving.
 */
export async function translateTile(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const parsed = translateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
  const targets = TILE_LANGUAGES.filter((l) => l !== 'en');
  const system =
    'You translate short customer-support menu texts for a SIM card company in Japan whose customers are foreign residents. ' +
    'Use plain, simple, friendly words. Keep product words such as SIM, APN, eSIM and Wi-Fi as they are. ' +
    `Input: JSON {"label": string, "questions": string[]}. Output ONLY JSON: {${targets
      .map((l) => `"${l}": {"label": string, "questions": string[]}`)
      .join(', ')}} ` +
    '(id = Indonesian, tl = Tagalog, ne = Nepali in Devanagari script, vi = Vietnamese). Keep the same number and order of questions.';
  try {
    const out = await deps.llm.generate({
      system,
      messages: [
        { role: 'user', text: JSON.stringify({ label: parsed.data.label, questions: parsed.data.sub_questions }) },
      ],
      json: true,
      temperature: 0,
      purpose: 'translate',
    });
    const j = JSON.parse(out.trim()) as Record<string, { label?: unknown; questions?: unknown }>;
    const labels: Record<string, string> = {};
    const sub: Record<string, string[]> = {};
    for (const l of targets) {
      const v = j[l];
      if (typeof v?.label === 'string') labels[l] = v.label.trim().slice(0, TILE_LIMITS.label);
      if (
        Array.isArray(v?.questions) &&
        v.questions.length === parsed.data.sub_questions.length &&
        v.questions.every((q) => typeof q === 'string')
      )
        sub[l] = (v.questions as string[]).map((q) => q.trim().slice(0, TILE_LIMITS.subQuestion));
    }
    return c.json({ labels, sub_questions: sub });
  } catch {
    return c.json(
      { error: 'translate_failed', message: 'Could not translate right now (the AI may be busy or today’s limit used up). Type the translations, or leave them empty to show English.' },
      502,
    );
  }
}

/** GET /api/admin/tiles/changelog — tile change history (newest first). */
export async function listTileChangelog(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const { data, error } = await db
    .from('menu_tile_change_log')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(200);
  if (error) return c.json({ entries: [] });
  const { data: staff } = await db.from('staff').select('id,name');
  const names = new Map(((staff ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  return c.json({
    entries: ((data ?? []) as { changed_by: string | null }[]).map((e) => ({
      ...e,
      changed_by_name: (e.changed_by && names.get(e.changed_by)) || '',
    })),
  });
}

