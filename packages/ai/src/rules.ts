import type { SupabaseClient } from '@supabase/supabase-js';
import type { KbRule } from '@vertex/shared';

/** PostgREST returns at most ~1000 rows per request; page through in this size. */
const PAGE_SIZE = 1000;

/**
 * Fetch the rules eligible for the AI prompt (build_spec_v1_5.md §4.1).
 *
 * HARD INVARIANT (CLAUDE.md Hard rule 3): only status='active' AND
 * audience='customer' rows are ever returned — pending_review and internal
 * rules must never reach the prompt. Callers cannot opt out of this filter.
 *
 * Pages through the result in stable id order: the 'others' scope now spans two
 * manuals (>2000 active/customer rules), which exceeds PostgREST's per-request
 * row cap. A single select would silently truncate the manual, so we loop with
 * .range() until a short page signals the end.
 *
 * @param categories result of resolveKbCategories: a category allow-list, or
 *   null to include all active customer rules.
 */
export async function fetchScopedRules(
  client: SupabaseClient,
  categories: string[] | null,
): Promise<KbRule[]> {
  const all: KbRule[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = client
      .from('kb_rules')
      .select('*')
      .eq('status', 'active')
      .eq('audience', 'customer')
      .order('id', { ascending: true });

    if (categories !== null) {
      query = query.in('category', categories);
    }

    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`fetchScopedRules failed: ${error.message}`);

    const page = (data ?? []) as KbRule[];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return all;
}
