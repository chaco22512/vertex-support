import type { SupabaseClient } from '@supabase/supabase-js';
import type { KbRule } from '@vertex/shared';

/** PostgREST returns at most ~1000 rows per request; page through in this size. */
const PAGE_SIZE = 1000;

/**
 * Fetch the rules eligible for the AI prompt (build_spec_v1_5.md §4.1).
 *
 * HARD INVARIANT (CLAUDE.md Hard rule 3): only status='active' AND
 * audience='customer' AND ai_can_answer=true rows are ever returned —
 * pending_review, internal, and answer-disabled rules (e.g. an unfilled
 * placeholder left active, ★v1.6) must never reach the prompt. Callers cannot
 * opt out of this filter.
 *
 * Pages through the result in stable id order: the 'others' scope now spans two
 * manuals (>2000 active/customer rules), which exceeds PostgREST's per-request
 * row cap. A single select would silently truncate the manual, so we loop with
 * .range() until a short page signals the end.
 *
 * @param categories result of resolveKbCategories: a category allow-list, or
 *   null to include all active customer rules.
 * @param idPrefixes ★v1.8: Rule ID topic codes (resolveIdPrefixes) — rules
 *   whose id starts with one of them are included too (CS-managed rules are
 *   scoped by their ID). Ignored when `categories` is null (already all).
 */
export async function fetchScopedRules(
  client: SupabaseClient,
  categories: string[] | null,
  idPrefixes: string[] = [],
): Promise<KbRule[]> {
  const byCategory = await fetchPaged(client, (q) => (categories === null ? q : q.in('category', categories)));
  if (categories === null || idPrefixes.length === 0) return byCategory;

  // PostgREST or-filter on id prefixes; codes are validated 2-letter A–Z.
  const byPrefix = await fetchPaged(client, (q) =>
    q.or(idPrefixes.map((p) => `id.ilike.${p}%`).join(',')),
  );
  const merged = new Map<string, KbRule>();
  for (const r of [...byCategory, ...byPrefix]) merged.set(r.id, r);
  return [...merged.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

type RuleQuery = ReturnType<ReturnType<SupabaseClient['from']>['select']>;

/** Page through eligible rules (Hard rule 3 filter always applied) with an extra filter. */
async function fetchPaged(client: SupabaseClient, filter: (q: RuleQuery) => RuleQuery): Promise<KbRule[]> {
  const all: KbRule[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const query = filter(
      client
        .from('kb_rules')
        .select('*')
        .eq('status', 'active')
        .eq('audience', 'customer')
        .eq('ai_can_answer', true),
    ).order('id', { ascending: true });

    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`fetchScopedRules failed: ${error.message}`);

    const page = (data ?? []) as KbRule[];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return all;
}
