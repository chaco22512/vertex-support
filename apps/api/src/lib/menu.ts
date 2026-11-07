import type { SupabaseClient } from '@supabase/supabase-js';
import { withTopicCodes, type MenuCategories, type TopicCodeLink } from '@vertex/ai';
import menuData from '../../../../data/menu_categories.json';

/** Bundled category menu (single source of truth: data/menu_categories.json, §6). */
export const menu = menuData as unknown as MenuCategories;

/** English label for a topic id, for the staff-visible "Topic:" marker (§6.2). */
export function topicLabel(topicCategory: string): string | null {
  const cat = menu.categories.find((c) => c.id === topicCategory);
  return cat?.label_en ?? null;
}

/** CS-added topic-code → tile links (admin "Topic codes"). [] when the table cannot be read. */
export async function loadTopicCodeLinks(db: SupabaseClient): Promise<TopicCodeLink[]> {
  try {
    const { data, error } = await db.from('kb_topic_codes').select('code,topics');
    if (error || !data) return [];
    return (data as { code: string; topics: string[] | null }[]).map((r) => ({
      code: r.code,
      topics: r.topics ?? [],
    }));
  } catch {
    return [];
  }
}

/**
 * ★2026-11-07: the menu the AI scopes with — the bundled menu plus the CS-added
 * topic-code links. Never fails: without the table it is the bundled menu.
 */
export async function loadMenu(db: SupabaseClient): Promise<MenuCategories> {
  return withTopicCodes(menu, await loadTopicCodeLinks(db));
}
