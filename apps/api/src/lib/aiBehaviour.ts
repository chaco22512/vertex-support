import type { SupabaseClient } from '@supabase/supabase-js';
import type { PromptBehaviour } from '@vertex/ai';
import { menu } from './menu';

/**
 * CS-editable AI behaviour (spec v1.8 §4.2.1 / §7.8): layer ② (common) and
 * layer ③ (per topic), versioned in ai_prompt_versions. The ① safety rules
 * are fixed in code (packages/ai prompt.ts) and never stored here.
 */

/** Topics that get their own ③ tab — every menu topic the AI answers ('plans' never reaches the AI). */
export const BEHAVIOUR_TOPICS = menu.categories
  .filter((c) => c.id !== 'plans')
  .map((c) => ({ id: c.id, label: c.label_en ?? c.id }));

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
export function behaviourFor(content: BehaviourContent | null, topicId: string | null): PromptBehaviour | undefined {
  if (!content) return undefined;
  return {
    common: content.common_behaviour ?? '',
    topic: (topicId && content.topic_instructions?.[topicId]) || '',
  };
}
