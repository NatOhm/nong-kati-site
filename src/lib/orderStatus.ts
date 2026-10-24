/**
 * Order-status display labels — ONE copy for every MANAGEMENT surface.
 *
 * Each admin page carried its own drifting copy of this map (review
 * 2026-10-24): reconciliation said "ยืนยันการชำระ" and "รอส่งมอบมือ" while
 * orders/customers/dashboard said "ชำระแล้ว" and "รอส่งโค้ด" for the SAME
 * status, so one order read differently on every screen a staff member
 * opened. One status = one name, everywhere in /management.
 *
 * The union of every page's entries is kept — no surface loses a label it
 * rendered before (including legacy feed keys like `paid`/`delivering`).
 * Unknown/future statuses fall back to the raw enum via
 * `orderStatusLabel`, and each badge page keeps its own color/class map
 * keyed by status (`withStatusColors`) — only the words centralize here.
 *
 * Out of scope on purpose: the customer-facing /account/orders page
 * (different audience and tone) and the audit page's action labels
 * (a different domain — audit actions, not order statuses).
 */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_payment: 'รอชำระเงิน',
  payment_confirmed: 'ชำระแล้ว',
  pending_manual_fulfilment: 'รอส่งโค้ด',
  code_delivered: 'ส่งโค้ดสำเร็จ',
  completed: 'สำเร็จ',
  refunded: 'คืนเงิน',
  failed: 'ล้มเหลว',
  expired: 'หมดอายุ',
  abandoned: 'ถูกทิ้ง',
  cancelled: 'ยกเลิก',
  payment_failed: 'ชำระล้มเหลว',
  // Legacy activity-feed keys that some pages' maps covered:
  paid: 'ชำระแล้ว',
  delivering: 'กำลังส่ง',
};

/** Canonical Thai label for a status; unknown values render the raw enum. */
export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

/**
 * Join a page's per-status color/class map to the canonical labels: the
 * page keeps owning presentation, `src/lib/orderStatus.ts` owns the words.
 * A status missing from `colors` is missing from the result too, so pages
 * that iterate their map (e.g. the orders filter chips) see the exact key
 * set they declared.
 */
export function withStatusColors<T>(colors: Record<string, T>): Record<string, { label: string; color: T }> {
  return Object.fromEntries(
    Object.entries(colors).map(([status, color]) => [status, { label: orderStatusLabel(status), color }]),
  );
}
