import { NextRequest, NextResponse } from 'next/server';

import { getOrderById } from '@/api/orders';
import { prisma } from '@/lib/db';
import { getManualTransferInfo } from '@/lib/data';
import {
  notifyPaymentConfirmed,
  notifyPaymentPending,
  notifyStockAlertsForVariants,
} from '@/lib/notify';
import { scheduleOutboxDrain } from '@/lib/fulfilment';
import { getDeliveredCodes } from '@/lib/delivery/customerCodes';
import { getClientIp, checkRateLimit } from '@/lib/rateLimit';
import { confirmVerifiedSlip } from '@/lib/payment/slipConfirmation';
import {
  isSlipAutoVerifyEnabled,
  primarySlipProvider,
  verifySlipImage,
} from '@/lib/payment/slipVerifyFlow';
import { isValidSlipUploadToken, mintSlipStorageKey, slipImageRoute } from '@/lib/slipSecurity';
import { scheduleSlipRecheck } from '@/lib/slipRecheck';
import { writeSlip } from '@/lib/slipStore';

export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // SlipOK accepts up to ~10MB; we cap tighter

/**
 * One sentence for "this slip has already confirmed a payment", whichever
 * layer noticed it: the provider's duplicate answer (Slip2Go 200501 / SlipOK
 * 1012 → SLIP_DUPLICATE) and the database's unique `slipVerifiedRef`
 * (SLIP_ALREADY_USED) are the same customer situation, so they must not read
 * as two different verdicts. Codes stay distinct for logs and support.
 */
const SLIP_ALREADY_USED_MESSAGE =
  'สลิปนี้ถูกใช้ยืนยันคำสั่งซื้อไปแล้ว — เปิดหน้าคำสั่งซื้อเพื่อดูโค้ดที่ได้รับ ถ้าไม่ใช่คำสั่งซื้อนี้ ติดต่อแอดมิน';

/**
 * GET — feature probe for the checkout page (panel renders only when on).
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ enabled: isSlipAutoVerifyEnabled() });
}

/**
 * POST /api/v1/payments/slip-verify — automatic slip verification.
 * Body: multipart { orderId, token, slip: File } — the same capability token
 * the manual upload requires (HMAC over orderId+confirmationUuid, minted
 * into the checkout response). JSON { orderId, token, imageBase64 } also works.
 *
 * Review finding (Medium): an order ID + a matching-amount slip used to be
 * enough — anyone who learned an order ID could confirm and fulfil somebody
 * else's order. The capability check now runs BEFORE contacting a provider or
 * spending quota.
 *
 * The two halves of the decision live in shared libs, because the background
 * re-check of a delayed slip runs the same rule and the same money
 * transaction: `verifySlipImage` (provider + receiver policy) and
 * `confirmVerifiedSlip` (settle + claim + deliver). This file owns the HTTP
 * shape only.
 *
 * Rate limit: 10 verifications / 10 minutes per IP (each call costs quota, so
 * abuse has a real cost).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSlipAutoVerifyEnabled()) {
    return NextResponse.json({ error: 'SLIP_VERIFY_UNAVAILABLE' }, { status: 503 });
  }

  const ip = getClientIp(req);
  // Real route key (not a '_' alias) so strict mode treats this quota-costly
  // call as high-risk and fails closed when the shared counter is down.
  const rl = await checkRateLimit('/api/v1/payments/slip-verify', ip, {
    route: '/api/v1/payments/slip-verify',
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
      // Same ceiling as the multipart path (file.size above): the JSON
      // branch had no size check at all, so a multi-hundred-MB base64 body
      // could be buffered into the evidence row and forwarded upstream.
      // Buffer.byteLength(.., 'base64') = the DECODED byte count.
      if (Buffer.byteLength(imageBase64, 'base64') > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
      }
    }
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  if (!orderId || !imageBase64) {
    return NextResponse.json({ error: 'ORDER_AND_SLIP_REQUIRED' }, { status: 400 });
  }

  // Capability check (review Medium): possession of an order ID must not
  // authorize confirming it. Same HMAC token as the manual upload — checked
  // before any provider call so attackers cannot ride our verification quota
  // either.
  if (!uploadToken || !isValidSlipUploadToken(orderId, uploadToken)) {
    return NextResponse.json({ error: 'INVALID_UPLOAD_TOKEN' }, { status: 403 });
  }

  const order = await getOrderById(orderId);
  if (!order) return NextResponse.json({ error: 'ORDER_NOT_FOUND' }, { status: 404 });
  if (order.status !== 'pending_payment' && order.status !== 'expired') {
    // Already confirmed/fulfilled/cancelled — nothing to verify. `expired` is
    // NOT in that set: a slip that arrives after the 30-minute sweep still
    // represents money sent, and the claim in claimOrderForConfirmation accepts
    // that status (a resold unit parks the order for manual fulfilment).
    return NextResponse.json({ error: 'ORDER_NOT_PAYABLE' }, { status: 409 });
  }
  const expected = Number(order.totalAmountThb);

  // Strict receiver: the store's own receiving account is resolved and applied
  // by verifySlipImage (src/lib/payment/slipVerifyFlow.ts) — one owner for the
  // "is this our account?" rule, shared with the background re-check.
  //
  // Fail CLOSED without it (2026-11-21): the bank-side condition is belt-only
  // (the 2026-10-30 live probe sent a wrong accountNumber and still got
  // 200200), so with no store account a slip paid to ANY account could confirm
  // an order and release codes. The lib refuses and parks the slip for manual
  // review without calling a provider — a credit spent on a verdict we must
  // not act on buys nothing.
  const manualInfo = await getManualTransferInfo();

  // ── Keep the evidence FIRST ──────────────────────────────────────────────
  // Whatever the provider answers (pass, amount mismatch, outage), the
  // customer's slip must land in หน้าจัดการคำสั่งซื้อ so the admin fallback
  // always sees what was submitted — including on paths where the client
  // never gets a chance to re-upload. Private `slip:` namespace, one NEW key
  // per attempt (nothing overwritten). Failures here never block a check.
  let slipStored = false;
  try {
    const key = mintSlipStorageKey();
    // A private file under NK_SLIP_DIR, not a `slip:` settings row — the
    // evidence is a financial document and up to ~6.7 MB of base64.
    await writeSlip(key, Buffer.from(imageBase64, 'base64'));
    await prisma.order.update({
      where: { id: order.id },
      data: { slipImageUrl: slipImageRoute(key), slipUploadedAt: new Date() },
    });
    slipStored = true;
  } catch (err) {
    console.error('[slip-verify] could not persist slip evidence:', err);
  }

  const gatewayName = primarySlipProvider();

  // ── An attempt row to record the verdict on ─────────────────────────────
  // Production checkout is manual-transfer: it shows the store's bank account
  // and never calls /payments/initiate, so the only call site that used to
  // create a PaymentAttempt never runs. The bank check still ran, and with no
  // attempt the confirmation had nowhere to land (409 NO_PENDING_ATTEMPT) —
  // every real slip ended in the manual queue and the order expired. Create
  // the pending attempt here instead of requiring the QR flow.
  let attempt: { id: string } | null = null;
  try {
    attempt = await prisma.paymentAttempt.findFirst({
      where: { orderId: order.id, status: 'pending', paymentMethod: 'promptpay' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!attempt) {
      attempt = await prisma.paymentAttempt.create({
        data: {
          orderId: order.id,
          paymentMethod: 'promptpay',
          gatewayName,
          amountThb: order.totalAmountThb,
          status: 'pending',
        },
        select: { id: true },
      });
    }
  } catch (err) {
    console.error('[slip-verify] could not create the payment attempt:', err);
  }

  // ── Ask the configured providers ────────────────────────────────────────
  const result = await verifySlipImage({
    imageBase64,
    expectedAmountThb: expected,
    storeAccountNumber: manualInfo.accountNumber,
  });

  if (!result.ok) {
    // A local refusal never touched a provider. Naming one in the attempt row
    // would make จัดการคำสั่งซื้อ's tooltip read "Slip2Go" for a call that never
    // happened, so `provider` is null for RECEIVER_UNCONFIGURED.
    const providerLabel = result.provider;
    // Provider diagnostics (client feedback 19 Oct: auto-verify failures
    // were undiagnosable). Ids and codes only — never the slip bytes.
    console.warn('[slip-verify] auto-verify failed', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      provider: providerLabel,
      error: result.code,
      detail: result.detail ?? null,
    });
    // Stamp the last auto-check on the pending attempt (best-effort — never
    // blocks the response). The admin list/detail reads this as slipCheck so
    // a failed check is distinguishable from "never checked". Status stays
    // pending: the order is still payable and manually confirmable.
    try {
      if (attempt) {
        await prisma.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            failureReason: result.code,
            gatewayStatusCode: providerLabel,
            // When a provider DID answer (a receiver mismatch or amount
            // check), keep the account it named: the admin sees it next to
            // the confirm button instead of only inside the tooltip prose.
            ...(result.receiverAccount ? { slipReceiverAccount: result.receiverAccount } : {}),
            gatewayResponse: {
              provider: providerLabel,
              error: result.code,
              detail: result.detail ?? null,
              checkedAt: new Date().toISOString(),
            },
          },
        });
      }
    } catch {
      // Diagnostics only — the customer response + admin ping below still run.
    }
    // A bank that has not published the transfer yet is the ONE verdict worth
    // asking again: BBL/GSB publish 2–3 minutes late, so a genuine slip
    // answers "not found" first. Schedule that re-check server-side now — the
    // customer may close the tab, and then nobody is left to tap the button.
    // The sweep (10-minute tick) covers anything this in-process timer loses
    // to a restart.
    if (result.code === 'SLIP_DELAYED' && attempt) scheduleSlipRecheck(attempt.id);
    // Mapped, honest errors — the customer can fix and retry. Every branch
    // leaves the order untouched (still payable, admin fallback intact).
    const statusByCode: Record<string, number> = {
      NOT_CONFIGURED: 503,
      UPSTREAM_ERROR: 502,
      QUOTA_EXCEEDED: 502,
      RATE_LIMITED: 502,
      SLIP_DELAYED: 502,
      SLIP_DUPLICATE: 422,
      INVALID_SLIP: 422,
      AMOUNT_MISMATCH: 422,
      RECEIVER_MISMATCH: 422,
      // Our misconfiguration, not the customer's slip, and no retry of the
      // same request can fix it — same 5xx class as NOT_CONFIGURED.
      RECEIVER_UNCONFIGURED: 503,
    };
    const msgByCode: Record<string, string> = {
      NOT_CONFIGURED: 'ระบบตรวจสลิปยังไม่พร้อมใช้งาน — ส่งสลิปให้แอดมินยืนยันได้ปกติ',
      UPSTREAM_ERROR: 'ระบบตรวจสลิปขัดข้องชั่วคราว — ลองอีกครั้ง หรือรอแอดมินยืนยัน',
      QUOTA_EXCEEDED: 'ระบบตรวจสลิปเกินโควตาวันนี้ — แอดมินจะยืนยันให้เอง',
      RATE_LIMITED: 'ระบบตรวจสลิปยุ่งชั่วคราว — รอสักครู่แล้วลองใหม่ หรือรอแอดมินยืนยันให้เอง',
      // "ถูกใช้ไปแล้ว" moved to SLIP_DUPLICATE: an invalid/unreadable slip is not
      // the same sentence as a payment that already succeeded.
      INVALID_SLIP: 'ตรวจสลิปไม่ผ่าน — สลิปไม่ถูกต้องหรืออ่านไม่ได้',
      AMOUNT_MISMATCH: 'ยอดโอนในสลิปไม่ตรงกับยอดสั่งซื้อ',
      RECEIVER_MISMATCH: 'บัญชีผู้รับในสลิปไม่ตรงกับร้าน',
      // Our fault, not the customer's: with no store account there is nothing
      // to compare the slip against, so verification is refused and the slip
      // goes to the admin instead of auto-confirming blind.
      // Only claim the admin HAS the image when the evidence write succeeded;
      // otherwise the client's /slip-upload fallback still has to run and this
      // sentence would be untrue.
      RECEIVER_UNCONFIGURED: slipStored
        ? 'ร้านยังไม่ได้ตั้งบัญชีรับเงินสำหรับตรวจสลิปอัตโนมัติ — ส่งสลิปให้แอดมินตรวจสอบให้แล้ว'
        : 'ร้านยังไม่ได้ตั้งบัญชีรับเงินสำหรับตรวจสลิปอัตโนมัติ — รอแอดมินตรวจสอบให้',
      // The customer keeps this sentence even though we now retry for them:
      // the re-check is not a promise, and the admin fallback still stands.
      SLIP_DELAYED:
        'ธนาคารยังไม่พบข้อมูลสลิปนี้ (บางธนาคารใช้เวลาส่งข้อมูล 2–3 นาที) — ระบบจะตรวจซ้ำให้อัตโนมัติ หรือรอแอดมินตรวจให้',
      SLIP_DUPLICATE: SLIP_ALREADY_USED_MESSAGE,
    };
    // The slip is stored and queued for manual review — ping the admin now
    // instead of hoping they refresh จัดการคำสั่งซื้อ (fire-and-forget).
    void notifyPaymentPending({
      orderNumber: order.orderNumber,
      totalThb: expected,
      customerEmail: order.customerEmail,
    });
    return NextResponse.json(
      {
        error: result.code,
        message: msgByCode[result.code] ?? 'ตรวจสลิปไม่สำเร็จ',
        detail: result.detail,
        // The image is already in the admin queue — the client can skip the
        // duplicate upload and just tell the customer to wait for review.
        slipStored,
      },
      { status: statusByCode[result.code] ?? 502 },
    );
  }

  // ── Slip is bank-valid: confirm atomically ──────────────
  // `attempt` was established (or created) before the provider call above.
  if (!attempt) {
    // Only reachable when creating the attempt threw (DB hiccup). The bank
    // already said the money moved, so this must read as "verified, queued
    // for a human", never as a machine code on the customer's screen — the
    // client's screenshot was literally `NO_PENDING_ATTEMPT` in red. The
    // slip is already stored, so the panel can skip the duplicate upload and
    // the admin gets the same ping as a provider failure.
    void notifyPaymentPending({
      orderNumber: order.orderNumber,
      totalThb: expected,
      customerEmail: order.customerEmail,
    });
    return NextResponse.json(
      {
        error: 'NO_PENDING_ATTEMPT',
        message:
          'ตรวจสลิปผ่านแล้ว (ธนาคารยืนยันการชำระเงิน) แต่ระบบบันทึกสถานะอัตโนมัติไม่สำเร็จ — ส่งเรื่องให้แอดมินยืนยันให้แล้ว',
        slipStored,
      },
      { status: 409 },
    );
  }

  const outcome = await confirmVerifiedSlip({
    orderId: order.id,
    orderNumber: order.orderNumber,
    attemptId: attempt.id,
    ref: result.ref,
    receiverAccount: result.receiverAccount,
    verifiedBy: result.verifiedBy,
    raw: result.raw,
  });

  if (outcome.kind === 'duplicate_slip') {
    return NextResponse.json(
      { error: 'SLIP_ALREADY_USED', message: SLIP_ALREADY_USED_MESSAGE },
      { status: 422 },
    );
  }
  if (outcome.kind === 'already_claimed' && outcome.stage !== 'delivery') {
    // Lost a race with the admin button or another verify — treat as success-ish.
    return NextResponse.json({ error: 'ORDER_NOT_PAYABLE' }, { status: 409 });
  }
  if (outcome.kind === 'already_claimed') {
    // Another writer recorded this payment first and is delivering it.
    return NextResponse.json({
      status: 'pending_manual_fulfilment',
      paymentVerified: true,
      ref: result.ref,
      message: 'ตรวจสลิปผ่านแล้ว — การชำระเงินได้รับการยืนยัน ระบบกำลังดำเนินการจัดส่งโค้ดให้',
    });
  }
  if (outcome.kind === 'parked' && outcome.reason === 'INSUFFICIENT_STOCK') {
    // Audit #2: schedule an outbox drain even on this degraded path — there
    // may be queued mails (previous successes) worth delivering.
    await scheduleOutboxDrain();
    return NextResponse.json({
      status: 'pending_manual_fulfilment',
      confirmationUuid: order.confirmationUuid,
      codes: [],
      message: 'ชำระเงินถูกตรวจแล้ว — สินค้าเซ็นต์ไม่พอ แอดมินจะจัดส่งโค้ดให้เร็วที่สุด',
    });
  }
  if (outcome.kind === 'parked') {
    // The answer is pending_manual_fulfilment, not confirmed, and it says the
    // payment was verified and delivery is queued. The old 500 here told the
    // customer the whole charge had failed when the bank had already said OK —
    // untrue, and an invitation to transfer a second time.
    await scheduleOutboxDrain();
    return NextResponse.json({
      status: 'pending_manual_fulfilment',
      paymentVerified: true,
      ref: result.ref,
      confirmationUuid: order.confirmationUuid,
      codes: [],
      message:
        'ตรวจสลิปผ่านแล้ว — ยืนยันการชำระเงินเรียบร้อย ระบบกำลังจัดส่งโค้ดให้ แอดมินติดตามจนกว่าจะถึง',
    });
  }
  if (outcome.kind === 'reconciliation_failed') {
    return NextResponse.json(
      {
        error: 'RECONCILIATION_REQUIRED',
        message:
          outcome.stage === 'stock'
            ? 'ตรวจสลิปผ่านแต่ระบบบันทึกสถานะไม่สำเร็จ — ทีมงานจะตรวจสอบและดำเนินการให้เอง'
            : 'ตรวจสลิปผ่านแล้ว (ธนาคารยืนยันการชำระเงิน) แต่ระบบบันทึกสถานะไม่สำเร็จ — ทีมงานได้รับแจ้งแล้วและจะจัดส่งโค้ดให้',
      },
      { status: 500 },
    );
  }

  // ── Notifications + outbox drain (after commit, fire-and-forget) ───────
  // Audit #2: the code-delivery email is a durable outbox row written inside
  // the fulfilment transaction above — the drain below delivers it. The old
  // success copy claimed "ส่งโค้ดให้ทางอีเมลแล้ว" while nobody had sent
  // anything; that was a lie and is gone.
  await scheduleOutboxDrain();

  void notifyPaymentConfirmed({
    orderNumber: order.orderNumber,
    totalThb: Number(order.totalAmountThb),
    // The ops channel must say WHO paid, not just that something was paid.
    customerEmail: order.customerEmail,
  });
  const variantIds = [...new Set(order.items.map((i) => i.variantId))];
  // Post-fulfilment stock policy lives in notifyStockAlertsForVariants
  // (threshold → query → out/low, never throws) — one owner, and a Discord
  // concern can never turn a committed payment into a 5xx: after commit the
  // only awaits left are scheduleOutboxDrain (never throws) and this helper.
  await notifyStockAlertsForVariants(variantIds.filter((v): v is string => v !== null));

  // Plaintext codes ride on this one response so the payment screen can show
  // the product immediately; nobody may cache it (no-store) and the request
  // is already authenticated by the order's slip capability token.
  const codes = await getDeliveredCodes(order.id).catch(() => []);
  return NextResponse.json(
    {
      status: 'confirmed',
      ref: result.ref,
      amountThb: result.amountThb,
      confirmationUuid: order.confirmationUuid,
      // The purchased product + its code, so the page the customer is already
      // standing on can show what they bought (client feedback: "can the
      // product be shown on the webpage when payment is correct and fulfil").
      // Same authenticated request that carried the slip — no new endpoint and
      // no code in a URL. Empty when fulfilment parked the order.
      codes,
      message: 'ตรวจสลิปผ่านแล้ว — ส่งโค้ดเรียบร้อยแล้ว ดูโค้ดด้านล่างได้เลย',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
