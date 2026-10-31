/**
 * Rule ID convention for CS-managed knowledge (spec v1.8 §3.1): a 2-letter
 * topic code + a 3-digit number, e.g. DR001. Letters and digits only, case-
 * insensitive (stored upper-case), unique within a sheet. The code also decides
 * which chat topic(s) the AI uses the rule for (data/menu_categories.json
 * `id_prefixes`), so CS can word the Topic column however they like.
 */

/** Topic codes CS may use, with the plain-English topic each one stands for. */
export const RULE_ID_CODES: Record<string, string> = {
  IN: 'Internet / APN',
  PY: 'Payment & monthly bill',
  LS: 'Lost SIM or device',
  CN: 'Cancellation',
  RT: 'Returning SIM / device',
  RP: 'Replacement / change plan',
  RI: 'Signal stopped / re-issue',
  RF: 'Refund / deposit / cashback',
  DR: 'Deposit refund',
  PL: 'Plans & prices',
  GN: 'General (used on every topic)',
  OT: 'Other',
};

const NEW_ID = /^([A-Z]{2})(\d{3})$/;

/** Upper-case + trim, so "dr001 " and "DR001" are the same rule. */
export function normalizeRuleId(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Check a NEW rule's ID against the convention. Returns null when valid, else
 * a plain-English message that says what to do next.
 */
export function ruleIdProblem(id: string): string | null {
  if (!id) {
    return 'This row has no Rule ID. Give it an ID made of the topic code and the next free number, e.g. DR016.';
  }
  if (!/^[A-Z0-9]+$/.test(id)) {
    return `Rule ID "${id}" may only contain letters and numbers (no spaces or symbols), e.g. DR001.`;
  }
  const m = id.match(NEW_ID);
  if (!m) {
    return `Rule ID "${id}" is not in the expected format. Use 2 letters for the topic + 3 numbers, e.g. DR001.`;
  }
  if (!RULE_ID_CODES[m[1]!]) {
    const codes = Object.entries(RULE_ID_CODES)
      .map(([code, label]) => `${code} (${label})`)
      .join(', ');
    return `Rule ID "${id}" starts with "${m[1]}", which is not a topic code. Use one of: ${codes}.`;
  }
  return null;
}
