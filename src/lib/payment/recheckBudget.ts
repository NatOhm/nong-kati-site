/**
 * How many provider calls this attempt has already spent on re-checks.
 *
 * Its own module (audit 2026-11-24) because the slip-verify find-or-create
 * needs it and `slipRecheck.ts` cannot be imported outside a Next request:
 * that file pulls `@/lib/data` → React `cache` → `next/headers`, which a plain
 * Node context (and the real-database spec) cannot execute. `slipRecheck`
 * re-exports this, so nothing else had to change.
 *
 * The value matters beyond bookkeeping: `POST /api/v1/payments/slip-verify`
 * stamps a fresh `gatewayResponse` on every customer retry, and it must carry
 * this count forward — otherwise tapping ตรวจสลิปอีกครั้ง resets the budget and
 * the cap stops meaning anything (each tap is itself a paid call, up to 10 per
 * 10 minutes per IP).
 */
export function recheckCount(gatewayResponse: unknown): number {
  if (!gatewayResponse || typeof gatewayResponse !== 'object') return 0;
  const value = (gatewayResponse as { rechecks?: unknown }).rechecks;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
