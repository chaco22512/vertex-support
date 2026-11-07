import type { JSX } from 'preact';
import { LogoMark } from '../icons';

export function Header(props: {
  statusText: string;
  languageLabel: string;
  onChangeLanguage: () => void;
  /** ★2026-11-07: shown while a conversation is open; asks first, then starts fresh. */
  newChat?: { label: string; confirm: string; onConfirm: () => void };
}): JSX.Element {
  const nc = props.newChat;
  return (
    <header class="header">
      <LogoMark class="header__logo" />
      <div>
        <div class="header__title">SIM Point Support</div>
        <div class="header__status">{props.statusText}</div>
      </div>
      <div class="header__spacer" />
      {nc && (
        <button
          class="lang-pill"
          onClick={() => {
            if (window.confirm(nc.confirm)) nc.onConfirm();
          }}
        >
          {nc.label}
        </button>
      )}
      <button class="lang-pill" onClick={props.onChangeLanguage} aria-label="Change language">
        {props.languageLabel}
      </button>
    </header>
  );
}
