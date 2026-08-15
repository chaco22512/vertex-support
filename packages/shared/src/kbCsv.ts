/**
 * Human-readable CSV mapping for kb_rules (spec v1.7 §7.4). One source of truth
 * for the export column order/labels and the import parsing + validation, so the
 * admin UI and the API agree. Non-engineer headers; only a subset is editable.
 */
import type { Audience, KbRule, RuleStatus } from './types';
import { CSV_BOM, parseCsv, stringifyCsv } from './csv';
import { hasSpreadsheetFormula, hasUnfilledPlaceholder } from './validation';

export const KB_CSV_HEADERS = [
  'Rule ID',
  'Topic',
  'Sub-topic',
  'Answer text',
  'Fee amounts (JPY)',
  'Fixed fee?',
  'Links',
  'Who can see',
  'Bot may use?',
  'Status',
  'Why it is waiting',
  'Last updated',
  'Updated by',
  'CS decision',
  'CS comment',
] as const;

/** Columns a CS reviewer may change; everything else is read-only on import. */
export const EDITABLE_HEADERS = [
  'Answer text',
  'Fee amounts (JPY)',
  'Fixed fee?',
  'Links',
  'Who can see',
  'Bot may use?',
  'Status',
] as const;

export type CsDecision = 'approve' | 'keep_internal' | 'disable' | '';

// --- value <-> label maps ---
const AUDIENCE_TO_LABEL: Record<Audience, string> = { customer: 'Customer', internal: 'Internal' };
const STATUS_TO_LABEL: Record<RuleStatus, string> = {
  active: 'Active',
  pending_review: 'Waiting for review',
  disabled: 'Disabled',
};
const LABEL_TO_AUDIENCE: Record<string, Audience> = { customer: 'customer', internal: 'internal' };
const LABEL_TO_STATUS: Record<string, RuleStatus> = {
  active: 'active',
  'waiting for review': 'pending_review',
  'pending review': 'pending_review',
  disabled: 'disabled',
};

const yesNo = (b: boolean): string => (b ? 'Yes' : 'No');
const feesToLabel = (fees: number[]): string => fees.join(', ');
const linksToLabel = (links: string[]): string => links.join('\n');

// --- export ---

/** One CSV data row for a rule (blank CS decision / CS comment columns). */
export function ruleToCsvRow(r: KbRule, updatedByName = ''): string[] {
  return [
    r.id,
    r.category,
    r.subcategory,
    r.rule_text,
    feesToLabel(r.fee_amounts_jpy),
    yesNo(r.fee_is_fixed),
    linksToLabel(r.links),
    AUDIENCE_TO_LABEL[r.audience],
    yesNo(r.ai_can_answer),
    STATUS_TO_LABEL[r.status],
    r.review_reason,
    (r.updated_at ?? '').slice(0, 10),
    updatedByName,
    '',
    '',
  ];
}

/** A guidance row placed right under the header so CS sees how to fill it in. */
export function kbCsvExampleRow(): string[] {
  return [
    'EXAMPLE',
    '(read-only)',
    '(read-only)',
    'Edit the answer text here',
    '4000, 4500',
    'Yes',
    'https://example.com',
    'Customer',
    'Yes',
    'Active',
    '(read-only)',
    '(read-only)',
    '(read-only)',
    'Approve / Keep internal / Disable / (leave blank = no change)',
    'Optional note for the team',
  ];
}

/** Full export CSV: BOM + header + example row + one row per rule. */
export function buildKbCsv(rules: KbRule[], updatedByNames: Map<string, string> = new Map()): string {
  const rows = [
    [...KB_CSV_HEADERS],
    kbCsvExampleRow(),
    ...rules.map((r) => ruleToCsvRow(r, updatedByNames.get(r.updated_by ?? '') ?? '')),
  ];
  return CSV_BOM + stringifyCsv(rows);
}

// --- import ---

export interface EditableValues {
  rule_text?: string;
  fee_amounts_jpy?: number[];
  fee_is_fixed?: boolean;
  links?: string[];
  audience?: Audience;
  ai_can_answer?: boolean;
  status?: RuleStatus;
}

export interface ParsedImportRow {
  line: number; // 1-based line in the file
  id: string;
  values: EditableValues;
  decision: CsDecision;
  errors: string[]; // format/validation errors; a non-empty list means skip the row
  skip: boolean; // EXAMPLE / blank id → intentionally ignored (not an error)
}

function parseYesNo(raw: string, label: string, errors: string[]): boolean | undefined {
  const v = raw.trim().toLowerCase();
  if (v === '') return undefined;
  if (v === 'yes' || v === 'y' || v === 'true') return true;
  if (v === 'no' || v === 'n' || v === 'false') return false;
  errors.push(`${label} must be Yes or No (got "${raw.trim()}")`);
  return undefined;
}

function parseFees(raw: string, errors: string[]): number[] | undefined {
  const t = raw.trim();
  if (t === '') return [];
  const out: number[] = [];
  for (const part of t.split(/[,;]/)) {
    const s = part.trim().replace(/[¥,]/g, '');
    if (s === '') continue;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) {
      errors.push(`Fee amounts (JPY) must be numbers (got "${part.trim()}")`);
      return undefined;
    }
    out.push(Math.round(n));
  }
  return out;
}

function parseDecision(raw: string, errors: string[]): CsDecision {
  const v = raw.trim().toLowerCase();
  if (v === '') return '';
  if (v === 'approve' || v === 'approved') return 'approve';
  if (v === 'keep internal' || v === 'internal') return 'keep_internal';
  if (v === 'disable' || v === 'disabled') return 'disable';
  if (v === 'no change' || v === 'none') return '';
  errors.push(`CS decision must be Approve, Keep internal, Disable, or blank (got "${raw.trim()}")`);
  return '';
}

/** Parse + format-validate an uploaded CSV. Returns a header error if unusable. */
export function parseImportCsv(text: string): { headerError?: string; rows: ParsedImportRow[] } {
  const grid = parseCsv(text);
  if (grid.length === 0) return { headerError: 'The file is empty.', rows: [] };
  const header = grid[0]!.map((h) => h.trim().toLowerCase());
  const col = (name: string): number => header.indexOf(name.toLowerCase());
  const idCol = col('Rule ID');
  if (idCol < 0) return { headerError: 'Missing the "Rule ID" column.', rows: [] };

  const c = {
    id: idCol,
    text: col('Answer text'),
    fees: col('Fee amounts (JPY)'),
    fixed: col('Fixed fee?'),
    links: col('Links'),
    who: col('Who can see'),
    bot: col('Bot may use?'),
    status: col('Status'),
    decision: col('CS decision'),
  };

  const rows: ParsedImportRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r]!;
    const at = (i: number): string => (i >= 0 && i < cells.length ? (cells[i] ?? '') : '');
    const id = at(c.id).trim();
    const line = r + 1;
    if (!id || id.toUpperCase() === 'EXAMPLE') {
      rows.push({ line, id, values: {}, decision: '', errors: [], skip: true });
      continue;
    }
    const errors: string[] = [];
    const values: EditableValues = {};

    if (c.text >= 0) {
      const t = at(c.text);
      if (t.trim() === '') errors.push('Answer text cannot be empty.');
      else if (hasUnfilledPlaceholder(t)) errors.push('Answer text still contains an unfilled placeholder.');
      else if (hasSpreadsheetFormula(t)) errors.push('Answer text still contains a spreadsheet formula.');
      else values.rule_text = t;
    }
    if (c.fees >= 0) {
      const fees = parseFees(at(c.fees), errors);
      if (fees) values.fee_amounts_jpy = fees;
    }
    if (c.fixed >= 0) {
      const b = parseYesNo(at(c.fixed), 'Fixed fee?', errors);
      if (b !== undefined) values.fee_is_fixed = b;
    }
    if (c.links >= 0) {
      values.links = at(c.links)
        .split(/[\n;]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (c.who >= 0) {
      const v = at(c.who).trim().toLowerCase();
      if (v !== '') {
        const a = LABEL_TO_AUDIENCE[v];
        if (a) values.audience = a;
        else errors.push(`Who can see must be Customer or Internal (got "${at(c.who).trim()}")`);
      }
    }
    if (c.bot >= 0) {
      const b = parseYesNo(at(c.bot), 'Bot may use?', errors);
      if (b !== undefined) values.ai_can_answer = b;
    }
    if (c.status >= 0) {
      const v = at(c.status).trim().toLowerCase();
      if (v !== '') {
        const s = LABEL_TO_STATUS[v];
        if (s) values.status = s;
        else errors.push(`Status must be Active, Waiting for review, or Disabled (got "${at(c.status).trim()}")`);
      }
    }
    const decision = parseDecision(c.decision >= 0 ? at(c.decision) : '', errors);

    rows.push({ line, id, values, decision, errors, skip: false });
  }
  return { rows };
}

export interface FieldChange {
  field: string; // human label
  from: string;
  to: string;
}

/** Human before/after strings for a single editable field. */
function fmt(field: keyof EditableValues, v: EditableValues[keyof EditableValues]): string {
  switch (field) {
    case 'fee_amounts_jpy':
      return feesToLabel((v as number[]) ?? []);
    case 'fee_is_fixed':
    case 'ai_can_answer':
      return yesNo(Boolean(v));
    case 'links':
      return ((v as string[]) ?? []).join(' | ');
    case 'audience':
      return AUDIENCE_TO_LABEL[v as Audience];
    case 'status':
      return STATUS_TO_LABEL[v as RuleStatus];
    default:
      return String(v ?? '');
  }
}

const FIELD_LABEL: Record<keyof EditableValues, string> = {
  rule_text: 'Answer text',
  fee_amounts_jpy: 'Fee amounts (JPY)',
  fee_is_fixed: 'Fixed fee?',
  links: 'Links',
  audience: 'Who can see',
  ai_can_answer: 'Bot may use?',
  status: 'Status',
};

/**
 * Effective changes for a rule given a parsed row. Applies the CS-decision
 * precedence (Approve/Keep internal/Disable override status/audience) on top of
 * the edited columns, then diffs against the current rule. Returns the field
 * changes (human strings) and the patch to persist.
 */
export function computeRuleChanges(
  current: Pick<
    KbRule,
    'rule_text' | 'fee_amounts_jpy' | 'fee_is_fixed' | 'links' | 'audience' | 'ai_can_answer' | 'status'
  >,
  row: ParsedImportRow,
): { changes: FieldChange[]; patch: EditableValues } {
  const next: EditableValues = { ...row.values };

  // CS decision drives status/audience (takes precedence over the Status column).
  if (row.decision === 'approve') {
    if (current.status === 'pending_review') next.status = 'active';
  } else if (row.decision === 'keep_internal') {
    next.audience = 'internal';
    next.status = 'active';
  } else if (row.decision === 'disable') {
    next.status = 'disabled';
  }

  const fields: (keyof EditableValues)[] = [
    'rule_text',
    'fee_amounts_jpy',
    'fee_is_fixed',
    'links',
    'audience',
    'ai_can_answer',
    'status',
  ];
  const changes: FieldChange[] = [];
  const patch: EditableValues = {};
  for (const f of fields) {
    if (next[f] === undefined) continue;
    const before = fmt(f, current[f] as EditableValues[typeof f]);
    const after = fmt(f, next[f]);
    if (before !== after) {
      changes.push({ field: FIELD_LABEL[f], from: before, to: after });
      // @ts-expect-error homogeneous assignment across the union
      patch[f] = next[f];
    }
  }
  return { changes, patch };
}
