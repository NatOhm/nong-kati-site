import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { writeAuditLog } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
}

function mapPromotion(p: { [key: string]: unknown }): Record<string, unknown> {
  return {
    id: p['id'],
    name: p['name'],
    description: p['description'],
    scope: p['scope'],
    discountType: p['discountType'],
    discountValue: Number(p['discountValue']),
    productIds: typeof p['productIds'] === 'string' ? JSON.parse(p['productIds']) : [],
    minSpendThb: p['minSpendThb'] === null ? null : Number(p['minSpendThb']),
    isActive: p['isActive'],
    startsAt: p['startsAt'],
    expiresAt: p['expiresAt'],
    createdAt: p['createdAt'],
  };
}

/** GET /api/v1/admin/promotions — list all promotions (promotions:read). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'promotions:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const promotions = await prisma.promotion.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ promotions: promotions.map(mapPromotion) });
}

/** POST /api/v1/admin/promotions — create a promotion (promotions:write). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'promotions:write');
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

  const name = typeof b['name'] === 'string' ? b['name'].trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'NAME_REQUIRED' }, { status: 400 });
  }

  const scope = b['scope'] === 'all' ? 'all' : 'selected';
  const discountType = b['discountType'] === 'amount' ? 'amount' : 'percent';
  const discountValue = Number(b['discountValue'] ?? 0);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return NextResponse.json({ error: 'INVALID_VALUE' }, { status: 400 });
  }
  if (discountType === 'percent' && discountValue > 100) {
    return NextResponse.json({ error: 'INVALID_VALUE' }, { status: 400 });
  }

  // For selected scope, require product IDs
  let productIds: string[] = [];
  if (scope === 'selected') {
    const rawIds = b['productIds'];
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json({ error: 'PRODUCT_IDS_REQUIRED' }, { status: 400 });
    }
    productIds = rawIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '');
    if (productIds.length === 0) {
      return NextResponse.json({ error: 'PRODUCT_IDS_REQUIRED' }, { status: 400 });
    }
    // Validate all product IDs exist and are active
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      return NextResponse.json({ error: 'INVALID_PRODUCT_IDS' }, { status: 400 });
    }
  }

  const minSpend =
    b['minSpendThb'] === undefined || b['minSpendThb'] === null || b['minSpendThb'] === ''
      ? null
      : Number(b['minSpendThb']);
  if (minSpend !== null && (!Number.isFinite(minSpend) || minSpend < 0)) {
    return NextResponse.json({ error: 'INVALID_MIN_SPEND' }, { status: 400 });
  }

  const startsAt =
    typeof b['startsAt'] === 'string' && b['startsAt'] ? new Date(b['startsAt']) : null;
  const expiresAt =
    typeof b['expiresAt'] === 'string' && b['expiresAt'] ? new Date(b['expiresAt']) : null;

  if (startsAt && expiresAt && startsAt >= expiresAt) {
    return NextResponse.json({ error: 'INVALID_DATES' }, { status: 400 });
  }

  const description =
    typeof b['description'] === 'string' ? b['description'].trim() || null : null;

  const created = await prisma.promotion.create({
    data: {
      name,
      description,
      scope,
      discountType,
      discountValue,
      productIds: productIds.length > 0 ? JSON.stringify(productIds) : null,
      minSpendThb: minSpend,
      startsAt,
      expiresAt,
    },
  });

  await writeAuditLog({
    actorType: 'admin',
    actorId: check.payload?.sub ?? 'unknown',
    actorEmail: check.payload?.email ?? '',
    action: 'promotion_create',
    tableName: 'Promotion',
    recordId: created.id,
    metadata: { name, scope, discountType, discountValue, minSpendThb: minSpend },
  });

  return NextResponse.json(mapPromotion(created), { status: 201 });
}

/** PATCH /api/v1/admin/promotions — bulk update (toggle active, etc.) */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'promotions:write');
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

  // Bulk toggle
  if (typeof b['toggleIds'] === 'object' && Array.isArray(b['toggleIds'])) {
    const ids = (b['toggleIds'] as unknown[]).filter(
      (id): id is string => typeof id === 'string',
    );
    const isActive = b['isActive'] === true;
    if (ids.length === 0) {
      return NextResponse.json({ error: 'NO_IDS' }, { status: 400 });
    }
    await prisma.promotion.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    await writeAuditLog({
      actorType: 'admin',
      actorId: check.payload?.sub ?? 'unknown',
      actorEmail: check.payload?.email ?? '',
      action: 'promotion_toggle',
      tableName: 'Promotion',
      recordId: ids.join(','),
      metadata: { isActive },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 });
}

/** DELETE /api/v1/admin/promotions — bulk delete */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'promotions:delete');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const ids = req.nextUrl.searchParams.getAll('id').filter((id) => id.trim() !== '');
  if (ids.length === 0) {
    return NextResponse.json({ error: 'NO_IDS' }, { status: 400 });
  }

  await prisma.promotion.deleteMany({ where: { id: { in: ids } } });
  await writeAuditLog({
    actorType: 'admin',
    actorId: check.payload?.sub ?? 'unknown',
    actorEmail: check.payload?.email ?? '',
    action: 'promotion_delete',
    tableName: 'Promotion',
    recordId: ids.join(','),
    metadata: { count: ids.length },
  });

  return NextResponse.json({ ok: true });
}
