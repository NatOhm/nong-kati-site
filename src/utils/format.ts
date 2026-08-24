/**
 * Format a number as Thai Baht currency string.
 * 07-api.md §3.4 — all monetary values are strings with 2 decimal places.
 * 05-components.md §4.4 — uses Intl.NumberFormat for Thai locale.
 *
 * @example formatThb(107) → "฿107.00"
 * @example formatThb(1234.5) → "฿1,234.50"
 */
export function formatThb(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format a number as a compact Thai Baht string (no decimals for whole numbers).
 * Used in product cards and denomination selectors.
 *
 * @example formatThbCompact(100) → "฿100"
 * @example formatThbCompact(107.5) → "฿107.50"
 */
export function formatThbCompact(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isInteger(num)) {
    return `฿${num.toLocaleString('th-TH')}`;
  }
  return formatThb(num);
}

/**
 * Format a number with Thai locale separators.
 * @example formatNumber(1234) → "1,234"
 */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('th-TH').format(n);
}
