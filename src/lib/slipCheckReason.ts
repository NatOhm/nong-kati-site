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
  RECEIVER_MISSING: 'ธนาคารไม่ได้ระบุบัญชีผู้รับ',
  RECEIVER_UNCONFIGURED: 'ร้านยังไม่ได้ตั้งบัญชีรับเงิน',
};

/** Thai label for a verdict, or `null` when the code is unknown (show it raw). */
export function slipCheckLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return SLIP_CHECK_LABELS[code] ?? null;
}
