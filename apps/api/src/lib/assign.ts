import type { SupabaseClient } from '@supabase/supabase-js';

export interface Assignee {
  id: string;
  slackMemberId: string;
}

/**
 * Pick the staff member to assign an escalation to (§8): active staff whose
 * languages include the customer language, with the fewest currently-open
 * (escalated / staff_replied) conversations. Returns null when nobody matches
 * (conversation stays unassigned → Slack notifies @channel).
 */
export async function pickAssignee(db: SupabaseClient, language: string): Promise<Assignee | null> {
  const { data: staffRows } = await db
    .from('staff')
    .select('id,slack_member_id,languages,is_active')
    .eq('is_active', true);

  const candidates = ((staffRows ?? []) as {
    id: string;
    slack_member_id: string | null;
    languages: string[] | null;
  }[]).filter((s) => Array.isArray(s.languages) && s.languages.includes(language));
  if (candidates.length === 0) return null;

  const ids = candidates.map((s) => s.id);
  const { data: openRows } = await db
    .from('conversations')
    .select('assigned_staff,status')
    .in('status', ['escalated', 'staff_replied'])
    .in('assigned_staff', ids);

  const load = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const row of (openRows ?? []) as { assigned_staff: string | null }[]) {
    if (row.assigned_staff && load.has(row.assigned_staff)) {
      load.set(row.assigned_staff, (load.get(row.assigned_staff) ?? 0) + 1);
    }
  }

  // Fewest current assignments wins; stable on the candidate order for ties.
  let best = candidates[0]!;
  let bestLoad = load.get(best.id) ?? 0;
  for (const s of candidates.slice(1)) {
    const l = load.get(s.id) ?? 0;
    if (l < bestLoad) {
      best = s;
      bestLoad = l;
    }
  }
  return { id: best.id, slackMemberId: best.slack_member_id ?? '' };
}
