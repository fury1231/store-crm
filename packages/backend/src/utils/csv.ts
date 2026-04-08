/**
 * Tiny, dependency-free RFC 4180 CSV encoder used by the customer
 * export endpoint. Intentionally minimal — we only need the features
 * the CRM actually uses:
 *
 *   - Header row
 *   - Quoting of fields containing commas, double quotes, or newlines
 *   - Escaping of embedded double quotes by doubling them
 *   - CRLF line terminators (RFC 4180 recommendation)
 *   - Guard against CSV formula injection (leading =, +, -, @)
 *     — dangerous in Excel/Sheets because they're interpreted as formulas
 *
 * If we ever need streaming, gzip, locale separators, or type coercion
 * beyond the trivial `toString()` the caller should reach for `fast-csv`
 * instead. Until then, this 40-line module keeps the backend dep-lean.
 */

/**
 * Column descriptor for `toCsv`. `get` pulls the raw value from a row;
 * formatting and coercion happen inside the encoder so callers can
 * return any JavaScript value and trust the output is safe.
 */
export interface CsvColumn<T> {
  header: string;
  get: (row: T) => unknown;
}

/**
 * Escape a single CSV field. Order matters:
 *   1. Null/undefined → empty string (not the literal "null")
 *   2. Coerce to string
 *   3. Formula-injection guard: if the string starts with =, +, -, @,
 *      prefix a single quote so Excel/Sheets treat it as text. This
 *      is the standard mitigation recommended by OWASP.
 *   4. Wrap in quotes + double any embedded quotes if the field
 *      contains a special character.
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = typeof value === 'string' ? value : String(value);

  // Formula-injection mitigation. Apply BEFORE the quoting check so the
  // leading apostrophe itself doesn't trip the "needs quoting" branch.
  if (str.length > 0 && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Encode an array of rows as an RFC 4180 CSV string with a header row.
 * Terminator is CRLF; no trailing newline after the last row (so the
 * output can be concatenated with more rows by the caller if needed).
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map((c) => escapeCsvField(c.header)).join(',');
  const bodyLines = rows.map((row) =>
    columns.map((c) => escapeCsvField(c.get(row))).join(','),
  );
  return [headerLine, ...bodyLines].join('\r\n');
}
