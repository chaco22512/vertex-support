/**
 * Rule-text quarantine detectors (build_spec_v1_6.md §3). Shared by the import
 * scripts and the API (CSV import) so there is one implementation.
 */

/** Authoring placeholder that must never go live (`[insert …]`, `[TBD]`, `[TODO]`, `xxx`). */
const PLACEHOLDER_RE = /\[\s*insert|\[\s*tbd|\[\s*todo|\bx{3,}\b/i;

export function hasUnfilledPlaceholder(text: string): boolean {
  return PLACEHOLDER_RE.test(text);
}

/** Unprocessed Google-Sheets formula (starts with `=`, or contains the export marker). */
const FORMULA_RE = /^\s*=|DUMMYFUNCTION/;

export function hasSpreadsheetFormula(text: string): boolean {
  return FORMULA_RE.test(text);
}

export const PLACEHOLDER_REASON = 'contains an unfilled placeholder — fill in before approving';
export const FORMULA_REASON = 'contains an unprocessed spreadsheet formula — clean before approving';
