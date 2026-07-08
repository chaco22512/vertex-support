import type { JSX } from 'preact';

/** SIM Point logo mark (public/logo-mark.png — the S/P mark cropped from the logo). */
export function LogoMark(props: { class?: string }): JSX.Element {
  return <img class={props.class} src="/logo-mark.png" alt="" aria-hidden="true" />;
}

/** Tabler-style stroke icon paths for the menu categories (menu_categories.json icon ids). */
const CATEGORY_ICON_PATHS: Record<string, string[]> = {
  'ti-wifi': [
    'M12 18l.01 0',
    'M9.17 15.17a4 4 0 0 1 5.66 0',
    'M6.34 12.34a8 8 0 0 1 11.32 0',
    'M3.51 9.51c4.69 -4.68 12.28 -4.68 17 0',
  ],
  'ti-credit-card': ['M3 5m0 3a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3z', 'M3 10l18 0', 'M7 15l.01 0', 'M11 15l2 0'],
  'ti-search': ['M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', 'M21 21l-6 -6'],
  'ti-circle-x': ['M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M10 10l4 4m0 -4l-4 4'],
  'ti-package': ['M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5', 'M12 12l8 -4.5', 'M12 12l0 9', 'M12 12l-8 -4.5'],
  'ti-refresh': ['M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4', 'M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4'],
  'ti-alert-triangle': ['M12 9v4', 'M10.24 3.957l-8.422 14.06a1.989 1.989 0 0 0 1.7 2.983h16.845a1.989 1.989 0 0 0 1.7 -2.983l-8.423 -14.06a1.989 1.989 0 0 0 -3.4 0z', 'M12 16h.01'],
  'ti-receipt': ['M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2', 'M9 7l6 0', 'M9 11l6 0', 'M9 15l4 0'],
  'ti-file-description': ['M14 3v4a1 1 0 0 0 1 1h4', 'M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z', 'M9 17h6', 'M9 13h6'],
  'ti-message-circle': ['M3 20l1.3 -3.9a9 8 0 1 1 3.4 2.9l-4.7 1', 'M12 12l0 .01', 'M8 12l0 .01', 'M16 12l0 .01'],
};

export function CategoryIcon(props: { name: string; class?: string }): JSX.Element {
  const paths = CATEGORY_ICON_PATHS[props.name] ?? CATEGORY_ICON_PATHS['ti-message-circle']!;
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {paths.map((d) => (
        <path d={d} />
      ))}
    </svg>
  );
}

export function AlertIcon(props: { class?: string }): JSX.Element {
  return (
    <svg class={props.class} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 9v4" />
      <path d="M12 16h.01" />
      <path d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18" />
    </svg>
  );
}
