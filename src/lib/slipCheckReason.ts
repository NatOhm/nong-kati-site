/**
 * Admin-facing labels for slip auto-check verdicts.
 *
 * `PaymentAttempt.failureReason` carries the route's machine code, and
 * จัดการคำสั่งซื้อ used to print it raw — an admin got to read
 * `RECEIVER_UNCONFIGURED` in a mono chip and guess. The code stays the source
 * of truth (logs, tooltip, support); this map is only the sentence a human
 * reads in the row. No entry is a fallback-proof obligation: the label gate in
 * `tests/slip-provider-code-coverage.test.ts` (SC5) fails when a code the route
 * can stamp has no label here, so a new verdict cannot ship as noise.
 *
 * Keep each label short: it sits in a 200 px table cell. Detail (provider,
 * timestamp, raw code) belongs in the tooltip.
 */
export const SLIP_CHECK_LABELS: Record<string, string> = {
  NOT_CONFIGURED: 'ยังไม่ได้เปิดระบบตรวจสลิป',
  UPSTREAM_ERROR: 'ระบบตรวจสลิปขัดข้อง',
  QUOTA_EXCEEDED: 'โควตาตรวจสลิปหมดแล้ว',
  RATE_LIMITED: 'ระบบตรวจสลิปไม่ตอบสนอง',
  SLIP_DELAYED: 'ธนาคารยังไม่พบสลิปนี้',
  SLIP_DUPLICATE: 'สลิปนี้ถูกใช้ยืนยันแล้ว',
  INVALID_SLIP: 'อ่านสลิปไม่ผ่าน',
  AMOUNT_MISMATCH: 'ยอดในสลิปไม่ตรง',
  RECEIVER_MISMATCH: 'บัญชีผู้รับไม่ใช่บัญชีร้าน',
  RECEIVER_UNCONFIGURED: 'ร้านยังไม่ได้ตั้งบัญชีรับเงิน',
};

/**
 * The diagnostic the route stored beside the verdict (`gatewayResponse.detail`
 * — e.g. `receiver …1786 vs store …5786`), for the admin tooltip. It carries
 * last-4 digits only by construction (see receiverPolicy), so nothing fuller
 * than a masked window reaches the screen. A JSON column can hold any shape:
 * anything that is not a short string is dropped rather than printed.
 */
export function slipCheckDetail(gatewayResponse: unknown): string | null {
  if (!gatewayResponse || typeof gatewayResponse !== 'object') return null;
  const detail = (gatewayResponse as { detail?: unknown }).detail;
  if (typeof detail !== 'string') return null;
  const trimmed = detail.trim();
  if (trimmed === '') return null;
  return trimmed.length > 160 ? `${trimmed.slice(0, 159)}…` : trimmed;
}

/**
 * The `paymentAttempts` columns `slipCheckView` reads (the latest promptpay
 * attempt a route selected). `updatedAt` is the time of the last check.
 */
export interface SlipCheckAttempt {
  slipVerifiedRef: string | null;
  slipVerifiedAt: Date | null;
  slipVerifiedBy: string | null;
  failureReason: string | null;
  gatewayStatusCode: string | null;
  /** JSON column holding the route's diagnostic (`{ detail }`), any shape. */
  gatewayResponse: unknown;
  updatedAt: Date | null;
}

/** One order's `slipCheck` — a pass, the last failure, or null when never checked. */
export interface SlipCheckView {
  provider: string | null;
  error: string | null;
  /** Last-4 receiver diagnostic, e.g. `receiver …1786 vs store …5786`. */
  detail: string | null;
  checkedAt: string | null;
}

/**
 * THE owner of the admin `slipCheck` shape. Four endpoints used to build it by
 * hand (list, search, customer history, order detail), so adding the receiver
 * `detail` meant four edits and a select that could be missed in one of them —
 * the order detail was exactly that: it never read `gatewayResponse` at all.
 * `tests/admin-orders-slip-check.test.ts` calls every endpoint and fails if
 * the field (or the select feeding it) disappears from any of them.
 */
export function slipCheckView(
  attempt: SlipCheckAttempt | null | undefined,
): SlipCheckView | null {
  if (!attempt) return null;
  if (attempt.slipVerifiedRef) {
    return {
      provider: attempt.slipVerifiedBy ?? null,
      error: null,
      detail: null,
      checkedAt: attempt.slipVerifiedAt?.toISOString() ?? null,
    };
  }
  if (!attempt.failureReason) return null;
  return {
    provider: attempt.gatewayStatusCode ?? null,
    error: attempt.failureReason,
    detail: slipCheckDetail(attempt.gatewayResponse),
    checkedAt: attempt.updatedAt?.toISOString() ?? null,
  };
}

/**
 * The receiver account a bank reported for a slip, as the admin UI shows it.
 *
 * A manually uploaded slip has NO verdict at all, so before 2026-11-22 an
 * admin confirming it saw nothing about where the money went. The read action
 * (POST /admin/orders/:id/slip-receiver) stores the bank's masked answer here;
 * `last4` is what sits next to ยืนยันการชำระเงิน, never the full number.
 */
export interface SlipReceiverView {
  /** As the bank printed it, e.g. `199-1-xxx786`. */
  masked: string;
  last4: string;
}

export function slipReceiverView(masked: string | null | undefined): SlipReceiverView | null {
  const value = (masked ?? '').trim();
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  // Fewer than 4 visible digits still names a bank-side mask — show the
  // masked form, just without a last-4 line.
  return { masked: value, last4: digits.length >= 4 ? digits.slice(-4) : '' };
}

/**
 * Must the confirm button wait for a receiver read?
 *
 * A slip is on file, nobody has recorded where the bank sent the money, and
 * the money has not been confirmed yet. `pending_payment` is the whole gate:
 * every producer reaches `pending_manual_fulfilment` only AFTER recording the
 * payment (claim + settled attempt), so a read there would spend a provider
 * credit on an order that no longer needs one — including the restock-and-
 * resume button. Any stored receiver (auto-check or an earlier read) answers
 * the question; the caller adds the failed-read escape hatch.
 *
 * `hasVerdict` is the provider's own pass on this slip (`slipVerification` in
 * the modal, `slip` in the row). There is nothing left to read then — the read
 * route refuses to overwrite a verdict, so offering it would spend a credit
 * and record nothing.
 */
export function slipNeedsReceiverRead(
  order: {
    status: string;
    slipImageUrl: string | null;
    slipReceiver: SlipReceiverView | null;
  },
  hasVerdict: boolean,
): boolean {
  return (
    order.status === 'pending_payment' &&
    Boolean(order.slipImageUrl) &&
    !order.slipReceiver &&
    !hasVerdict
  );
}

/** Thai label for a verdict, or `null` when the code is unknown (show it raw). */
export function slipCheckLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return SLIP_CHECK_LABELS[code] ?? null;
}
