import type { Context } from 'hono';
import {
  DEFAULT_COMMON_BEHAVIOUR,
  GeminiError,
  SAFETY_RULES_TEXT,
  SAFETY_TESTS,
  SYSTEM_TEXT,
  evaluateSafety,
  fetchScopedRules,
  resolveIdPrefixes,
  resolveKbCategories,
  resolveTopicLabel,
  runAiReply,
  type SafetyReport,
  type SafetyRun,
} from '@vertex/ai';
import type { AppEnv, Deps } from '../../types';
import { saveBehaviourSchema, tryBehaviourSchema } from '../../dto';
import { menu } from '../../lib/menu';
import { BEHAVIOUR_LIMITS, BEHAVIOUR_TOPICS, type BehaviourContent } from '../../lib/aiBehaviour';

/**
 * Admin "AI behaviour" tab (spec v1.8 §7.8): CS edits layers ② (common) and
 * ③ (per topic). Every save is a new immutable version; publishing runs the
 * fixed safety tests on that version and only publishes when all pass. The ①
 * safety rules are returned read-only and cannot be changed here.
 */

/** Per-call budget for a safety-test / Try-it model call. */
const TEST_TIMEOUT_MS = 20_000;

interface VersionRow extends BehaviourContent {
  id: number;
  state: 'draft' | 'published' | 'superseded';
  created_by: string | null;
  created_at: string;
  published_by: string | null;
  published_at: string | null;
  safety_report: SafetyReport | null;
  note: string;
  based_on: number | null;
}

const LIST_COLUMNS = 'id,state,created_by,created_at,published_by,published_at,safety_report,note,based_on';

async function staffNames(deps: Deps): Promise<Map<string, string>> {
  const { data } = await deps.db.from('staff').select('id,name,is_active');
  return new Map(((data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
}

async function log(deps: Deps, versionId: number, action: string, by: string, detail: Record<string, unknown> = {}) {
  await deps.db.from('ai_prompt_change_log').insert({ version_id: versionId, action, changed_by: by, detail });
}

/** Keep only known topic ids with non-empty-or-empty text (unknown keys are rejected upstream). */
function unknownTopics(topics: Record<string, string>): string[] {
  const ids = new Set(BEHAVIOUR_TOPICS.map((t) => t.id));
  return Object.keys(topics).filter((k) => !ids.has(k));
}

/** GET /api/admin/ai-behaviour — fixed layers, topics, limits, latest + published version, history. */
export async function getAiBehaviour(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const [{ data: latest }, { data: published }, { data: history }, names] = await Promise.all([
    deps.db.from('ai_prompt_versions').select('*').order('id', { ascending: false }).limit(1).maybeSingle(),
    deps.db.from('ai_prompt_versions').select('*').eq('state', 'published').maybeSingle(),
    deps.db.from('ai_prompt_versions').select(LIST_COLUMNS).order('id', { ascending: false }).limit(20),
    staffNames(deps),
  ]);
  const name = (id: string | null) => (id && names.get(id)) || '';
  return c.json({
    fixed: { system: SYSTEM_TEXT, safety_rules: SAFETY_RULES_TEXT },
    default_common_behaviour: DEFAULT_COMMON_BEHAVIOUR,
    topics: BEHAVIOUR_TOPICS,
    limits: BEHAVIOUR_LIMITS,
    latest: latest ?? null,
    published: published ?? null,
    versions: ((history ?? []) as Omit<VersionRow, keyof BehaviourContent>[]).map((v) => ({
      id: v.id,
      state: v.state,
      created_at: v.created_at,
      created_by_name: name(v.created_by),
      published_at: v.published_at,
      published_by_name: name(v.published_by),
      note: v.note,
      based_on: v.based_on,
      safety_passed: v.safety_report ? v.safety_report.passed : null,
    })),
  });
}

/** GET /api/admin/ai-behaviour/versions/:id — one version's full text (for diffs). */
export async function getVersion(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const { data } = await deps.db
    .from('ai_prompt_versions')
    .select('*')
    .eq('id', Number(c.req.param('id')))
    .maybeSingle();
  if (!data) return c.json({ error: 'not_found' }, 404);
  return c.json({ version: data });
}

/** POST /api/admin/ai-behaviour/versions — save the editor as a new draft version. */
export async function saveVersion(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const staff = c.get('staff');
  const parsed = saveBehaviourSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body', message: 'Text is too long or malformed.' }, 400);
  const bad = unknownTopics(parsed.data.topic_instructions);
  if (bad.length) return c.json({ error: 'unknown_topic', topics: bad }, 400);

  const { data, error } = await deps.db
    .from('ai_prompt_versions')
    .insert({
      state: 'draft',
      common_behaviour: parsed.data.common_behaviour,
      topic_instructions: parsed.data.topic_instructions,
      note: parsed.data.note,
      based_on: parsed.data.based_on ?? null,
      created_by: staff.userId,
    })
    .select()
    .single();
  if (error || !data) return c.json({ error: 'server_error' }, 500);
  const version = data as VersionRow;
  await log(deps, version.id, 'save_draft', staff.userId, { note: version.note });
  return c.json({ version }, 201);
}

function runErrorKind(err: unknown, signal: AbortSignal): string {
  if (err instanceof GeminiError && err.status === 429) return 'rate_limited';
  if (signal.aborted) return 'timeout';
  return 'llm_error';
}

/** Run the fixed safety question set with a version's text (4 model calls, in parallel). */
export async function runSafetyTests(deps: Deps, content: BehaviourContent): Promise<SafetyReport> {
  const topicIds = [...new Set(SAFETY_TESTS.map((t) => t.topic))];
  const rulesByTopic = new Map(
    await Promise.all(
      topicIds.map(async (id) => [id, await fetchScopedRules(deps.db, resolveKbCategories(id, menu), resolveIdPrefixes(id, menu))] as const),
    ),
  );
  const lostRules = rulesByTopic.get('lost') ?? (await fetchScopedRules(deps.db, resolveKbCategories('lost', menu), resolveIdPrefixes('lost', menu)));
  const lostFees = [...new Set(lostRules.flatMap((r) => r.fee_amounts_jpy))];
  const { data: staffRows } = await deps.db.from('staff').select('name,is_active');
  const names = ((staffRows ?? []) as { name: string; is_active: boolean }[])
    .filter((s) => s.is_active !== false)
    .map((s) => s.name);

  const runs: SafetyRun[] = await Promise.all(
    SAFETY_TESTS.map(async (test): Promise<SafetyRun> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
      try {
        const result = await runAiReply({
          rules: rulesByTopic.get(test.topic) ?? [],
          history: [{ sender: 'customer', body: test.question }],
          language: 'en',
          topic: resolveTopicLabel(test.topic, menu),
          topics: BEHAVIOUR_TOPICS,
          behaviour: { common: content.common_behaviour, topic: content.topic_instructions?.[test.topic] ?? '' },
          llm: deps.llm,
          signal: controller.signal,
        });
        return { test, result };
      } catch (err) {
        return { test, error: runErrorKind(err, controller.signal) };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return evaluateSafety(runs, { lostFees, staffNames: names });
}

/**
 * Test a saved version and publish it only if every check passes. Shared by
 * publish and restore. Returns the HTTP response.
 */
async function testAndPublish(c: Context<AppEnv>, version: VersionRow, action: 'publish' | 'restore'): Promise<Response> {
  const deps = c.get('deps');
  const staff = c.get('staff');
  const report = await runSafetyTests(deps, version);
  await deps.db.from('ai_prompt_versions').update({ safety_report: report }).eq('id', version.id);

  if (!report.passed) {
    await log(deps, version.id, 'publish_blocked', staff.userId, {
      failed: report.checks.filter((x) => !x.pass).map((x) => x.id),
    });
    return c.json({ published: false, version_id: version.id, report }, 422);
  }

  const now = new Date().toISOString();
  // Supersede first: the unique index allows only one published version.
  await deps.db.from('ai_prompt_versions').update({ state: 'superseded' }).eq('state', 'published');
  const { error } = await deps.db
    .from('ai_prompt_versions')
    .update({ state: 'published', published_by: staff.userId, published_at: now })
    .eq('id', version.id);
  if (error) return c.json({ error: 'server_error' }, 500);
  await log(deps, version.id, action === 'restore' ? 'restore' : 'publish', staff.userId, {
    based_on: version.based_on,
  });

  const link = `${deps.adminOrigin.replace(/\/$/, '')}/ai-behaviour`;
  await deps.sendSlack(
    `🤖 AI behaviour ${action === 'restore' ? 'restored' : 'published'} by ${staff.name} — version #${version.id}` +
      `${version.note ? ` ("${version.note}")` : ''}. Safety tests: ${report.checks.length}/${report.checks.length} passed.` +
      `\n▶ AI behaviour: ${link}`,
  );
  return c.json({ published: true, version_id: version.id, report });
}

async function loadVersion(c: Context<AppEnv>): Promise<VersionRow | null> {
  const { data } = await c
    .get('deps')
    .db.from('ai_prompt_versions')
    .select('*')
    .eq('id', Number(c.req.param('id')))
    .maybeSingle();
  return (data as VersionRow | null) ?? null;
}

/** POST /api/admin/ai-behaviour/versions/:id/publish */
export async function publishVersion(c: Context<AppEnv>): Promise<Response> {
  const version = await loadVersion(c);
  if (!version) return c.json({ error: 'not_found' }, 404);
  if (version.state === 'published') return c.json({ error: 'already_published' }, 409);
  return testAndPublish(c, version, 'publish');
}

/** POST /api/admin/ai-behaviour/versions/:id/restore — copy an older version and publish it (with tests). */
export async function restoreVersion(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const staff = c.get('staff');
  const source = await loadVersion(c);
  if (!source) return c.json({ error: 'not_found' }, 404);
  const { data, error } = await deps.db
    .from('ai_prompt_versions')
    .insert({
      state: 'draft',
      common_behaviour: source.common_behaviour,
      topic_instructions: source.topic_instructions,
      note: `Restored from version #${source.id}`,
      based_on: source.id,
      created_by: staff.userId,
    })
    .select()
    .single();
  if (error || !data) return c.json({ error: 'server_error' }, 500);
  return testAndPublish(c, data as VersionRow, 'restore');
}

/** POST /api/admin/ai-behaviour/try — one sandbox reply with unsaved text (no conversation, no DB writes). */
export async function tryBehaviour(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const parsed = tryBehaviourSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
  if (!BEHAVIOUR_TOPICS.some((t) => t.id === parsed.data.topic)) return c.json({ error: 'unknown_topic' }, 400);

  const rules = await fetchScopedRules(
    deps.db,
    resolveKbCategories(parsed.data.topic, menu),
    resolveIdPrefixes(parsed.data.topic, menu),
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  try {
    const r = await runAiReply({
      rules,
      history: [{ sender: 'customer', body: parsed.data.question }],
      language: 'en',
      topic: resolveTopicLabel(parsed.data.topic, menu),
      topics: BEHAVIOUR_TOPICS,
      behaviour: { common: parsed.data.common_behaviour, topic: parsed.data.topic_text },
      llm: deps.llm,
      signal: controller.signal,
    });
    return c.json({
      answer: r.answer,
      action: r.aiMeta.action,
      reason: r.aiMeta.reason,
      follow_up: r.aiMeta.follow_up,
      rule_ids: r.aiMeta.rule_ids,
      detected_language: r.detected_language,
      format_ok: !r.fellBack,
    });
  } catch (err) {
    const kind = runErrorKind(err, controller.signal);
    return c.json(
      {
        error: kind,
        message:
          kind === 'rate_limited'
            ? 'The AI usage limit was reached. Try again later.'
            : kind === 'timeout'
              ? 'The AI took too long to reply. Try again.'
              : 'The AI service had a problem. Try again.',
      },
      503,
    );
  } finally {
    clearTimeout(timer);
  }
}
