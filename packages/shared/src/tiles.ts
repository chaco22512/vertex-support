import type { LanguageCode } from './types';

/**
 * ★2026-11-14 CS-managed chat tiles (admin "Topics", table menu_tiles).
 * Shared by the API (validation, /api/menu), the chat (rendering) and the
 * admin (editor). Icons are a fixed library of inline-SVG stroke paths so the
 * chat stays image-free (spec §5.3).
 */

export const TILE_LANGUAGES: LanguageCode[] = ['en', 'id', 'tl', 'ne', 'vi'];

/** Icon id → plain name (admin picker) + Tabler-style 24×24 stroke paths. */
export const TILE_ICONS: Record<string, { name: string; paths: string[] }> = {
  'ti-wifi': {
    name: 'Wi-Fi',
    paths: [
      'M12 18l.01 0',
      'M9.17 15.17a4 4 0 0 1 5.66 0',
      'M6.34 12.34a8 8 0 0 1 11.32 0',
      'M3.51 9.51c4.69 -4.68 12.28 -4.68 17 0',
    ],
  },
  'ti-alert-triangle': {
    name: 'Warning',
    paths: [
      'M12 9v4',
      'M10.24 3.957l-8.422 14.06a1.989 1.989 0 0 0 1.7 2.983h16.845a1.989 1.989 0 0 0 1.7 -2.983l-8.423 -14.06a1.989 1.989 0 0 0 -3.4 0z',
      'M12 16h.01',
    ],
  },
  'ti-credit-card': {
    name: 'Card',
    paths: [
      'M3 5m0 3a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3z',
      'M3 10l18 0',
      'M7 15l.01 0',
      'M11 15l2 0',
    ],
  },
  'ti-search': { name: 'Search', paths: ['M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', 'M21 21l-6 -6'] },
  'ti-circle-x': {
    name: 'Cancel',
    paths: ['M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M10 10l4 4m0 -4l-4 4'],
  },
  'ti-package': {
    name: 'Package',
    paths: ['M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5', 'M12 12l8 -4.5', 'M12 12l0 9', 'M12 12l-8 -4.5'],
  },
  'ti-refresh': {
    name: 'Refresh',
    paths: ['M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4', 'M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4'],
  },
  'ti-receipt': {
    name: 'Receipt',
    paths: [
      'M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2',
      'M9 7l6 0',
      'M9 11l6 0',
      'M9 15l4 0',
    ],
  },
  'ti-coin': {
    name: 'Coin',
    paths: [
      'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
      'M14.8 9a2 2 0 0 0 -1.8 -1h-1.8a1.8 1.8 0 0 0 0 3.6h1.6a1.8 1.8 0 0 1 0 3.6h-2a2 2 0 0 1 -1.8 -1',
      'M12 7v10',
    ],
  },
  'ti-file-description': {
    name: 'Document',
    paths: [
      'M14 3v4a1 1 0 0 0 1 1h4',
      'M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z',
      'M9 17h6',
      'M9 13h6',
    ],
  },
  'ti-discount': {
    name: 'Discount',
    paths: [
      'M9 15l6 -6',
      'M9.5 9.5m-.5 0a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0',
      'M14.5 14.5m-.5 0a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0',
      'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
    ],
  },
  'ti-plane': {
    name: 'Plane',
    paths: ['M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3z'],
  },
  'ti-gift': {
    name: 'Gift',
    paths: [
      'M3 8m0 1a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1z',
      'M12 8l0 13',
      'M19 12v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-7',
      'M7.5 8a2.5 2.5 0 0 1 0 -5a4.8 8 0 0 1 4.5 5a4.8 8 0 0 1 4.5 -5a2.5 2.5 0 0 1 0 5',
    ],
  },
  'ti-users': {
    name: 'People',
    paths: [
      'M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0',
      'M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2',
      'M16 3.13a4 4 0 0 1 0 7.75',
      'M21 21v-2a4 4 0 0 0 -3 -3.85',
    ],
  },
  'ti-calendar': {
    name: 'Calendar',
    paths: [
      'M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z',
      'M16 3v4',
      'M8 3v4',
      'M4 11h16',
    ],
  },
  'ti-device-mobile': {
    name: 'Phone',
    paths: [
      'M6 5a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-14z',
      'M11 4h2',
      'M12 17v.01',
    ],
  },
  'ti-phone': {
    name: 'Call',
    paths: [
      'M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2',
    ],
  },
  'ti-truck': {
    name: 'Delivery',
    paths: [
      'M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
      'M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
      'M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5',
    ],
  },
  'ti-mail': {
    name: 'Mail',
    paths: [
      'M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10z',
      'M3 7l9 6l9 -6',
    ],
  },
  'ti-user': {
    name: 'Person',
    paths: ['M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0', 'M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2'],
  },
  'ti-world': {
    name: 'World',
    paths: [
      'M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0',
      'M3.6 9h16.8',
      'M3.6 15h16.8',
      'M11.5 3a17 17 0 0 0 0 18',
      'M12.5 3a17 17 0 0 1 0 18',
    ],
  },
  'ti-clock': { name: 'Clock', paths: ['M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0', 'M12 7v5l3 3'] },
  'ti-home': {
    name: 'Home',
    paths: [
      'M5 12l-2 0l9 -9l9 9l-2 0',
      'M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7',
      'M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6',
    ],
  },
  'ti-shield': {
    name: 'Shield',
    paths: ['M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3'],
  },
  'ti-star': {
    name: 'Star',
    paths: [
      'M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z',
    ],
  },
  'ti-help-circle': {
    name: 'Help',
    paths: [
      'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
      'M12 16v.01',
      'M12 13a2 2 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483',
    ],
  },
  'ti-message-circle': {
    name: 'Message',
    paths: [
      'M3 20l1.3 -3.9a9 8 0 1 1 3.4 2.9l-4.7 1',
      'M12 12l0 .01',
      'M8 12l0 .01',
      'M16 12l0 .01',
    ],
  },
};

export const DEFAULT_TILE_ICON = 'ti-message-circle';

/** The paths for an icon id; unknown ids get the default icon. */
export function tileIconPaths(icon: string): string[] {
  return (TILE_ICONS[icon] ?? TILE_ICONS[DEFAULT_TILE_ICON]!).paths;
}

/** The fixed "Something else" tile: always last, cannot be disabled or moved. */
export const OTHERS_TILE_ID = 'others';

/** Limits enforced on save (API) and shown in the editor (admin). */
export const TILE_LIMITS = { label: 60, subQuestion: 120, subQuestions: 6, codes: 20 } as const;

/** What the customer chat receives from GET /api/menu (enabled tiles, in order). */
export interface PublicTile {
  id: string;
  icon: string;
  labels: Partial<Record<LanguageCode, string>> & { en: string };
  sub_questions: Partial<Record<LanguageCode, string[]>>;
  behavior: string;
}

/** A label in the customer's language, else English. */
export function tileLabel(tile: Pick<PublicTile, 'labels'>, lang: string): string {
  return tile.labels[lang as LanguageCode]?.trim() || tile.labels.en;
}

/** Sample questions in the customer's language, else English. */
export function tileSubQuestions(tile: Pick<PublicTile, 'sub_questions'>, lang: string): string[] {
  const own = tile.sub_questions[lang as LanguageCode]?.filter((s) => s.trim());
  return own && own.length > 0 ? own : (tile.sub_questions.en ?? []).filter((s) => s.trim());
}

/** A new tile id from its English label: "Holiday plans" → "holiday_plans". */
export function tileIdFromLabel(label: string): string {
  const base = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);
  return /^[a-z]/.test(base) ? base : `t_${base}`.slice(0, 31);
}
