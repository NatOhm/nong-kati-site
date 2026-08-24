/**
 * Pricing Utilities — Server-authoritative price calculation.
 * 01-prd.md FR-050: All amounts computed server-side; client display is advisory only.
 * 01-prd.md FR-052: VAT = round(subtotal × 0.07, 2); Total = subtotal + VAT
 *
 * All monetary values are NUMERIC(10,2) — 2 decimal places, Thai Baht.
 */

const VAT_RATE = 0.07;

/**
 * Calculate VAT amount from a VAT-inclusive price.
 * @param inclusivePrice - The price including VAT (e.g. 107.00)
 * @returns VAT amount rounded to 2 decimal places
 */
export function calculateVatFromInclusive(inclusivePrice: number): number {
  const exVat = inclusivePrice / (1 + VAT_RATE);
  return Math.round((inclusivePrice - exVat) * 100) / 100;
}

/**
 * Calculate ex-VAT price from a VAT-inclusive price.
 * @param inclusivePrice - The price including VAT
 * @returns Price excluding VAT
 */
export function calculateExVat(inclusivePrice: number): number {
  const exVat = inclusivePrice / (1 + VAT_RATE);
  return Math.round(exVat * 100) / 100;
}

/**
 * Calculate VAT from a subtotal (ex-VAT).
 * FR-052: VAT = round(subtotal × 0.07, 2)
 * @param subtotal - Ex-VAT subtotal
 * @returns VAT amount
 */
export function calculateVat(subtotal: number): number {
  return Math.round(subtotal * VAT_RATE * 100) / 100;
}

/**
 * Calculate total from subtotal + VAT.
 * FR-052: Total = subtotal + VAT
 */
export function calculateTotal(subtotal: number, vat: number): number {
  return Math.round((subtotal + vat) * 100) / 100;
}

/**
 * Build a full order summary from cart items.
 * Server-side only — never trust client-supplied prices.
 */
export interface OrderSummaryInput {
  unitPriceThb: number;
  quantity: number;
}

export interface OrderSummary {
  subtotalThb: number;
  vatAmountThb: number;
  totalAmountThb: number;
  itemCount: number;
}

export function calculateOrderSummary(items: OrderSummaryInput[]): OrderSummary {
  let subtotal = 0;
  let itemCount = 0;

  for (const item of items) {
    const lineTotal = Math.round(item.unitPriceThb * item.quantity * 100) / 100;
    subtotal = Math.round((subtotal + lineTotal) * 100) / 100;
    itemCount += item.quantity;
  }

  const vat = calculateVat(subtotal);
  const total = calculateTotal(subtotal, vat);

  return {
    subtotalThb: subtotal,
    vatAmountThb: vat,
    totalAmountThb: total,
    itemCount,
  };
}

/**
 * Format a number as Thai Baht currency string.
 * Uses Intl.NumberFormat for Thai locale.
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
 * Format a number as compact Thai Baht (no decimals for whole numbers).
 */
export function formatThbCompact(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isInteger(num)) {
    return `\u0e3f${num.toLocaleString('th-TH')}`;
  }
  return formatThb(num);
}

/**
 * Format a number with Thai locale separators.
 */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('th-TH').format(n);
}

/**
 * Validate a Thai tax ID (13 digits).
 */
export function isValidThaiTaxId(taxId: string): boolean {
  return /^\d{13}$/.test(taxId);
}

/**
 * Validate email format.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Generate a human-readable order number.
 * Format: NK-YYYY-NNNNNN (e.g. NK-2026-000123)
 */
export function generateOrderNumber(sequence: number): string {
  const year = new Date().getFullYear();
  const padded = String(sequence).padStart(6, '0');
  return `NK-${year}-${padded}`;
}
