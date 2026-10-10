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
    include: { products: { select: { productId: true } } },
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

  if (b['scope'] !== undefined && b['scope'] !== 'all' && b['scope'] !== 'selected') {
    return NextResponse.json({ error: 'INVALID_SCOPE' }, { status: 400 });
  }
  if (
    b['discountType'] !== undefined &&
    b['discountType'] !== 'percent' &&
    b['discountType'] !== 'amount'
  ) {
    return NextResponse.json({ error: 'INVALID_DISCOUNT_TYPE' }, { status: 400 });
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
    // Deduplicate before the count check and before join-row creation.
    productIds = [
      ...new Set(
        rawIds.filter((id): id is string => typeof id === 'string' && id.trim() !== ''),
      ),
    ];
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

  const startsParsed = parseDateInput(b['startsAt']);
  const expiresParsed = parseDateInput(b['expiresAt']);
  if (!startsParsed.ok || !expiresParsed.ok) {
    return NextResponse.json({ error: 'INVALID_DATES' }, { status: 400 });
  }
  const startsAt = startsParsed.date;
  const expiresAt = expiresParsed.date;

  if (startsAt && expiresAt && startsAt >= expiresAt) {
    return NextResponse.json({ error: 'INVALID_DATES' }, { status: 400 });
  }

  const description =
    typeof b['description'] === 'string' ? b['description'].trim() || null : null;

  // The promotion write AND its audit row are one transaction: a mutation
  // that succeeds must never be unaudited.
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.promotion.create({
      data: {
        name,
        description,
        scope,
        discountType,
        discountValue,
        minSpendThb: minSpend,
        startsAt,
        expiresAt,
        ...(scope === 'selected'
          ? {
              products: {
                create: productIds.map((pid) => ({ productId: pid })),
              },
            }
          : {}),
      },
      include: { products: { select: { productId: true } } },
    });
    await writeAuditLog({
      actorType: 'admin',
      actorId: check.payload?.sub ?? 'unknown',
      actorEmail: check.payload?.email ?? '',
      action: 'promotion_create',
      tableName: 'Promotion',
      recordId: row.id,
      metadata: { name, scope, discountType, discountValue, minSpendThb: minSpend },
      tx,
    });
    return row;
  });

  // Notify only after commit and only when the new promotion is active and
  // effective right now — never for future-scheduled windows.
  if (created.isActive && isEffectiveNow(created.startsAt, created.expiresAt)) {
    await notifyPromotionPublishedSafely({
      promotionName: created.name,
      discountType,
      discountValue,
      scope,
      ...(created.expiresAt ? { expiresAt: created.expiresAt.toISOString() } : {}),
    });
  }

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
    const before = await prisma.promotion.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        scope: true,
        discountType: true,
        discountValue: true,
        startsAt: true,
        expiresAt: true,
        isActive: true,
      },
    });
    await prisma.$transaction(async (tx) => {
      await tx.promotion.updateMany({
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
        tx,
      });
    });
    // Notify only for rows that transitioned into active AND effective-now
    // after commit — no duplicates for rows already in that state.
    for (const row of before) {
      const wasEffective = row.isActive && isEffectiveNow(row.startsAt, row.expiresAt);
      const nowEffective = isActive && isEffectiveNow(row.startsAt, row.expiresAt);
      if (!wasEffective && nowEffective) {
        await notifyPromotionPublishedSafely({
          promotionName: row.name,
          discountType: row.discountType === 'amount' ? 'amount' : 'percent',
          discountValue: Number(row.discountValue),
          scope: row.scope === 'all' ? 'all' : 'selected',
          ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}),
        });
      }
    }
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

  await prisma.$transaction(async (tx) => {
    await tx.promotion.deleteMany({ where: { id: { in: ids } } });
    await writeAuditLog({
      actorType: 'admin',
      actorId: check.payload?.sub ?? 'unknown',
      actorEmail: check.payload?.email ?? '',
      action: 'promotion_delete',
      tableName: 'Promotion',
      recordId: ids.join(','),
      metadata: { count: ids.length },
      tx,
    });
  });

  return NextResponse.json({ ok: true });
}
