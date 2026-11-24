/**
 * GET  /api/v1/admin/orders/[id]/slip-provider-code  (orders:read)
 * POST /api/v1/admin/orders/[id]/slip-provider-code  (orders:write)
 *
 * Why this exists (23 พ.ย. 2569, order NK-2026-000237): an `INVALID_SLIP`
 * verdict accuses the customer's slip of being bad, and the only evidence for
 * WHY is the provider's own code. The row keeps `failureReason` plus a prose
 * `detail` — and 200500's detail reads `fraud: …`, the code already gone — so
 * explaining one order meant reading the worker's console on the request that
 * produced it. That is prod shell access for a support question, and it does
 * not exist after the fact at all.
 *
 * GET  answers from the attempt row alone: verdict, provider, stored detail
 *      and the raw provider code when the row recorded one. Free — no provider
 *      call — and it works on rows written before the code was persisted. On
 *      its own it cannot recover a code an older row never kept.
 * POST re-reads the slip image already stored for the order through Slip2Go
 *      with the same body production sends, and reports the provider's raw
 *      code/message/HTTP status next to the verdict this app maps it to. That
 *      is the only way to recover a code the row never kept, and it spends ONE
 *      verification credit. It writes nothing: no order/attempt update, no
 *      settlement, no change to the re-check budget or the slip evidence.
 *
 * Admin-only: `orders:read` to look, `orders:write` (the confirm-a-slip
 * permission) to spend the credit.
 */
import { NextRequest, NextResponse } from 'next/server';

import { getAdminToken } from '@/lib/adminRequest';
import { getManualTransferInfo } from '@/lib/data';
import { prisma } from '@/lib/db';
import { isSlip2GoEnabled, verifySlip2Go } from '@/lib/payment/slip2go';
import { checkPermission } from '@/lib/rbac';
import { readSlip, slipKeyFromImageUrl } from '@/lib/slipStore';
import type { Permission } from '@/types/auth';

export const dynamic = 'force-dynamic';

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  totalAmountThb: true,
  slipImageUrl: true,
  slipUploadedAt: true,
  paymentAttempts: {
    where: { paymentMethod: 'promptpay' },
    orderBy: { updatedAt: 'desc' },
    take: 1,
    select: {
      failureReason: true,
      gatewayStatusCode: true,
      slipVerifiedBy: true,
      slipVerifiedRef: true,
      gatewayResponse: true,
      updatedAt: true,
    },
  },
} as const;

/** JSON response that no cache may keep (financial diagnostics). */
function answer(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Guard: token present, permission held. Null means "carry on". */
async function guard(req: NextRequest, permission: Permission): Promise<NextResponse | null> {
  const token = getAdminToken(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, permission);
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  return null;
}

function loadOrder(id: string) {
  return prisma.order.findUnique({ where: { id }, select: ORDER_SELECT });
}

function storedDiagnostics(gatewayResponse: unknown): {
  verdict: string | null;
  provider: string | null;
  detail: string | null;
  providerCode: string | null;
  checkedAt: string | null;
} {
  if (!gatewayResponse || typeof gatewayResponse !== 'object') {
    return { verdict: null, provider: null, detail: null, providerCode: null, checkedAt: null };
  }
  const json = gatewayResponse as Record<string, unknown>;
  const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
  return {
    verdict: str(json['error']),
    provider: str(json['provider']),
    detail: str(json['detail']),
    providerCode: str(json['providerCode']),
    checkedAt: str(json['checkedAt']),
  };
}

/** GET — what the attempt row already knows. No provider call, no cost. */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = await guard(req, 'orders:read');
  if (denied) return denied;
  const { id } = await ctx.params;

  const order = await loadOrder(id);
  if (!order) return answer({ error: 'NOT_FOUND' }, 404);

  const attempt = order.paymentAttempts[0] ?? null;
  const stored = storedDiagnostics(attempt?.gatewayResponse);
  return answer({
    orderNumber: order.orderNumber,
    // null when no auto-check ever ran on this order.
    stored: attempt
      ? {
          verdict: stored.verdict ?? attempt.failureReason ?? null,
          provider: stored.provider ?? attempt.gatewayStatusCode ?? attempt.slipVerifiedBy ?? null,
          detail: stored.detail,
          // Null on rows written before 23 Nov 2026 — POST re-reads the slip
          // to recover it (one credit).
          providerCode: stored.providerCode,
          checkedAt: stored.checkedAt ?? attempt.updatedAt.toISOString(),
          confirmedRef: attempt.slipVerifiedRef,
        }
      : null,
    slipImage: {
      available: slipKeyFromImageUrl(order.slipImageUrl) !== null,
      url: order.slipImageUrl,
      uploadedAt: order.slipUploadedAt?.toISOString() ?? null,
    },
    probe: {
      method: 'POST',
      sameUrl: true,
      permission: 'orders:write',
      cost: '1 Slip2Go verification credit',
      writes: false,
    },
  });
}

/** POST — re-read the stored slip through Slip2Go and report its raw answer. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = await guard(req, 'orders:write');
  if (denied) return denied;
  const { id } = await ctx.params;

  const order = await loadOrder(id);
  if (!order) return answer({ error: 'NOT_FOUND' }, 404);

  const key = slipKeyFromImageUrl(order.slipImageUrl);
  const bytes = key ? await readSlip(key).catch(() => null) : null;
  if (!bytes) {
    // Nothing stored to ask about: the admin has no file for this order, so a
    // credit would buy a network error instead of an answer.
    return answer(
      {
        error: 'SLIP_NOT_AVAILABLE',
        message: 'ไม่พบไฟล์สลิปของคำสั่งซื้อนี้ในระบบ — ตรวจสอบจากรูปที่ลูกค้าส่งมาโดยตรง',
      },
      409,
    );
  }
  if (!isSlip2GoEnabled()) {
    return answer(
      { error: 'SLIP2GO_NOT_CONFIGURED', message: 'ยังไม่ได้ตั้งค่า Slip2Go — อ่านรหัสจาก provider ไม่ได้' },
      503,
    );
  }

  const manualInfo = await getManualTransferInfo();
  // Same body production sends (amount eq + duplicate + store account), so the
  // answer is comparable with the verdict the customer actually saw.
  const result = await verifySlip2Go({
    imageBase64: bytes.toString('base64'),
    expectedAmountThb: Number(order.totalAmountThb),
    ...(manualInfo.accountNumber ? { expectedReceiverDigits: manualInfo.accountNumber } : {}),
  });

  const base = {
    orderNumber: order.orderNumber,
    provider: 'slip2go' as const,
    cost: '1 Slip2Go verification credit',
    writes: false,
  };

  if (result.ok) {
    return answer({
      ...base,
      matched: true,
      verdict: 'CONFIRMED',
      ref: result.ref,
      amountThb: result.amountThb,
      receiverAccount: result.receiverAccount,
      transferAt: result.transferAt,
      providerCode: result.providerCode ?? null,
      providerMessage: null,
      httpStatus: 200,
    });
  }

  return answer({
    ...base,
    matched: false,
    // The verdict this app maps the raw answer to — the code beside it is the
    // provider's own, which is what an INVALID_SLIP report needs.
    verdict: result.code,
    detail: result.detail ?? null,
    providerCode: result.providerCode ?? null,
    providerMessage: result.providerMessage ?? null,
    httpStatus: result.httpStatus ?? null,
  });
}
