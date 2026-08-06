import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { IntakeInfo } from '@vertex/shared';
import type { UiStrings } from '../i18n';

const COMMON: (keyof IntakeInfo)[] = ['customer_number', 'smartpit', 'registered_phone'];
const TROUBLE = new Set(['internet', 'reissue', 'lost', 'replace']);
const BILLING = new Set(['cancel', 'payment', 'refund', 'return']);

/** Topic-appropriate intake fields (spec §6.2 v1.6). Common fields always shown. */
export function intakeFieldsFor(topic: string | null): (keyof IntakeInfo)[] {
  if (topic && TROUBLE.has(topic)) return [...COMMON, 'sim_iccid', 'device_model', 'tried_already'];
  if (topic && BILLING.has(topic)) return [...COMMON, 'gmo'];
  return COMMON;
}

const LABEL: Record<keyof IntakeInfo, keyof UiStrings> = {
  customer_number: 'fieldCustomerNumber',
  smartpit: 'fieldSmartpit',
  registered_phone: 'fieldRegisteredPhone',
  sim_iccid: 'fieldSimIccid',
  device_model: 'fieldDeviceModel',
  tried_already: 'fieldTriedAlready',
  gmo: 'fieldGmo',
};

/**
 * Pre-escalation "situation" card (§6.2 v1.6). All fields optional/skippable; on
 * Continue only non-empty fields are passed up, on Skip an empty object is passed.
 */
export function IntakeCard(props: {
  ui: UiStrings;
  topicCategory: string | null;
  lang: string;
  onDone: (intake: IntakeInfo) => void;
}): JSX.Element {
  const fields = intakeFieldsFor(props.topicCategory);
  const [values, setValues] = useState<IntakeInfo>({});
  const set = (k: keyof IntakeInfo, v: string) => setValues((s) => ({ ...s, [k]: v }));

  const submit = (e: Event) => {
    e.preventDefault();
    const cleaned: IntakeInfo = {};
    for (const k of fields) {
      const v = values[k]?.trim();
      if (v) cleaned[k] = v;
    }
    props.onDone(cleaned);
  };

  return (
    <form class="escalation" onSubmit={submit} lang={props.lang}>
      <h2>{props.ui.intakeTitle}</h2>
      {fields.map((k) =>
        k === 'tried_already' ? (
          <textarea
            key={k}
            rows={2}
            placeholder={props.ui[LABEL[k]]}
            aria-label={props.ui[LABEL[k]]}
            value={values[k] ?? ''}
            onInput={(e) => set(k, (e.target as HTMLTextAreaElement).value)}
          />
        ) : (
          <input
            key={k}
            type="text"
            placeholder={props.ui[LABEL[k]]}
            aria-label={props.ui[LABEL[k]]}
            value={values[k] ?? ''}
            onInput={(e) => set(k, (e.target as HTMLInputElement).value)}
          />
        ),
      )}
      <div class="row">
        <button type="button" class="btn btn--ghost" onClick={() => props.onDone({})}>
          {props.ui.intakeSkip}
        </button>
        <button type="submit" class="btn btn--primary">
          {props.ui.intakeContinue}
        </button>
      </div>
    </form>
  );
}
