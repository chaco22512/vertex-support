import type { JSX } from 'preact';
import { tileIconPaths } from '@vertex/shared/tiles';

/** SIM Point logo mark (public/logo-mark.png — the S/P mark cropped from the logo). */
export function LogoMark(props: { class?: string }): JSX.Element {
  return <img class={props.class} src="/logo-mark.png" alt="" aria-hidden="true" />;
}

export function CategoryIcon(props: { name: string; class?: string }): JSX.Element {
  const paths = tileIconPaths(props.name);
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
