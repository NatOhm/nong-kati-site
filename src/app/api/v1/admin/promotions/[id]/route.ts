import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { writeAuditLog } from '@/lib/auditLog';
import {
  isEffectiveNow,
  notifyPromotionPublishedSafely,
  parseDateInput,
} from '@/lib/promotionValidation';

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
    productIds: Array.isArray(p['products'])
      ? (p['products'] as Array<{ [key: string]: unknown }>)
          .map((row) => row['productId'])
          .filter((pid): pid is string => typeof pid === 'string')
      : [],
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
  const promotion = await prisma.promotion.findUnique({
    where: { id },
    include: { products: { select: { productId: true } } },
  });
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
  const existing = await prisma.promotion.findUnique({
    where: { id },
    include: { products: { select: { productId: true } } },
  });
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

  // Partial updates are legitimate (the UI toggles isActive with a body
  // containing only { isActive }), so an omitted field keeps its current
  // value; an INVALID explicit value is rejected, never silently coerced.
  let scope: 'all' | 'selected';
  if (b['scope'] === undefined) {
    scope = existing.scope === 'all' ? 'all' : 'selected';
  } else if (b['scope'] === 'all' || b['scope'] === 'selected') {
    scope = b['scope'];
  } else {
    return NextResponse.json({ error: 'INVALID_SCOPE' }, { status: 400 });
  }
  let discountType: 'percent' | 'amount';
  if (b['discountType'] === undefined) {
    discountType = existing.discountType === 'amount' ? 'amount' : 'percent';
  } else if (b['discountType'] === 'percent' || b['discountType'] === 'amount') {
    discountType = b['discountType'];
  } else {
    return NextResponse.json({ error: 'INVALID_DISCOUNT_TYPE' }, { status: 400 });
  }
  const discountValue = Number(b['discountValue'] ?? existing.discountValue);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return NextResponse.json({ error: 'INVALID_VALUE' }, { status: 400 });
  }
  if (discountType === 'percent' && discountValue > 100) {
    return NextResponse.json({ error: 'INVALID_VALUE' }, { status: 400 });
  }

  // Product membership for 'selected' scope: supplied IDs (deduplicated)
  // replace the join rows; omitted IDs keep the existing rows. Either way
  // the final set must be non-empty and reference active products.
  // 'all' scope must end with ZERO join rows.
  let productIds: string[] = [];
  if (scope === 'selected') {
    const rawIds = b['productIds'];
    if (Array.isArray(rawIds)) {
      productIds = [
        ...new Set(
          rawIds.filter((pid): pid is string => typeof pid === 'string' && pid.trim() !== ''),
        ),
      ];
    } else {
      productIds = existing.products.map((row) => row.productId);
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

  const startsParsed = parseDateInput(b['startsAt']);
  const expiresParsed = parseDateInput(b['expiresAt']);
  if (!startsParsed.ok || !expiresParsed.ok) {
    return NextResponse.json({ error: 'INVALID_DATES' }, { status: 400 });
  }
  const startsAt = startsParsed.date ?? existing.startsAt;
  const expiresAt = expiresParsed.date ?? existing.expiresAt;

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

  if (startsAt) updateData['startsAt'] = startsAt;
  if (expiresAt) updateData['expiresAt'] = expiresAt;

  // Handle isActive toggle separately
  const nextIsActive =
    b['isActive'] === undefined ? existing.isActive : b['isActive'] === true;
  updateData['isActive'] = nextIsActive;

  // The promotion write, the join-row replacement, and the audit row are
  // ONE transaction: a mutation that succeeds is never unaudited and never
  // leaves a stale scope/product-membership state behind.
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.promotion.update({
      where: { id },
      data: updateData,
      include: { products: { select: { productId: true } } },
    });
    // Membership invariant: 'all' → no join rows; 'selected' → exactly the
    // validated set (replace, never merge).
    await tx.promotionProduct.deleteMany({ where: { promotionId: id } });
    if (scope === 'selected') {
      await tx.promotionProduct.createMany({
        data: productIds.map((pid) => ({ promotionId: id, productId: pid })),
      });
    }
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
        isActive: nextIsActive,
      },
      tx,
    });
    return row;
  });

  // Notify only on a committed transition into active AND effective-now.
  // Idempotent re-saves of an already-effective promotion do not notify.
  const wasEffective =
    existing.isActive && isEffectiveNow(existing.startsAt, existing.expiresAt);
  const nowEffective =
    nextIsActive && isEffectiveNow(updated.startsAt, updated.expiresAt);
  if (!wasEffective && nowEffective) {
    await notifyPromotionPublishedSafely({
      promotionName: updated.name,
      discountType,
      discountValue,
      scope,
      ...(updated.expiresAt ? { expiresAt: updated.expiresAt.toISOString() } : {}),
    });
  }

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

  await prisma.$transaction(async (tx) => {
    await tx.promotion.delete({ where: { id } });
    await writeAuditLog({
      actorType: 'admin',
      actorId: check.payload?.sub ?? 'unknown',
      actorEmail: check.payload?.email ?? '',
      action: 'promotion_delete',
      tableName: 'Promotion',
      recordId: id,
      metadata: { name: existing.name },
      tx,
    });
  });

  return NextResponse.json({ ok: true });
}
