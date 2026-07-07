import type { JSX } from 'preact';
import type { LanguageCode } from '@vertex/shared';
import { LANGUAGE_NATIVE_NAMES } from '../i18n';

export function LanguageScreen(props: {
  prompt: string;
  order: LanguageCode[];
  onSelect: (lang: LanguageCode) => void;
}): JSX.Element {
  return (
    <div class="language">
      <h1>{props.prompt}</h1>
      {props.order.map((lang) => (
        <button
          key={lang}
          class="lang-btn"
          lang={lang}
          onClick={() => props.onSelect(lang)}
        >
          {LANGUAGE_NATIVE_NAMES[lang]}
        </button>
      ))}
    </div>
  );
}
