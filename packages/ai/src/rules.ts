import type { SupabaseClient } from '@supabase/supabase-js';
import type { KbRule } from '@vertex/shared';

/**
 * Fetch the rules eligible for the AI prompt (build_spec_v1_4.md §4.1).
 *
 * HARD INVARIANT (CLAUDE.md Hard rule 3): only status='active' AND
 * audience='customer' rows are ever returned — pending_review and internal
 * rules must never reach the prompt. Callers cannot opt out of this filter.
 *
 * @param categories result of resolveKbCategories: a category allow-list, or
 *   null to include all active customer rules.
 */
export async function fetchScopedRules(
  client: SupabaseClient,
  categories: string[] | null,
): Promise<KbRule[]> {
  let query = client
    .from('kb_rules')
    .select('*')
    .eq('status', 'active')
    .eq('audience', 'customer');

  if (categories !== null) {
    query = query.in('category', categories);
  }

  const { data, error } = await query;
  if (error) throw new Error(`fetchScopedRules failed: ${error.message}`);
  return (data ?? []) as KbRule[];
}
