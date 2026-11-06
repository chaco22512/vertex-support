/**
 * Category scoping for the AI prompt (build_spec_v1_4.md §4.1).
 * Resolves a conversation's topic_category to the set of kb_rules.category values
 * that should be included. Returns null to mean "all categories" (no filter).
 */

export interface MenuCategory {
  id: string;
  label_en?: string;
  kb_categories?: string[];
  /** ★v1.8: Rule ID topic codes used for this tile (e.g. DR001 → "DR"). */
  id_prefixes?: string[];
  /**
   * ★2026-11-06: use another tile's knowledge range (e.g. "connection" →
   * "internet"): the tiles differ only in their sample questions.
   */
  scope_of?: string;
  behavior?: string;
}

export interface MenuCategories {
  categories: MenuCategory[];
  /** ★2026-11-06: retired topic id → the tile it was merged into (old conversations). */
  aliases?: Record<string, string>;
}

/** Always included as shared context (menu_categories.json note). */
export const GENERAL_CATEGORY = 'GENERAL RULES';

/** A retired topic id (merged tile) → its current tile id; others unchanged. */
export function canonicalTopic(topicCategory: string, menu: MenuCategories): string {
  return menu.aliases?.[topicCategory] ?? topicCategory;
}

/** The tile whose knowledge range a topic uses (after aliases and scope_of). */
function scopeTile(topicCategory: string, menu: MenuCategories): MenuCategory | undefined {
  const own = menu.categories.find((c) => c.id === canonicalTopic(topicCategory, menu));
  if (!own?.scope_of) return own;
  return menu.categories.find((c) => c.id === own.scope_of) ?? own;
}

/**
 * The customer-facing English label for a topic id, used to inject topic
 * context into the prompt (★v1.6). Returns null for unknown / unset topics.
 */
export function resolveTopicLabel(topicCategory: string, menu: MenuCategories): string | null {
  if (!topicCategory) return null;
  const id = canonicalTopic(topicCategory, menu);
  return menu.categories.find((c) => c.id === id)?.label_en ?? null;
}

/**
 * @returns the list of kb_rules.category values to scope to, or null for "all
 *   active customer rules" (topic 'others', unset, unknown, or a '*' mapping).
 */
export function resolveKbCategories(
  topicCategory: string,
  menu: MenuCategories,
): string[] | null {
  if (!topicCategory || topicCategory === 'others') return null;

  const category = scopeTile(topicCategory, menu);
  if (!category || category.id === 'others') return null;

  const kb = category.kb_categories ?? [];
  if (kb.length === 0 || kb.includes('*')) return null;

  const set = new Set(kb);
  set.add(GENERAL_CATEGORY);
  return [...set];
}

/**
 * ★v1.8 §3.1 / §4.1: Rule ID topic codes (e.g. "DR") whose rules belong to
 * this tile, read from menu_categories.json `id_prefixes`. CS-managed rules
 * are scoped by their ID, so the free-text Topic column never breaks scoping.
 * Returns [] for unknown topics; callers pass null categories for "all".
 */
export function resolveIdPrefixes(topicCategory: string, menu: MenuCategories): string[] {
  const category = scopeTile(topicCategory, menu);
  return (category?.id_prefixes ?? []).filter((p) => /^[A-Z]{2,4}$/.test(p));
}

/** True when `id` is `code` + exactly 3 digits, so "IN" never matches "INT001". */
export function idHasCode(id: string, code: string): boolean {
  return id.length === code.length + 3 && id.startsWith(code) && /^\d{3}$/.test(id.slice(code.length));
}
