import menuData from '../../../../data/menu_categories.json';
import type { Messages } from '../i18n';

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

/** Merge the English menu master with the active locale (§6.2/§6.3). */
export function localizedCategories(messages: Messages): LocalizedCategory[] {
  return raw.categories.map((c) => ({
    id: c.id,
    icon: c.icon,
    label: messages.categories[c.id] ?? c.label_en,
    behavior: c.behavior as CategoryBehavior,
    subQuestions: messages.subQuestions[c.id] ?? c.sub_questions ?? [],
  }));
}
