import { describe, expect, it } from 'vitest';
import type { KbRule } from './types';
import {
  buildKbCsv,
  computeRuleChanges,
  KB_CSV_HEADERS,
  parseImportCsv,
  ruleToCsvRow,
} from './kbCsv';
import { CSV_BOM, parseCsv } from './csv';

function rule(p: Partial<KbRule> & Pick<KbRule, 'id'>): KbRule {
  return {
    category: 'GENERAL RULES',
    subcategory: '',
    rule_text: 'Pay by SmartPit.',
    date_updated: null,
    fee_amounts_jpy: [],
    links: [],
    audience: 'customer',
    ai_can_answer: true,
    requires_fee_disclaimer: false,
    fee_is_fixed: false,
    status: 'active',
    review_reason: '',
    updated_by: null,
    updated_at: '2026-07-11T00:00:00Z',
    ...p,
  };
}

describe('export', () => {
  it('prefixes a BOM and lays out header + example + rows', () => {
    const csv = buildKbCsv([rule({ id: 'R1', fee_amounts_jpy: [4000], fee_is_fixed: true })]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const grid = parseCsv(csv);
    expect(grid[0]).toEqual([...KB_CSV_HEADERS]);
    expect(grid[1]![0]).toBe('EXAMPLE');
    // data row uses human labels
    const row = grid[2]!;
    expect(row[0]).toBe('R1');
    expect(row[4]).toBe('4000'); // Fee amounts
    expect(row[5]).toBe('Yes'); // Fixed fee?
    expect(row[9]).toBe('Active'); // Status
  });

  it('ruleToCsvRow maps audience / bot / status to labels', () => {
    const row = ruleToCsvRow(rule({ id: 'R2', audience: 'internal', ai_can_answer: false, status: 'pending_review' }));
    expect(row[7]).toBe('Internal');
    expect(row[8]).toBe('No');
    expect(row[9]).toBe('Waiting for review');
  });
});

describe('parseImportCsv', () => {
  const header = KB_CSV_HEADERS.join(',');

  it('rejects a file with no Rule ID column', () => {
    expect(parseImportCsv('a,b,c\n1,2,3').headerError).toMatch(/Rule ID/);
  });

  it('skips the EXAMPLE row and blank ids without error', () => {
    const csv = `${header}\nEXAMPLE,x,x,x,,No,,Customer,Yes,Active,,,,,\n,,,,,,,,,,,,,,`;
    const { rows } = parseImportCsv(csv);
    expect(rows.every((r) => r.skip)).toBe(true);
  });

  it('parses editable columns and a CS decision', () => {
    const csv = `${header}\nR1,Topic,Sub,New answer,"4000, 4500",Yes,https://x,Internal,No,Disabled,,,,Approve,note`;
    const { rows } = parseImportCsv(csv);
    const r = rows[0]!;
    expect(r.errors).toEqual([]);
    expect(r.values).toMatchObject({
      rule_text: 'New answer',
      fee_amounts_jpy: [4000, 4500],
      fee_is_fixed: true,
      links: ['https://x'],
      audience: 'internal',
      ai_can_answer: false,
      status: 'disabled',
    });
    expect(r.decision).toBe('approve');
  });

  it('reports per-row errors for bad Yes/No, status, and non-numeric fees', () => {
    const csv = `${header}\nR1,T,S,ok,abc,Maybe,,Customer,Yes,Nope,,,,,`;
    const r = parseImportCsv(csv).rows[0]!;
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('flags an unfilled placeholder / spreadsheet formula in Answer text', () => {
    const ph = parseImportCsv(`${header}\nR1,T,S,The cheapest is [insert price],,No,,Customer,Yes,Active,,,,,`).rows[0]!;
    expect(ph.errors.join(' ')).toMatch(/placeholder/i);
    const fx = parseImportCsv(`${header}\nR1,T,S,=IFERROR(x),,No,,Customer,Yes,Active,,,,,`).rows[0]!;
    expect(fx.errors.join(' ')).toMatch(/formula/i);
  });
});

describe('computeRuleChanges', () => {
  const current = rule({ id: 'R1', rule_text: 'Old', status: 'pending_review', fee_amounts_jpy: [4000] });

  it('diffs only changed editable fields (human strings)', () => {
    const { rows } = parseImportCsv(
      `${KB_CSV_HEADERS.join(',')}\nR1,T,S,New text,4500,Yes,,Customer,Yes,Waiting for review,,,,,`,
    );
    const { changes, patch } = computeRuleChanges(current, rows[0]!);
    const fields = changes.map((c) => c.field);
    expect(fields).toContain('Answer text');
    expect(fields).toContain('Fee amounts (JPY)');
    expect(fields).toContain('Fixed fee?');
    expect(fields).not.toContain('Status'); // unchanged (still Waiting for review)
    expect(patch.rule_text).toBe('New text');
  });

  it('CS decision Approve flips pending_review → active', () => {
    const { rows } = parseImportCsv(
      `${KB_CSV_HEADERS.join(',')}\nR1,T,S,Old,4000,No,,Customer,Yes,Waiting for review,,,,Approve,`,
    );
    const { changes, patch } = computeRuleChanges(current, rows[0]!);
    expect(patch.status).toBe('active');
    expect(changes.find((c) => c.field === 'Status')).toMatchObject({ from: 'Waiting for review', to: 'Active' });
  });

  it('CS decision Keep internal sets internal + active', () => {
    const { rows } = parseImportCsv(
      `${KB_CSV_HEADERS.join(',')}\nR1,T,S,Old,4000,No,,Customer,Yes,Waiting for review,,,,Keep internal,`,
    );
    const { patch } = computeRuleChanges(current, rows[0]!);
    expect(patch.audience).toBe('internal');
    expect(patch.status).toBe('active');
  });
});
