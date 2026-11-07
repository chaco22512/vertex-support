/**
 * Rule ID convention for CS-managed knowledge (spec v1.8 §3.1): a 2–4 letter
 * topic code + a 3–4 digit number, e.g. DR001, ESP001 or CN0001. Letters and
 * digits only, case-insensitive (stored upper-case), unique within a sheet.
 * The code also decides which chat tile(s) the AI uses the rule for
 * (data/menu_categories.json `id_prefixes` + the admin "Topic codes" screen,
 * table kb_topic_codes), so CS can word the Topic column however they like.
 * CS may start a new code at any time (2026-11-07); until it is linked to a
 * tile its rules are used only by "Something else" and the full-manual search.
 */

/** Built-in topic codes, with the plain-English topic each one stands for. */
export const RULE_ID_CODES: Record<string, string> = {
  IN: 'Internet / connection',
  APN: 'APN setup',
  PY: 'Payment & monthly bill',
  LS: 'Lost SIM or device',
  CN: 'Cancellation',
  RT: 'Returning SIM / device',
  RP: 'Replacement / change plan',
  RI: 'Re-issue',
  RF: 'Refund / cashback',
  DR: 'Deposit refund',
  PL: 'Plans & requirements',
  GN: 'General (used on every topic)',
  OT: 'Other',
};

/** The format, as shown to CS in every error message. */
export const RULE_ID_FORMAT_HELP =
  'A Rule ID is 2–4 capital letters (the topic code) followed by 3–4 numbers, e.g. DR001, ESP001 or CN0001.';

const NEW_ID = /^([A-Z]{2,4})(\d{3,4})$/;
const CODE = /^[A-Z]{2,4}$/;

/** Upper-case + trim, so "dr001 " and "DR001" are the same rule. */
export function normalizeRuleId(raw: string): string {
  return raw.trim().toUpperCase();
}

/** True for a valid topic code (2–4 capital letters). */
export function isTopicCode(code: string): boolean {
  return CODE.test(code);
}

/** The topic code of a convention ID ("ESP001" → "ESP"), or null for other IDs (legacy R508 …). */
export function ruleIdCode(id: string): string | null {
  return normalizeRuleId(id).match(NEW_ID)?.[1] ?? null;
}

/**
 * Check a NEW rule's ID against the convention. Returns null when valid, else
 * a plain-English message that says what to do next. Any code is accepted —
 * whether it is linked to a tile is a warning, not an error (see diffImport).
 */
export function ruleIdProblem(id: string): string | null {
  if (!id) {
    return `This row has no Rule ID. ${RULE_ID_FORMAT_HELP}`;
  }
  if (!/^[A-Z0-9]+$/.test(id)) {
    return `Rule ID "${id}" may only contain letters and numbers (no spaces or symbols). ${RULE_ID_FORMAT_HELP}`;
  }
  if (!NEW_ID.test(id)) {
    return `Rule ID "${id}" is not in the expected format. ${RULE_ID_FORMAT_HELP}`;
  }
  return null;
}
