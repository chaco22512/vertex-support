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
const menu = menuData as { categories: MenuCategory[]; aliases?: Record<string, string> };
const categories = menu.categories;
const byId = new Map(categories.map((c) => [c.id, c]));

/**
 * Human label for a conversation's topic_category (falls back to the raw id).
 * Retired topics (merged on 2026-11-06) show the tile they were merged into.
 */
export function topicLabel(topicId: string): string {
  const id = menu.aliases?.[topicId] ?? topicId;
  return liveLabels.get(id) ?? byId.get(id)?.label_en ?? topicId ?? '—';
}

/** ★2026-11-14 English labels of the CS-managed tiles (admin "Topics"), loaded once per session. */
const liveLabels = new Map<string, string>();
let primed: Promise<void> | null = null;
export function primeTopicLabels(): Promise<void> {
  // Dynamic import keeps this module free of the Supabase client (pure helpers).
  primed ??= import('./api')
    .then(({ api }) => api.publicMenu())
    .then((r) => {
      for (const t of r.tiles ?? []) if (t.labels?.en) liveLabels.set(t.id, t.labels.en);
    })
    .catch(() => {
      primed = null; // try again next time; the built-in labels stay meanwhile
    });
  return primed;
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
