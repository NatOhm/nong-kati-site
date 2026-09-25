import { NextRequest, NextResponse } from 'next/server';

import { claimOrderForConfirmation, getOrderById } from '@/api/orders';
import { prisma } from '@/lib/db';
import { getNotificationSettings, notifyPaymentConfirmed, notifyStockLow } from '@/lib/notify';
import { fulfilOrder } from '@/lib/fulfilment';
import { getClientIp, checkRateLimit } from '@/lib/rateLimit';
import { isSlipVerificationEnabled, verifySlip } from '@/lib/payment/slipok';
import { isValidSlipUploadToken } from '@/lib/slipSecurity';

export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // SlipOK accepts up to ~10MB; we cap tighter

/** GET — feature probe for the checkout page (panel renders only when on). */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ enabled: isSlipVerificationEnabled() });
}

/**
 * POST /api/v1/payments/slip-verify — automatic slip verification (SlipOK).
 * Body: multipart { orderId, token, slip: File } — the same capability token
 * the manual upload requires (HMAC over orderId+confirmationUuid, minted
 * into the checkout response). JSON { orderId, token, imageBase64 } also works.
 *
 * Review finding (Medium): an order ID + a matching-amount slip used to be
 * enough — anyone who learned an order ID could confirm and fulfil somebody
 * else's order. The capability check now runs BEFORE contacting SlipOK or
 * spending quota. Flow after authorization: strict checks (amount exact, ref
 * never used anywhere) → atomically claim + settle the attempt + fulfil in
 * the SAME transaction. Manual admin confirm remains as fallback.
 *
 * Rate limit: 10 verifications / 10 minutes per IP (each call costs SlipOK
 * quota, so abuse has a real cost).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSlipVerificationEnabled()) {
    return NextResponse.json({ error: 'SLIP_VERIFY_UNAVAILABLE' }, { status: 503 });
  }

  const ip = getClientIp(req);
  const rl = await checkRateLimit('_slip_verify_ip', ip, {
    route: '_slip_verify_ip',
    maxRequests: 10,
    windowMs: 10 * 60_000,
    keyBy: 'ip',
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  let orderId = '';
  let uploadToken = '';
  let imageBase64 = '';
  const contentType = req.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      orderId = String(form.get('orderId') ?? '');
      uploadToken = String(form.get('token') ?? '');
      const file = form.get('slip');
      if (file instanceof File) {
        if (file.size > MAX_IMAGE_BYTES) {
          return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
        }
        const buf = Buffer.from(await file.arrayBuffer());
        imageBase64 = buf.toString('base64');
      }
    } else {
      const body = (await req.json()) as {
        orderId?: unknown;
        token?: unknown;
        imageBase64?: unknown;
      };
      orderId = String(body.orderId ?? '');
      uploadToken = String(body.token ?? '');
      imageBase64 = String(body.imageBase64 ?? '').replace(/^data:[^,]+,/, '');
    }
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  if (!orderId || !imageBase64) {
    return NextResponse.json({ error: 'ORDER_AND_SLIP_REQUIRED' }, { status: 400 });
  }

  // Capability check (review Medium): possession of an order ID must not
  // authorize confirming it. Same HMAC token as the manual upload — checked
  // before any SlipOK call so attackers cannot ride our verification quota
  // either.
  if (!uploadToken || !isValidSlipUploadToken(orderId, uploadToken)) {
    return NextResponse.json({ error: 'INVALID_UPLOAD_TOKEN' }, { status: 403 });
  }

  const order = await getOrderById(orderId);
  if (!order) return NextResponse.json({ error: 'ORDER_NOT_FOUND' }, { status: 404 });
  if (order.status !== 'pending_payment') {
    // Already confirmed/fulfilled/cancelled — nothing to verify.
    return NextResponse.json({ error: 'ORDER_NOT_PAYABLE' }, { status: 409 });
  }
  const expected = Number(order.totalAmountThb);

  // ── Ask SlipOK ──────────────────────────────────────────
  const result = await verifySlip({ imageBase64, expectedAmountThb: expected });

  if (!result.ok) {
    // Mapped, honest errors — the customer can fix and retry. Every branch
    // leaves the order untouched (still payable, admin fallback intact).
    const statusByCode: Record<string, number> = {
      NOT_CONFIGURED: 503,
      UPSTREAM_ERROR: 502,
      QUOTA_EXCEEDED: 502,
      INVALID_SLIP: 422,
      AMOUNT_MISMATCH: 422,
      RECEIVER_MISMATCH: 422,
    };
    const msgByCode: Record<string, string> = {
      NOT_CONFIGURED: 'ระบบตรวจสลิปยังไม่พร้อมใช้งาน — ส่งสลิปให้แอดมินยืนยันได้ปกติ',
      UPSTREAM_ERROR: 'ระบบตรวจสลิปขัดข้องชั่วคราว — ลองอีกครั้ง หรือรอแอดมินยืนยัน',
      QUOTA_EXCEEDED: 'ระบบตรวจสลิปเกินโควตาวันนี้ — แอดมินจะยืนยันให้เอง',
      INVALID_SLIP: 'ตรวจสลิปไม่ผ่าน — สลิปไม่ถูกต้อง/อ่านไม่ได้/ถูกใช้ไปแล้ว',
      AMOUNT_MISMATCH: 'ยอดโอนในสลิปไม่ตรงกับยอดสั่งซื้อ',
      RECEIVER_MISMATCH: 'บัญชีผู้รับในสลิปไม่ตรงกับร้าน',
    };
    return NextResponse.json(
      {
        error: result.code,
        message: msgByCode[result.code] ?? 'ตรวจสลิปไม่สำเร็จ',
        detail: result.detail,
      },
      { status: statusByCode[result.code] ?? 502 },
    );
  }

  // ── Slip is bank-valid: confirm atomically ──────────────
  const attempt = await prisma.paymentAttempt.findFirst({
    where: { orderId: order.id, status: 'pending', paymentMethod: 'promptpay' },
    orderBy: { createdAt: 'desc' },
  });
  if (!attempt) {
    return NextResponse.json({ error: 'NO_PENDING_ATTEMPT' }, { status: 409 });
  }

  // Global one-slip-one-order guard: the unique index rejects a ref that any
  // other attempt already used. Race losers fall into the catch below.
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'succeeded',
            slipVerifiedRef: result.ref,
            slipVerifiedAt: new Date(),
            slipReceiverAccount: result.receiverAccount,
            slipVerifiedBy: 'slipok:auto',
            gatewayResponse: result.raw as object,
          },
        });
        const claimed = await claimOrderForConfirmation(order.id, tx);
        if (!claimed) throw new Error('ALREADY_CLAIMED');
        const fulfilment = await fulfilOrder(order.id, tx);
        if (fulfilment.error === 'INSUFFICIENT_STOCK') throw new Error('INSUFFICIENT_STOCK');
        if (fulfilment.error && fulfilment.error !== 'ALREADY_FULFILLED') {
          throw new Error(fulfilment.error);
        }
        return claimed;
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'SLIP_ALREADY_USED', message: 'สลิปนี้ถูกใช้ยืนยันออเดอร์อื่นไปแล้ว' },
        { status: 422 },
      );
    }
    if (msg === 'ALREADY_CLAIMED') {
      // Lost a race with the admin button or another verify — treat as success-ish.
      return NextResponse.json({ error: 'ORDER_NOT_PAYABLE' }, { status: 409 });
    }
    if (msg === 'INSUFFICIENT_STOCK') {
      // Same recovery as the webhook: commit manual-fulfilment state (the
      // transaction above rolled back claim+attempt, so redo it committed).
      await prisma
        .$transaction(async (tx) => {
          await tx.paymentAttempt.update({
            where: { id: attempt.id },
            data: {
              status: 'succeeded',
              slipVerifiedRef: result.ref,
              slipVerifiedAt: new Date(),
              slipReceiverAccount: result.receiverAccount,
              slipVerifiedBy: 'slipok:auto',
            },
          });
          const claimed = await tx.order.updateMany({
            where: { id: order.id, status: 'pending_payment' },
            data: {
              status: 'pending_manual_fulfilment',
              manualFulfilmentReason: 'INSUFFICIENT_STOCK',
            },
          });
          if (claimed.count !== 1) throw new Error('ALREADY_CLAIMED');
        })
        .catch(() => undefined);
      return NextResponse.json({
        status: 'pending_manual_fulfilment',
        message: 'ชำระเงินถูกตรวจแล้ว — สินค้าเซ็นต์ไม่พอ แอดมินจะจัดส่งโค้ดให้เร็วที่สุด',
      });
    }
    console.error('[slip-verify] fulfilment failure:', msg);
    return NextResponse.json(
      {
        error: 'FULFILMENT_FAILED',
        message: 'ตรวจสลิปผ่านแต่ส่งโค้ดไม่สำเร็จ — แอดมินจะดำเนินการให้',
      },
      { status: 500 },
    );
  }

  // ── Notifications (after commit, fire-and-forget) ───────
  const cfg = await getNotificationSettings();
  void notifyPaymentConfirmed({
    orderNumber: order.orderNumber,
    totalThb: Number(order.totalAmountThb),
  });
  const threshold = cfg.lowStockThreshold ?? 5;
  const variantIds = [...new Set(order.items.map((i) => i.variantId))];
  const low = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, stock: { lte: threshold } },
    include: { product: { select: { name: true } } },
  });
  for (const v of low) {
    void notifyStockLow({ productName: v.product.name, variantLabel: v.label, stock: v.stock });
  }

  return NextResponse.json({
    status: 'confirmed',
    ref: result.ref,
    amountThb: result.amountThb,
    confirmationUuid: order.confirmationUuid,
    message: 'ตรวจสลิปผ่าน — ส่งโค้ดให้ทางอีเมลแล้ว',
  });
}
