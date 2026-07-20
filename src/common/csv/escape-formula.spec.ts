import { escapeCsvFormula } from './escape-formula';

describe('escapeCsvFormula', () => {
  it.each(['=', '+', '-', '@'])(
    'neutralises a cell starting with %s',
    (lead) => {
      expect(escapeCsvFormula(`${lead}SUM(A1)`)).toBe(`'${lead}SUM(A1)`);
    },
  );

  it.each([
    ['tab', '\t'],
    ['carriage return', '\r'],
  ])('neutralises a cell starting with a %s', (_name, lead) => {
    // Excel strips leading whitespace before parsing, so "\t=SUM(A1)" is still
    // a formula once opened.
    expect(escapeCsvFormula(`${lead}=SUM(A1)`)).toBe(`'${lead}=SUM(A1)`);
  });

  it('neutralises the DDE payload shape used to launch a process', () => {
    const payload = "=cmd|' /C calc'!A0";
    expect(escapeCsvFormula(payload)).toBe(`'${payload}`);
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeCsvFormula('Groceries')).toBe('Groceries');
    expect(escapeCsvFormula('Rent - June')).toBe('Rent - June');
    expect(escapeCsvFormula('')).toBe('');
  });

  it('leaves a negative amount written as text untouched only when it is a number', () => {
    // A bare negative number is the one leading-dash case worth keeping legible:
    // Excel reads it as a number, not a formula, and quoting every one of them
    // would make an exported ledger unreadable.
    expect(escapeCsvFormula('-42.50')).toBe('-42.50');
    expect(escapeCsvFormula('-1e5')).toBe('-1e5');
    // ...but anything else starting with a dash is escaped.
    expect(escapeCsvFormula('-42+cmd')).toBe("'-42+cmd");
  });

  it('passes through values that are not strings', () => {
    expect(escapeCsvFormula(42)).toBe(42);
    expect(escapeCsvFormula(null)).toBe(null);
    expect(escapeCsvFormula(undefined)).toBe(undefined);
  });
});
