import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { writeAuditLog } from '@/lib/auditLog';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

function mapCoupon(c: { [key: string]: unknown }): Record<string, unknown> {
  return {
    id: c['id'],
    code: c['code'],
    description: c['description'],
    discountType: c['discountType'],
    discountValue: Number(c['discountValue']),
    minSpendThb: c['minSpendThb'] === null ? null : Number(c['minSpendThb']),
    usageLimit: c['usageLimit'],
    perCustomerLimit: c['perCustomerLimit'],
    usageCount: c['usageCount'],
    isActive: c['isActive'],
    startsAt: c['startsAt'],
    expiresAt: c['expiresAt'],
    createdAt: c['createdAt'],
  };
}

/** GET /api/v1/admin/coupons — list all coupons (coupons:read). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'coupons:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ coupons: coupons.map(mapCoupon) });
}

/**
 * POST /api/v1/admin/coupons — create a coupon (coupons:write).
 * Body: { code, description?, discountType: 'percent'|'amount', discountValue,
 *         minSpendThb?, usageLimit?, expiresAt? }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'coupons:write');
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

  const code = typeof b['code'] === 'string' ? b['code'].trim().toUpperCase() : '';
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return NextResponse.json({ error: 'INVALID_CODE' }, { status: 400 });
  }
  const discountType = b['discountType'] === 'amount' ? 'amount' : 'percent';
  const discountValue = Number(b['discountValue'] ?? 0);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return NextResponse.json({ error: 'INVALID_VALUE' }, { status: 400 });
  }
  if (discountType === 'percent' && discountValue > 100) {
    return NextResponse.json({ error: 'INVALID_VALUE' }, { status: 400 });
  }
  const minSpend =
    b['minSpendThb'] === undefined || b['minSpendThb'] === null || b['minSpendThb'] === ''
      ? null
      : Number(b['minSpendThb']);
  if (minSpend !== null && (!Number.isFinite(minSpend) || minSpend < 0)) {
    return NextResponse.json({ error: 'INVALID_MIN_SPEND' }, { status: 400 });
  }
  const usageLimit =
    b['usageLimit'] === undefined || b['usageLimit'] === null || b['usageLimit'] === ''
      ? null
      : Number(b['usageLimit']);
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) {
    return NextResponse.json({ error: 'INVALID_USAGE_LIMIT' }, { status: 400 });
  }
  const expiresAt =
    typeof b['expiresAt'] === 'string' && b['expiresAt'] ? new Date(b['expiresAt']) : null;

  const exists = await prisma.coupon.findUnique({ where: { code } });
  if (exists) {
    return NextResponse.json({ error: 'CODE_TAKEN' }, { status: 409 });
  }

  const created = await prisma.coupon.create({
    data: {
      code,
      description: typeof b['description'] === 'string' ? b['description'].trim() : null,
      discountType,
      discountValue,
      minSpendThb: minSpend,
      usageLimit,
      perCustomerLimit: 1,
      expiresAt,
      createdBy: check.payload?.sub ?? null,
    },
  });

  // Review: money-affecting mutations are audited (code, discount shape).
  writeAuditLog({
    actorType: 'admin',
    actorId: check.payload?.sub ?? 'unknown',
    actorEmail: check.payload?.email ?? '',
    action: 'coupon_create',
    tableName: 'Coupon',
    recordId: created.id,
    metadata: { code, discountType, discountValue, usageLimit, minSpendThb: minSpend },
  });

  return NextResponse.json(mapCoupon(created), { status: 201 });
}
