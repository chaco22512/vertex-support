import type { SupabaseClient } from '@supabase/supabase-js';
import type { KbRule } from '@vertex/shared';

/** PostgREST returns at most 1000 rows per request (server max-rows). */
const PAGE = 1000;

export interface RuleFilters {
  q?: string;
  category?: string;
  status?: string;
}

/**
 * Page through kb_rules (id order) applying optional filters — no 1000 cap
 * (spec v1.8 §4.1.0). Every admin path that lists or counts rules must use
 * this instead of a single `.limit(1000)` select, which silently truncated the
 * Knowledge list to C/F/P rules and hid the whole R series.
 */
export async function fetchAllRules(db: SupabaseClient, filters: RuleFilters): Promise<KbRule[]> {
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
