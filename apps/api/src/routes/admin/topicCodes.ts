import type { Context } from 'hono';
import { isTopicCode, normalizeRuleId, ruleIdCode, RULE_ID_CODES } from '@vertex/shared';
import type { AppEnv } from '../../types';
import { topicCodeSchema } from '../../dto';
import { fetchAllRules } from '../../lib/kbRules';
import { loadTopicCodeLinks, menu } from '../../lib/menu';

/**
 * ★2026-11-07 admin "Topic codes": which chat tiles use the rules of each Rule
 * ID topic code (DR001 → DR). Built-in links come from
 * data/menu_categories.json and are read-only here; CS adds links (and new
 * codes such as ESP) in table kb_topic_codes. The AI range of a tile is the
 * union of both (lib/menu loadMenu).
 */

/** Tiles a code can be linked to: every tile with its own knowledge range except "Something else". */
function linkableTiles(): { id: string; label: string }[] {
  const shared = new Map<string, string[]>();
  for (const c of menu.categories) {
    if (c.scope_of) shared.set(c.scope_of, [...(shared.get(c.scope_of) ?? []), c.label_en ?? c.id]);
  }
  return menu.categories
    .filter((c) => !c.scope_of && c.id !== 'others')
    .map((c) => {
      const label = c.label_en ?? c.id;
      const also = shared.get(c.id);
      return { id: c.id, label: also ? `${label} + ${also.join(' + ')}` : label };
    });
}

/** GET /api/admin/topic-codes */
export async function listTopicCodes(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const tiles = linkableTiles();
  const [links, rules, labels] = await Promise.all([
    loadTopicCodeLinks(db),
    fetchAllRules(db, {}),
    db.from('kb_topic_codes').select('code,label'),
  ]);
  const labelOf = new Map(
    ((labels.data ?? []) as { code: string; label: string }[]).map((r) => [r.code, r.label]),
  );
  const extra = new Map(links.map((l) => [l.code, l.topics]));

  const counts = new Map<string, number>();
  for (const r of rules) {
    if (r.status === 'archived') continue;
    const code = ruleIdCode(r.id);
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  const codes = new Set([...Object.keys(RULE_ID_CODES), ...extra.keys(), ...counts.keys()]);
  const rows = [...codes].sort().map((code) => {
    const builtinTopics = tiles
      .filter((t) => menu.categories.find((m) => m.id === t.id)?.id_prefixes?.includes(code))
      .map((t) => t.id);
    const extraTopics = (extra.get(code) ?? []).filter((t) => !builtinTopics.includes(t));
    return {
      code,
      label: labelOf.get(code) || RULE_ID_CODES[code] || '',
      builtin: code in RULE_ID_CODES,
      builtin_topics: builtinTopics,
      extra_topics: extraTopics,
      rule_count: counts.get(code) ?? 0,
      /** Not built in and on no tile: only "Something else" / the full-manual search use it. */
      unlinked: !(code in RULE_ID_CODES) && builtinTopics.length + extraTopics.length === 0,
    };
  });
  return c.json({ tiles, codes: rows });
}

/** PUT /api/admin/topic-codes/:code — set the CS-added tiles (and label) of one code. */
export async function putTopicCode(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const staff = c.get('staff');
  const code = normalizeRuleId(c.req.param('code') ?? '');
  if (!isTopicCode(code)) {
    return c.json(
      { error: 'invalid_code', message: 'A topic code is 2–4 capital letters, e.g. ESP.' },
      400,
    );
  }
  const parsed = topicCodeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
  const tileIds = new Set(linkableTiles().map((t) => t.id));
  const unknown = parsed.data.topics.filter((t) => !tileIds.has(t));
  if (unknown.length > 0) return c.json({ error: 'unknown_topics', topics: unknown }, 400);
  const topics = [...new Set(parsed.data.topics)];

  const row = {
    label: parsed.data.label,
    topics,
    updated_by: staff.userId,
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await deps.db
    .from('kb_topic_codes')
    .select('code')
    .eq('code', code)
    .maybeSingle();
  const { error } = existing
    ? await deps.db.from('kb_topic_codes').update(row).eq('code', code)
    : await deps.db.from('kb_topic_codes').insert({ code, ...row });
  if (error) return c.json({ error: 'server_error', message: 'Not saved. Please try again.' }, 500);

  const names = linkableTiles()
    .filter((t) => topics.includes(t.id))
    .map((t) => t.label);
  await deps.sendSlack(
    `🏷 Topic code ${code} — ${staff.name} set its extra tiles to: ${names.length ? names.join(', ') : '(none)'}.`,
  );
  return c.json({ code, topics });
}
