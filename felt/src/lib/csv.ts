// CSV export. Text cells that a spreadsheet might run as a formula are
// prefixed with an apostrophe.

/** A pre-formatted number (e.g. "-5.00") that must not be escaped. */
export interface Raw {
  raw: string;
}

export type Cell = string | number | Raw | null | undefined;

function cell(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') return value.raw;
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function penceToDecimal(pence: number): Raw {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  return { raw: `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}` };
}
