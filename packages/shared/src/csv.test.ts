import { describe, expect, it } from 'vitest';
import { parseCsv, stringifyCsv } from './csv';

describe('stringifyCsv / parseCsv (RFC 4180)', () => {
  it('round-trips simple rows', () => {
    const rows = [
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ];
    expect(parseCsv(stringifyCsv(rows))).toEqual(rows);
  });

  it('quotes and round-trips commas, quotes, and newlines', () => {
    const rows = [['has, comma', 'has "quote"', 'line1\nline2', ' spaced ']];
    const csv = stringifyCsv(rows);
    expect(csv).toContain('"has, comma"');
    expect(csv).toContain('"has ""quote"""');
    expect(parseCsv(csv)).toEqual(rows);
  });

  it('parses CRLF and LF the same, and ignores a trailing newline', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseCsv('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('strips a leading BOM', () => {
    expect(parseCsv('﻿a,b')).toEqual([['a', 'b']]);
  });

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });
});
