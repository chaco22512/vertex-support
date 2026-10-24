import type { MenuCategories } from '@vertex/ai';
import menuData from '../../../../data/menu_categories.json';

/** Bundled category menu (single source of truth: data/menu_categories.json, §6). */
export const menu = menuData as unknown as MenuCategories;

/** English label for a topic id, for the staff-visible "Topic:" marker (§6.2). */
export function topicLabel(topicCategory: string): string | null {
  const cat = menu.categories.find((c) => c.id === topicCategory);
  return cat?.label_en ?? null;
}
