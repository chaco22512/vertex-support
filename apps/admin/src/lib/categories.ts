import menuData from '../../../../data/menu_categories.json';

interface MenuCategory {
  id: string;
  icon?: string;
  label_en?: string;
  kb_categories?: string[];
  sub_questions?: string[];
}

// menu_categories.json is { version, note, categories: [...] } — the array is
// nested under `categories`, not the top-level value.
const categories = (menuData as { categories: MenuCategory[] }).categories;
const byId = new Map(categories.map((c) => [c.id, c]));

/** Human label for a conversation's topic_category (falls back to the raw id). */
export function topicLabel(topicId: string): string {
  return byId.get(topicId)?.label_en ?? topicId ?? '—';
}

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  id: 'Bahasa Indonesia',
  tl: 'Tagalog',
  ne: 'नेपाली',
  vi: 'Tiếng Việt',
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}
