/**
 * POST /api/v1/admin/orders/[id]/slip-receiver — ask the bank which account
 * this slip was paid into. READ ONLY: it never confirms the order, never
 * delivers codes and never changes the order status.
 *
 * Why it exists (2026-11-22): a customer who uploads a slip without the
 * auto-check (verify off, provider outage, or a slip parked after a failure)
 * leaves NO receiver data anywhere — the admin was asked to press
 * ยืนยันการชำระเงิน with nothing but a picture. The failure payment became a
 * black box. This action reads the stored evidence through the same
 * `verifySlipImage` the live route uses (provider preference + receiver rule)
 * and records what the bank reported, so the modal can show the last four
 * digits next to the confirm button and refuse to confirm until it has been
 * read.
 *
 * Cost + safety: one provider credit per SLIP, not per click — an account
 * already on file is answered from the row. The store account is NOT required — a shop with no
 * configured account still needs to see where the money went; the answer is
 * then `RECEIVER_UNCONFIGURED` + the reported account instead of a match
 * verdict. Nothing here can auto-confirm: the settlement path is not imported,
 * the order row is only read, and an attempt that already carries a verdict
 * (pass or failure) is never written — that verdict is the record of the check
 * that actually ran.
 */
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { getManualTransferInfo } from '@/lib/data';
import { checkReceiverMatch, storeReceiverDigits } from '@/lib/payment/receiverPolicy';
import { primarySlipProvider, verifySlipImage } from '@/lib/payment/slipVerifyFlow';
import { slipReceiverView } from '@/lib/slipCheckReason';
import { readSlip, slipKeyFromImageUrl } from '@/lib/slipStore';

export const dynamic = 'force-dynamic';

const MESSAGE_BY_CODE: Record<string, string> = {
  RECEIVER_MISMATCH: 'บัญชีผู้รับในสลิปไม่ใช่บัญชีร้าน — อย่ายืนยันจนกว่าจะตรวจสอบ',
  RECEIVER_UNCONFIGURED:
    'ร้านยังไม่ได้ตั้งบัญชีรับเงิน จึงเทียบบัญชีให้ไม่ได้ — ตัวเลขที่เห็นคือบัญชีที่ธนาคารรายงาน',
  AMOUNT_MISMATCH: 'ยอดในสลิปไม่ตรงกับยอดสั่งซื้อ',
  SLIP_DELAYED: 'ธนาคารยังไม่พบสลิปนี้ — ลองอ่านอีกครั้งใน 2–3 นาที',
  SLIP_DUPLICATE: 'สลิปนี้ถูกใช้ยืนยันคำสั่งซื้ออื่นแล้ว',
  INVALID_SLIP: 'อ่านสลิปไม่ผ่าน — ตรวจรูปเองก่อนยืนยัน',
  UPSTREAM_ERROR: 'ระบบตรวจสลิปขัดข้องชั่วคราว — ลองอีกครั้ง',
  QUOTA_EXCEEDED: 'โควตาตรวจสลิปหมดแล้ว — ตรวจสลิปด้วยตาก่อนยืนยัน',
  RATE_LIMITED: 'ระบบตรวจสลิปไม่ตอบสนอง — ลองอีกครั้ง',
  NOT_CONFIGURED: 'ยังไม่ได้ตั้งผู้ให้บริการตรวจสลิป',
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = getAdminToken(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  // Same permission as the confirm button this protects: whoever may release
  // the money may look at where it went.
  const check = await checkPermission(token, 'orders:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, totalAmountThb: true, slipImageUrl: true },
  });
  if (!order) return NextResponse.json({ error: 'ORDER_NOT_FOUND' }, { status: 404 });

  const manualInfo = await getManualTransferInfo();
  const storeDigits = storeReceiverDigits(manualInfo.accountNumber);

  // The attempt the admin screens read (`updatedAt: 'desc'`, same ordering as
  // the four order payloads) — writing anywhere else means the read succeeds
  // and the row still shows nothing, so the admin pays for it again.
  const attempt = await prisma.paymentAttempt.findFirst({
    where: { orderId: order.id, paymentMethod: 'promptpay' },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      failureReason: true,
      slipVerifiedRef: true,
      slipReceiverAccount: true,
    },
  });

  // One credit per slip: an account already on file is returned, never re-read.
  // This is also what makes a double click free.
  if (attempt?.slipReceiverAccount) {
    return NextResponse.json({
      slipReceiver: slipReceiverView(attempt.slipReceiverAccount),
      matchesStore:
        storeDigits !== ''
          ? checkReceiverMatch(storeDigits, attempt.slipReceiverAccount).ok
          : null,
      verdict: null,
      message: 'อ่านบัญชีผู้รับไว้แล้ว — ตรวจเลข 4 ตัวท้ายก่อนยืนยัน',
    });
  }

  const key = slipKeyFromImageUrl(order.slipImageUrl);
  const bytes = key ? await readSlip(key).catch(() => null) : null;
  if (!bytes) {
    return NextResponse.json(
      {
        error: 'NO_STORED_SLIP',
        message: 'ไม่พบไฟล์สลิปของออเดอร์นี้ — ขอสลิปจากลูกค้าหรือตรวจด้วยตาก่อนยืนยัน',
      },
      { status: 409 },
    );
  }

  const result = await verifySlipImage({
    imageBase64: bytes.toString('base64'),
    expectedAmountThb: Number(order.totalAmountThb),
    storeAccountNumber: manualInfo.accountNumber,
    // A shop with no configured account still has to see where the money
    // went; the answer is a refusal that carries the reported account.
    requireStoreAccount: false,
  });

  const reported = result.receiverAccount;
  const slipReceiver = slipReceiverView(reported);

  // Record the bank's answer so the row and the next admin see it without
  // spending another credit — but only on an attempt with no verdict. A
  // verdict (slipVerifiedRef, or failureReason for a refusal) belongs to the
  // check that actually ran; this read informs the confirm decision, it does
  // not re-judge the slip. Nothing is recorded when the bank named no account,
  // so a provider outage does not mint an attempt row.
  if (reported) {
    try {
      if (!attempt) {
        await prisma.paymentAttempt.create({
          data: {
            orderId: order.id,
            paymentMethod: 'promptpay',
            gatewayName: primarySlipProvider(),
            amountThb: order.totalAmountThb,
            status: 'pending',
            slipReceiverAccount: reported,
          },
        });
      } else if (!attempt.failureReason && !attempt.slipVerifiedRef) {
        await prisma.paymentAttempt.update({
          where: { id: attempt.id },
          data: { slipReceiverAccount: reported },
        });
      }
    } catch (err) {
      // Display still works; the admin just has to read it again next time.
      console.error('[slip-receiver] could not record the reported receiver:', err);
    }
  }

  return NextResponse.json({
    /** The same shape the admin order payloads publish (`slipReceiverView`). */
    slipReceiver,
    /** null when there is nothing to compare (no account on either side). */
    matchesStore:
      slipReceiver && storeDigits !== ''
        ? checkReceiverMatch(storeDigits, reported).ok
        : null,
    /** null when the bank accepted the slip; otherwise the reason it cannot. */
    verdict: result.ok ? null : result.code,
    // A refusal wins over the receiver it carries: "the bank named an account"
    // must not read as reassurance when the answer is that it is NOT ours.
    message: !result.ok
      ? (MESSAGE_BY_CODE[result.code] ?? 'ตรวจสลิปกับธนาคารไม่ผ่าน')
      : slipReceiver
        ? 'ธนาคารรายงานบัญชีผู้รับแล้ว — ตรวจเลข 4 ตัวท้ายก่อนยืนยัน'
        : 'ธนาคารตรวจสลิปผ่านแต่ไม่รายงานบัญชีผู้รับ — ตรวจรูปเองก่อนยืนยัน',
  });
}
