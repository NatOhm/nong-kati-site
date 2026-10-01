import { NextRequest, NextResponse } from 'next/server';

import { createOrder, orderErrorStatus } from '@/api/orders';
import { getCustomerFromToken } from '@/api/customerAuth';
import { getManualTransferInfo } from '@/lib/data';
import { hasUsableChannel, resolvePaymentChannels } from '@/lib/paymentChannels';
import { isOpnConfigured } from '@/lib/payment/omise';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const COOKIE = 'nk_session';

/**
 * GET /api/v1/orders — the signed-in customer's order history (profile
 * คำสั่งซื้อ tab). Newest first; trimmed item lines for the list view.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE)?.value;
  const session = token ? await getCustomerFromToken(token) : null;
  if (!session) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  }

  const orders = await prisma.order.findMany({
    where: { customerId: session.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      items: { select: { productNameTh: true, productNameEn: true, quantity: true } },
    },
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      confirmationUuid: o.confirmationUuid,
      status: o.status,
      totalAmountThb: Number(o.totalAmountThb),
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
      /** First line name in Thai + extra-count for the list label. */
      label:
        o.items[0]?.productNameTh ??
        o.items[0]?.productNameEn ??
        (o.items.length > 0 ? `${o.items.length} รายการ` : '-'),
      extraItems: Math.max(0, o.items.length - 1),
      createdAt: o.createdAt.toISOString(),
    })),
  });
}

/**
 * POST /api/v1/orders — create a pending_payment order.
 * Body: CreateOrderInput; items are {variantId, quantity} references —
 * price/stock are re-read from the DB server-side (client prices ignored).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON' } }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  // Release capability check (security review 2026-09-26 [High]; updated by
  // the production review HIGH-3): never accept an order the storefront
  // cannot let the customer pay for. The gate is the UNION of usable
  // channels — a correctly configured Opn environment must not be blocked
  // by missing legacy manual-transfer settings (that stale gate made real
  // PromptPay unreachable), and manual-only environments keep working.
  // Wallet-only customers are unaffected either way (wallet payment does
  // not need an external channel).
  const sessionCookie = req.cookies.get(COOKIE)?.value ?? null;
  const [manualInfo, opnReady] = await Promise.all([getManualTransferInfo(), isOpnConfigured()]);
  const manualUsable =
    manualInfo.enabled && Boolean(manualInfo.accountName) && Boolean(manualInfo.accountNumber);
  const channels = await resolvePaymentChannels({
    manualUsable,
    opnReady,
    customerSessionCookie: sessionCookie,
  });
  if (!hasUsableChannel(channels)) {
    return NextResponse.json({ error: { code: 'NO_PAYMENT_CHANNEL' } }, { status: 503 });
  }

  // Attach customer id when logged in (session cookie).
  let customerId: string | null = null;
  const token = req.cookies.get(COOKIE)?.value;
  if (token) {
    try {
      const customer = await getCustomerFromToken(token);
      if (customer) customerId = customer.id;
    } catch {
      // invalid cookie — treat as guest
    }
  }

  try {
    const result = await createOrder({
      // Client sends `email`/`phone` (orderClient.ts); accept the API-internal
      // names too so the contract is forgiving at the boundary.
      customerEmail: String(b['customerEmail'] ?? b['email'] ?? ''),
      ...(typeof b['customerPhone'] === 'string'
        ? { customerPhone: b['customerPhone'] as string }
        : typeof b['phone'] === 'string'
          ? { customerPhone: b['phone'] as string }
          : {}),
      paymentMethod: 'promptpay',
      lineOptIn: false,
      marketingOptIn: b['marketingOptIn'] === true,
      tosAccepted: b['tosAccepted'] === true,
      tosVersion: '1.0',
      requiresTaxInvoice: b['requiresTaxInvoice'] === true,
      ...(typeof b['taxInvoiceName'] === 'string'
        ? { taxInvoiceName: b['taxInvoiceName'] as string }
        : {}),
      ...(typeof b['taxInvoiceTaxId'] === 'string'
        ? { taxInvoiceTaxId: b['taxInvoiceTaxId'] as string }
        : {}),
      items: Array.isArray(b['items'])
        ? (b['items'] as { variantId?: unknown; quantity?: unknown }[]).map((i) => ({
            variantId: String(i['variantId'] ?? ''),
            quantity: Number(i['quantity'] ?? 0),
          }))
        : [],
      ...(typeof b['couponCode'] === 'string' ? { couponCode: b['couponCode'] as string } : {}),
      customerId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const code = err instanceof Error ? err.message : 'ORDER_CREATE_FAILED';
    return NextResponse.json({ error: { code } }, { status: orderErrorStatus(code) });
  }
}
