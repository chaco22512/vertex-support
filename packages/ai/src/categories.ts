/**
 * Category scoping for the AI prompt (build_spec_v1_4.md §4.1).
 * Resolves a conversation's topic_category to the set of kb_rules.category values
 * that should be included. Returns null to mean "all categories" (no filter).
 */

export interface MenuCategory {
  id: string;
  kb_categories?: string[];
  behavior?: string;
}

export interface MenuCategories {
  categories: MenuCategory[];
}

/** Always included as shared context (menu_categories.json note). */
export const GENERAL_CATEGORY = 'GENERAL RULES';

/**
 * @returns the list of kb_rules.category values to scope to, or null for "all
 *   active customer rules" (topic 'others', unset, unknown, or a '*' mapping).
 */
export function resolveKbCategories(
  topicCategory: string,
  menu: MenuCategories,
): string[] | null {
  if (!topicCategory || topicCategory === 'others') return null;

  const category = menu.categories.find((c) => c.id === topicCategory);
  if (!category) return null;

  const kb = category.kb_categories ?? [];
  if (kb.length === 0 || kb.includes('*')) return null;

  const set = new Set(kb);
  set.add(GENERAL_CATEGORY);
  return [...set];
}
