/**
 * Read a provider's reported slip amount (audit 2026-11-24, red-team pass).
 *
 * Both adapters used `Number(d.amount)`, which coerces far more than a money
 * field should: `Number('0x19') === 25`, `Number('1e1') === 10`, and
 * `Number(' 9 ') === 9`. A response that says `"0x19"` therefore confirmed a
 * ฿25 order, and `"1e1"` a ฿10 one — a payment record we cannot explain and a
 * coercion nobody intended. The amount must be a plain decimal or the verdict
 * is `INVALID_SLIP` (fail closed, admin sees the raw payload).
 *
 * Deliberately NOT accepted: hex/octal/binary literals, exponent notation,
 * thousands separators, Arabic-Indic/Thai digits, signs (a transfer is
 * positive), `NaN`/`Infinity`, and empty strings. The tolerance compare
 * downstream is unchanged — this only decides what the number IS.
 */
export function parseSlipAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== 'string') return Number.NaN;
  const text = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return Number.NaN;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
