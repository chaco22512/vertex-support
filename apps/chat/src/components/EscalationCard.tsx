import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { UiStrings } from '../i18n';

export function EscalationCard(props: {
  ui: UiStrings;
  onSubmit: (contact: { email?: string; whatsapp?: string }) => void;
}): JSX.Element {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const submit = (e: Event) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) {
      setError(true);
      return;
    }
    // One input (§6.1): treat an address containing "@" as email, else WhatsApp.
    props.onSubmit(v.includes('@') ? { email: v } : { whatsapp: v });
  };

  return (
    <form class="escalation" onSubmit={submit}>
      <h2>{props.ui.escalationTitle}</h2>
      <input
        type="text"
        value={value}
        placeholder={`${props.ui.emailPlaceholder} / ${props.ui.whatsappPlaceholder}`}
        aria-label={props.ui.emailPlaceholder}
        onInput={(e) => {
          setValue((e.target as HTMLInputElement).value);
          setError(false);
        }}
      />
      {error && <div class="error-note">{props.ui.contactValidation}</div>}
      <button type="submit" class="btn btn--primary">
        {props.ui.contactSend}
      </button>
    </form>
  );
}
