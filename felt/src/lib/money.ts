// All money in Felt is integer pennies. These helpers are the only place
// pounds are converted to and from pennies.

const MAX_PENCE = 100_000_000; // £1,000,000

/** Parse what someone typed ("25", "£25.5", "1,000.00") into pennies. Returns null if invalid. */
export function parsePounds(input: string): number | null {
  const cleaned = input.trim().replace(/^£/, '').replace(/,/g, '').trim();
  if (cleaned === '') return null;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned) ?? /^()\.(\d{1,2})$/.exec(cleaned);
  if (!m) return null;
  const pounds = m[1] === '' ? 0 : Number(m[1]);
  const pence = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  const total = pounds * 100 + pence;
  if (!Number.isSafeInteger(total) || total > MAX_PENCE) return null;
  return total;
}

/** "£25", "£25.50", "-£3.20"; with sign: "+£25". Whole pounds drop the pence. */
export function formatPence(pence: number, opts: { sign?: boolean; always2dp?: boolean } = {}): string {
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 100);
  const rem = abs % 100;
  const whole = pounds.toLocaleString('en-GB');
  const body = rem === 0 && !opts.always2dp ? `£${whole}` : `£${whole}.${String(rem).padStart(2, '0')}`;
  if (pence < 0) return `-${body}`;
  if (opts.sign && pence > 0) return `+${body}`;
  return body;
}

/** Value for an <input>: 2500 -> "25", 2550 -> "25.50". */
export function penceToInput(pence: number): string {
  return pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2);
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
