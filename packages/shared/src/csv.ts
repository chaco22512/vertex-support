/**
 * Minimal, dependency-free RFC 4180 CSV reader/writer (spec v1.7 §7.4).
 * Handles quoted fields, escaped quotes (`""`), and commas / CR / LF inside
 * quotes. Used for the knowledge CSV export/import.
 */

/** UTF-8 byte-order mark — prefix exported CSV so Excel reads CJK/Vietnamese/Devanagari correctly. */
export const CSV_BOM = '﻿';

/** True when a cell needs quoting (contains a quote, comma, CR/LF, or edge spaces). */
function needsQuote(cell: string): boolean {
  return /[",\r\n]/.test(cell) || cell !== cell.trim();
}

function quoteCell(cell: string): string {
  return needsQuote(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** Serialize rows (array of string cells) to CSV text with CRLF line endings. */
export function stringifyCsv(rows: string[][]): string {
  return rows.map((row) => row.map(quoteCell).join(',')).join('\r\n');
}

/**
 * Parse CSV text into rows of string cells. Tolerates a leading BOM, CRLF or LF
 * line endings, and quoted fields spanning commas/newlines. A trailing newline
 * does not produce an extra empty row.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  const pushCell = (): void => {
    row.push(cell);
    cell = '';
  };
  const pushRow = (): void => {
    pushCell();
    rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushCell();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      // CRLF or lone CR terminates the row.
      pushRow();
      i += src[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  // Flush the final cell/row unless the input ended exactly on a newline.
  if (cell !== '' || row.length > 0) pushRow();
  return rows;
}
