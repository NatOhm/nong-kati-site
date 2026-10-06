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

/** GET /api/v1/admin/promotions/[id] — get one promotion (promotions:read). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'promotions:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const { id } = await params;
  const promotion = await prisma.promotion.findUnique({ where: { id } });
  if (!promotion) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  return NextResponse.json(mapPromotion(promotion));
}

/** PATCH /api/v1/admin/promotions/[id] — update a promotion (promotions:write). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'promotions:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.promotion.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const name =
    typeof b['name'] === 'string' ? b['name'].trim() : existing.name;
  if (!name) {
    return NextResponse.json({ error: 'NAME_REQUIRED' }, { status: 400 });
  }

  const scope: 'all' | 'selected' = b['scope'] === 'all' ? 'all' : 'selected';
  const discountType: 'percent' | 'amount' = b['discountType'] === 'amount' ? 'amount' : 'percent';
  const discountValue = Number(b['discountValue'] ?? existing.discountValue);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return NextResponse.json({ error: 'INVALID_VALUE' }, { status: 400 });
  }
  if (discountType === 'percent' && discountValue > 100) {
    return NextResponse.json({ error: 'INVALID_VALUE' }, { status: 400 });
  }

  // Handle product IDs for selected scope
  let productIds: string[] = [];
  if (scope === 'selected') {
    const rawIds = b['productIds'];
    if (Array.isArray(rawIds)) {
      productIds = rawIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '');
    }
    if (productIds.length === 0) {
      return NextResponse.json({ error: 'PRODUCT_IDS_REQUIRED' }, { status: 400 });
    }
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
    typeof b['startsAt'] === 'string' && b['startsAt']
      ? new Date(b['startsAt'])
      : existing.startsAt;
  const expiresAt =
    typeof b['expiresAt'] === 'string' && b['expiresAt']
      ? new Date(b['expiresAt'])
      : existing.expiresAt;

  if (startsAt && expiresAt && startsAt >= expiresAt) {
    return NextResponse.json({ error: 'INVALID_DATES' }, { status: 400 });
  }

  const description =
    typeof b['description'] === 'string' ? b['description'].trim() || null : existing.description;

  const updateData: Record<string, unknown> = {};
  updateData['name'] = name;
  updateData['description'] = description;
  updateData['scope'] = scope;
  updateData['discountType'] = discountType;
  updateData['discountValue'] = discountValue;
  updateData['minSpendThb'] = minSpend;

  if (scope === 'selected') {
    updateData['productIds'] = JSON.stringify(productIds);
  } else {
    updateData['productIds'] = null;
  }

  if (startsAt) updateData['startsAt'] = startsAt;
  if (expiresAt) updateData['expiresAt'] = expiresAt;

  // Handle isActive toggle separately
  if (b['isActive'] !== undefined) {
    updateData['isActive'] = b['isActive'] === true;
  }

  const updated = await prisma.promotion.update({
    where: { id },
    data: updateData,
  });

  await writeAuditLog({
    actorType: 'admin',
    actorId: check.payload?.sub ?? 'unknown',
    actorEmail: check.payload?.email ?? '',
    action: 'promotion_update',
    tableName: 'Promotion',
    recordId: id,
    metadata: {
      name,
      scope,
      discountType,
      discountValue,
      minSpendThb: minSpend,
      isActive: updateData['isActive'] ?? existing.isActive,
    },
  });

  return NextResponse.json(mapPromotion(updated));
}

/** DELETE /api/v1/admin/promotions/[id] — delete one promotion (promotions:delete). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'promotions:delete');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.promotion.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  await prisma.promotion.delete({ where: { id } });
  await writeAuditLog({
    actorType: 'admin',
    actorId: check.payload?.sub ?? 'unknown',
    actorEmail: check.payload?.email ?? '',
    action: 'promotion_delete',
    tableName: 'Promotion',
    recordId: id,
    metadata: { name: existing.name },
  });

  return NextResponse.json({ ok: true });
}
