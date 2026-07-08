import type { JSX } from 'preact';
import type { UiStrings } from '../i18n';
import type { SubmittedContact } from '../state/flow';
import { successCardLines } from '../lib/format';

/** Confirmation shown after the escalation contact is accepted (§6.2). */
export function SuccessCard(props: { ui: UiStrings; contact: SubmittedContact; lang: string }): JSX.Element {
  const lines = successCardLines(props.ui, props.contact);
  return (
    <div class="escalation escalation--success" role="status" lang={props.lang}>
      <h2>
        <span class="escalation__check" aria-hidden="true">
          ✓
        </span>{' '}
        {lines.title}
      </h2>
      <ul class="escalation__points">
        <li>{lines.within24}</li>
        {lines.contactNote ? <li>{lines.contactNote}</li> : null}
      </ul>
    </div>
  );
}
