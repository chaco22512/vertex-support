import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canonicalTopic,
  withTopicCodes,
  type MenuCategories,
  type MenuCategory,
  type TopicCodeLink,
} from '@vertex/ai';
import { OTHERS_TILE_ID, type PublicTile } from '@vertex/shared';
import menuData from '../../../../data/menu_categories.json';

/**
 * Bundled category menu (data/menu_categories.json, §6) — the fallback used
 * until table menu_tiles has rows or whenever it cannot be read.
 */
export const menu = menuData as unknown as MenuCategories;

/** ★2026-11-14 one row of menu_tiles (admin "Topics"). */
export interface TileRow {
  id: string;
  position: number;
  enabled: boolean;
  icon: string;
  labels: Record<string, string>;
  sub_questions: Record<string, string[]>;
  id_prefixes: string[];
  kb_categories: string[];
  scope_of: string | null;
  behavior: string;
  updated_at?: string;
}

export const TILE_COLUMNS =
  'id,position,enabled,icon,labels,sub_questions,id_prefixes,kb_categories,scope_of,behavior,updated_at';

/** The tiles in display order ("Something else" always last), or null when the table is empty / unreadable. */
export async function loadTiles(db: SupabaseClient): Promise<TileRow[] | null> {
  try {
    const { data, error } = await db.from('menu_tiles').select(TILE_COLUMNS).order('position');
    if (error || !data || data.length === 0) return null;
    return sortTiles(data as TileRow[]);
  } catch {
    return null;
  }
}

/** Display order: by position, "Something else" forced last. */
export function sortTiles(rows: TileRow[]): TileRow[] {
  return [...rows].sort((a, b) => {
    if (a.id === OTHERS_TILE_ID) return 1;
    if (b.id === OTHERS_TILE_ID) return -1;
    return a.position - b.position || a.id.localeCompare(b.id);
  });
}

/** A DB tile as the AI's menu entry (scoping, labels, topic switching). */
export function tileToCategory(t: TileRow): MenuCategory {
  return {
    id: t.id,
    label_en: t.labels?.en || t.id,
    kb_categories: t.kb_categories ?? [],
    id_prefixes: t.id_prefixes ?? [],
    ...(t.scope_of ? { scope_of: t.scope_of } : {}),
    ...(t.behavior ? { behavior: t.behavior } : {}),
    enabled: t.enabled,
  };
}

/** The menu built from DB tiles; retired-topic aliases still come from the bundled menu. */
export function menuFromTiles(tiles: TileRow[]): MenuCategories {
  return { categories: tiles.map(tileToCategory), aliases: menu.aliases };
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
 * The menu the AI scopes with. ★2026-11-14: the CS-managed tiles (menu_tiles,
 * including disabled ones so older conversations keep their range). Fallback:
 * the bundled menu plus the CS-added topic-code links (2026-11-07). Never fails.
 */
export async function loadMenu(db: SupabaseClient): Promise<MenuCategories> {
  const tiles = await loadTiles(db);
  if (tiles) return menuFromTiles(tiles);
  return withTopicCodes(menu, await loadTopicCodeLinks(db));
}

/** English label for a topic id, for the staff-visible "Topic:" marker (§6.2). */
export function topicLabelIn(m: MenuCategories, topicCategory: string): string | null {
  const id = canonicalTopic(topicCategory, m);
  return m.categories.find((c) => c.id === id)?.label_en ?? null;
}

/** Topics the model may assign a question to: enabled tiles except "Something else". */
export function assignableTopics(m: MenuCategories): { id: string; label: string }[] {
  return m.categories
    .filter((c) => c.id !== OTHERS_TILE_ID && c.enabled !== false)
    .map((c) => ({ id: c.id, label: c.label_en ?? c.id }));
}

/** GET /api/menu payload: enabled tiles in order, customer-facing fields only. */
export function publicTiles(tiles: TileRow[]): PublicTile[] {
  return tiles
    .filter((t) => t.enabled)
    .map((t) => ({
      id: t.id,
      icon: t.icon,
      labels: { ...t.labels, en: t.labels?.en || t.id },
      sub_questions: t.sub_questions ?? {},
      behavior: t.behavior ?? '',
    }));
}
