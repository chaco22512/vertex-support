import type { JSX } from 'preact';
import { LogoMark } from '../icons';

export function Header(props: {
  statusText: string;
  languageLabel: string;
  onChangeLanguage: () => void;
}): JSX.Element {
  return (
    <header class="header">
      <LogoMark class="header__logo" />
      <div>
        <div class="header__title">Vertex Support</div>
        <div class="header__status">{props.statusText}</div>
      </div>
      <div class="header__spacer" />
      <button class="lang-pill" onClick={props.onChangeLanguage} aria-label="Change language">
        {props.languageLabel}
      </button>
    </header>
  );
}
