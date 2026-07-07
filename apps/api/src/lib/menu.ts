import type { MenuCategories } from '@vertex/ai';
import menuData from '../../../../data/menu_categories.json';

/** Bundled category menu (single source of truth: data/menu_categories.json, §6). */
export const menu = menuData as unknown as MenuCategories;
