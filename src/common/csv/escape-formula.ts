// Characters that make Excel, LibreOffice and Google Sheets treat a cell as a
// formula rather than text. Tab and carriage return are in the list because
// leading whitespace is stripped before parsing, so "\t=SUM(A1)" still runs.
const FORMULA_LEADS = new Set(['=', '+', '-', '@', '\t', '\r']);

// A bare negative number is the one leading-dash case worth leaving alone: a
// spreadsheet reads it as a number, and prefixing every negative amount would
// turn an exported ledger into unreadable text columns.
const NEGATIVE_NUMBER = /^-\d+(\.\d+)?([eE][+-]?\d+)?$/;

/**
 * Neutralises CSV formula injection by prefixing a single quote, which
 * spreadsheets read as "treat the rest as text".
 *
 * The export carries names, payees, tags and memos the user typed. Without
 * this, one user can store `=cmd|' /C calc'!A0` in a memo and it executes on
 * whoever opens the exported file — the attacker is not the person running the
 * risk.
 *
 * Note the round-trip cost: the escaped cell keeps its leading quote if the
 * file is imported back, so a memo that legitimately starts with `=` comes back
 * as `'=`. Stripping it on import is deliberately not done here; that belongs
 * to the import path and is its own decision.
 */
export function escapeCsvFormula<T>(value: T): T | string {
  if (typeof value !== 'string' || value.length === 0) return value;

  const lead = value[0];
  if (!FORMULA_LEADS.has(lead)) return value;
  if (lead === '-' && NEGATIVE_NUMBER.test(value)) return value;

  return `'${value}`;
}
