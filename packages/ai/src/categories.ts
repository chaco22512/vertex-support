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
export function resolveKbCategories(topicCategory: string, menu: MenuCategories): string[] | null {
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

/** True when `id` is `code` + 3–4 digits, so "IN" never matches "INT001". */
export function idHasCode(id: string, code: string): boolean {
  const n = id.length - code.length;
  return (n === 3 || n === 4) && id.startsWith(code) && /^\d+$/.test(id.slice(code.length));
}

/** A CS-added link between a topic code and tiles (admin "Topic codes", table kb_topic_codes). */
export interface TopicCodeLink {
  code: string;
  topics: string[];
}

/**
 * ★2026-11-07: the menu with CS-added topic-code links merged into each
 * tile's id_prefixes. A link to a tile that shares another's range
 * (scope_of, e.g. connection) is applied to that range; retired ids (aliases)
 * to the tile they were merged into. Unknown tiles / bad codes are ignored.
 */
export function withTopicCodes(menu: MenuCategories, links: TopicCodeLink[]): MenuCategories {
  if (links.length === 0) return menu;
  const extra = new Map<string, Set<string>>();
  for (const { code, topics } of links) {
    if (!/^[A-Z]{2,4}$/.test(code)) continue;
    for (const t of topics) {
      const tile = scopeTile(t, menu);
      if (!tile || tile.id === 'others') continue;
      if (!extra.has(tile.id)) extra.set(tile.id, new Set());
      extra.get(tile.id)!.add(code);
    }
  }
  return {
    ...menu,
    categories: menu.categories.map((c) => {
      const add = extra.get(c.id);
      if (!add) return c;
      return { ...c, id_prefixes: [...new Set([...(c.id_prefixes ?? []), ...add])] };
    }),
  };
}
