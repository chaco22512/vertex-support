import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicalTopic, type MenuCategories, type PromptBehaviour } from '@vertex/ai';

/**
 * CS-editable AI behaviour (spec v1.8 §4.2.1 / §7.8): layer ② (common) and
 * layer ③ (per topic), versioned in ai_prompt_versions. The ① safety rules
 * are fixed in code (packages/ai prompt.ts) and never stored here.
 */

/**
 * Topics that get their own ③ tab — every menu tile (★2026-11-14 from the
 * CS-managed tiles, so a tile created in "Topics" gets its own tab).
 */
export function behaviourTopics(m: MenuCategories): { id: string; label: string }[] {
  return m.categories.map((c) => ({ id: c.id, label: c.label_en ?? c.id }));
}

/** Size guidance shown in the editor; `max` is enforced on save. */
export const BEHAVIOUR_LIMITS = { commonTarget: 6_000, topicTarget: 5_000, max: 12_000 } as const;

export interface BehaviourContent {
  common_behaviour: string;
  topic_instructions: Record<string, string>;
}

/** The published version's text, or null when none is published / it cannot be read. */
export async function loadPublishedBehaviour(db: SupabaseClient): Promise<BehaviourContent | null> {
  try {
    const { data, error } = await db
      .from('ai_prompt_versions')
      .select('common_behaviour,topic_instructions')
      .eq('state', 'published')
      .maybeSingle();
    if (error || !data) return null;
    return data as BehaviourContent;
  } catch {
    return null;
  }
}

/**
 * The ②/③ layers for one topic. `undefined` = nothing published → the prompt
 * uses its built-in default (the pre-v1.8 wording), so the bot never breaks.
 */
export function behaviourFor(
  content: BehaviourContent | null,
  topicId: string | null,
  menu: MenuCategories,
): PromptBehaviour | undefined {
  if (!content) return undefined;
  return {
    common: content.common_behaviour ?? '',
    topic: topicGuidance(content, topicId, menu),
  };
}

/**
 * ③ for a topic: its own text; for a tile sharing another's range (scope_of,
 * e.g. connection → internet) with no text of its own, the shared tile's text;
 * retired ids (aliases) use the tile they were merged into.
 */
function topicGuidance(
  content: BehaviourContent,
  topicId: string | null,
  menu: MenuCategories,
): string {
  if (!topicId) return '';
  const id = canonicalTopic(topicId, menu);
  const own = content.topic_instructions?.[id];
  if (own) return own;
  const parent = menu.categories.find((c) => c.id === id)?.scope_of;
  return (parent && content.topic_instructions?.[parent]) || '';
}

