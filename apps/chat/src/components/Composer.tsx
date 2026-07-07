import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

export function Composer(props: {
  placeholder: string;
  sendLabel: string;
  disabled?: boolean;
  onSend: (body: string) => void;
}): JSX.Element {
  const [value, setValue] = useState('');

  const submit = (e: Event) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    props.onSend(trimmed);
    setValue('');
  };

  return (
    <form class="composer" onSubmit={submit}>
      <input
        type="text"
        value={value}
        placeholder={props.placeholder}
        aria-label={props.placeholder}
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
        disabled={props.disabled}
      />
      <button type="submit" class="btn btn--primary" disabled={props.disabled || !value.trim()}>
        {props.sendLabel}
      </button>
    </form>
  );
}
