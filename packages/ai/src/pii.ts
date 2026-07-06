/**
 * PII masking (build_spec_v1_4.md §2). Applied to customer text BEFORE it is sent
 * to the LLM. Masks email addresses, phone numbers, and any digit run of 10+
 * digits (ICCID etc.). Storing the pre-mask original in the DB is allowed (done
 * by the API layer, not here). Fees like ¥4,000 (< 10 digits) are never masked.
 */

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

// A candidate numeric sequence: optional leading +, digits possibly grouped by
// spaces / dots / hyphens / parentheses. Whether it is masked depends on the
// digit count checked in the replacer (>= 10), so short numbers pass through.
const NUMERIC_SEQUENCE = /\+?\d[\d\s().-]{7,}\d/g;

function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

export interface MaskResult {
  masked: string;
}

export function maskPii(text: string): MaskResult {
  let masked = text.replace(EMAIL, '[EMAIL]');
  masked = masked.replace(NUMERIC_SEQUENCE, (match) => {
    if (digitCount(match) < 10) return match;
    // Separators or a leading + read as a phone number; a bare run reads as an id/number.
    return /[+\s().-]/.test(match) ? '[PHONE]' : '[NUMBER]';
  });
  return { masked };
}
