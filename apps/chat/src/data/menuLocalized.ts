import menuData from '../../../../data/menu_categories.json';
import type { Messages } from '../i18n';
import { tileLabel, tileSubQuestions, type PublicTile } from '@vertex/shared/tiles';

interface RawCategory {
  id: string;
  icon: string;
  label_en: string;
  kb_categories?: string[];
  sub_questions?: string[];
  behavior?: string;
}
interface RawMenu {
  categories: RawCategory[];
}

const raw = menuData as unknown as RawMenu;

export type CategoryBehavior = 'always_escalate' | 'free_text' | undefined;

export interface LocalizedCategory {
  id: string;
  icon: string;
  label: string;
  behavior: CategoryBehavior;
  subQuestions: string[];
}

/**
 * The menu in the customer's language. ★2026-11-14: the CS-managed tiles from
 * GET /api/menu when available (a missing translation shows English); otherwise
 * the built-in menu (English master + locale files, §6.2/§6.3).
 */
export function localizedCategories(
  messages: Messages,
  lang = 'en',
  remote: PublicTile[] | null = null,
): LocalizedCategory[] {
  if (remote && remote.length > 0) {
    return remote.map((t) => ({
      id: t.id,
      icon: t.icon,
      label: tileLabel(t, lang),
      behavior: (t.behavior || undefined) as CategoryBehavior,
      subQuestions: tileSubQuestions(t, lang),
    }));
  }
  return raw.categories.map((c) => ({
    id: c.id,
    icon: c.icon,
    label: messages.categories[c.id] ?? c.label_en,
    behavior: c.behavior as CategoryBehavior,
    subQuestions: messages.subQuestions[c.id] ?? c.sub_questions ?? [],
  }));
}
