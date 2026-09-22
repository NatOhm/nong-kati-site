import { NextRequest, NextResponse } from 'next/server';

import { adminAdjustCustomerCredit, adminGetCustomer, adminSetCustomerTier } from '@/api/adminCustomers';
import { maskEmail } from '@/lib/rbac';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * GET /api/v1/admin/customers/[id] — full customer detail (customers:read).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'customers:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const customer = await adminGetCustomer(id);
  if (!customer) return NextResponse.json({ error: 'CUSTOMER_NOT_FOUND' }, { status: 404 });
  // Review #3: shape the response by permission — support_agent holds
  // customers:read but not customers:read:full, so raw PII must not leak
  // through the customer endpoints the way it did through orders.
  const fullAccess = check.payload!.perms.includes('customers:read:full');
  return NextResponse.json({
    ...customer,
    email: fullAccess ? customer.email : maskEmail(customer.email),
  });
}

/**
 * PATCH /api/v1/admin/customers/[id] — change the price tier
 * (customers:write). Body {tier: 'retail'|'member'|'dealer'}; audited.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'customers:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const { id } = await ctx.params;

  // Wallet credit adjustment — {action:'credit', amountThb, note?}.
  // Same customers:write gate; balance + TopUpLog + audit are one transaction.
  if (b['action'] === 'credit') {
    const result = await adminAdjustCustomerCredit(
      id,
      b['amountThb'],
      typeof b['note'] === 'string' ? b['note'] : undefined,
      check.payload?.sub ?? 'unknown',
      check.payload?.email ?? 'unknown',
    );
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'CUSTOMER_NOT_FOUND' ? 404 : 400 },
      );
    }
    return NextResponse.json({
      success: true,
      balanceThb: result.balanceThb,
      amountThb: result.amountThb,
    });
  }

  const result = await adminSetCustomerTier(
    id,
    b['tier'],
    check.payload?.sub ?? 'unknown',
    check.payload?.email ?? 'unknown',
  );
  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'TIER_CHANGE_FAILED' },
      { status: result.error === 'CUSTOMER_NOT_FOUND' ? 404 : 400 },
    );
  }
  return NextResponse.json({ success: true, tier: result.tier });
}
