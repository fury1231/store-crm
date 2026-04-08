import { describe, it, expect } from 'vitest';
import { escapeCsvField, toCsv, CsvColumn } from '../csv';

describe('escapeCsvField', () => {
  it('returns empty string for null and undefined', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('returns plain strings unquoted when they contain no special chars', () => {
    expect(escapeCsvField('hello')).toBe('hello');
    expect(escapeCsvField('john@example.com')).toBe('john@example.com');
  });

  it('wraps strings containing commas in quotes', () => {
    expect(escapeCsvField('a, b, c')).toBe('"a, b, c"');
  });

  it('wraps and escapes strings containing double quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps strings containing CR or LF in quotes', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('coerces numbers and booleans to strings', () => {
    expect(escapeCsvField(42)).toBe('42');
    expect(escapeCsvField(0)).toBe('0');
    expect(escapeCsvField(true)).toBe('true');
  });

  it('guards against CSV formula injection for = + - @ and tabs', () => {
    // Leading =, +, -, @ are interpreted as formulas by Excel/Sheets;
    // we prepend a literal apostrophe so the cell displays as text.
    expect(escapeCsvField('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(escapeCsvField('+1234')).toBe("'+1234");
    expect(escapeCsvField('-100')).toBe("'-100");
    expect(escapeCsvField('@cmd')).toBe("'@cmd");
    expect(escapeCsvField('\t=SUM')).toBe("'\t=SUM");
  });

  it('does not treat a mid-string = as a formula', () => {
    expect(escapeCsvField('x=y')).toBe('x=y');
  });
});

describe('toCsv', () => {
  interface Row {
    name: string;
    age: number | null;
    bio: string;
  }

  const columns: CsvColumn<Row>[] = [
    { header: 'name', get: (r) => r.name },
    { header: 'age', get: (r) => r.age },
    { header: 'bio', get: (r) => r.bio },
  ];

  it('emits only a header row when given an empty array', () => {
    expect(toCsv([], columns)).toBe('name,age,bio');
  });

  it('joins header and data rows with CRLF', () => {
    const csv = toCsv(
      [
        { name: 'Alice', age: 30, bio: 'hi' },
        { name: 'Bob', age: null, bio: '' },
      ],
      columns,
    );
    expect(csv).toBe('name,age,bio\r\nAlice,30,hi\r\nBob,,');
  });

  it('escapes special characters inside data rows', () => {
    const csv = toCsv(
      [{ name: 'Smith, Jo', age: 42, bio: 'says "yo"' }],
      columns,
    );
    // Header is clean; data row has two quoted fields.
    expect(csv).toBe('name,age,bio\r\n"Smith, Jo",42,"says ""yo"""');
  });

  it('does not add a trailing newline after the last row', () => {
    const csv = toCsv([{ name: 'X', age: 1, bio: 'y' }], columns);
    expect(csv.endsWith('y')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(false);
  });
});
