import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * GET /api/v1/admin/inventory — live stock per variant with recent activity.
 * Requires inventory:read.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'inventory:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const variants = await prisma.productVariant.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      product: { select: { name: true } },
      _count: { select: { giftCodes: { where: { status: 'available' } } } },
    },
  });

  const items = variants.map((v) => ({
    id: v.id,
    skuCode: v.label,
    productName: v.product.name,
    price: Number(v.price),
    cost: v.costThb === null ? null : Number(v.costThb),
    stock: v.stock,
    codesAvailable: v._count.giftCodes,
    isActive: v.isActive,
  }));

  // Recent stock moves (last 50) for the ประวัติการจัดสต๊อก table.
  const moves = await prisma.stockMove.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { variant: { select: { label: true, product: { select: { name: true } } } } },
  });

  return NextResponse.json({
    items,
    moves: moves.map((m) => ({
      id: m.id,
      variantLabel: m.variant.label,
      productName: m.variant.product.name,
      delta: m.delta,
      reason: m.reason,
      note: m.note,
      stockAfter: m.stockAfter,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

/**
 * POST /api/v1/admin/inventory — restock or adjust a variant's stock.
 * Body: { variantId, delta, reason?, note? } — delta can be negative.
 * Updates stock and writes a StockMove atomically.
 * Requires inventory:upload (เติมสต๊อก).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'inventory:upload');
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
  const variantId = String(b['variantId'] ?? '');
  const delta = Number(b['delta'] ?? 0);
  const reason = typeof b['reason'] === 'string' ? b['reason'] : 'restock';
  const note = typeof b['note'] === 'string' ? b['note'] : null;

  if (!variantId || !Number.isInteger(delta) || delta === 0) {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.update({
      where: { id: variantId },
      data: { stock: { increment: delta } },
      select: { stock: true, label: true },
    });
    if (variant.stock < 0) {
      await tx.productVariant.update({ where: { id: variantId }, data: { stock: 0 } });
      variant.stock = 0;
    }
    await tx.stockMove.create({
      data: {
        variantId,
        delta,
        reason: delta > 0 ? reason : 'adjust',
        refType: 'manual',
        note,
        stockAfter: variant.stock,
        actorType: 'admin',
        actorId: check.payload?.sub ?? null,
      },
    });
    return variant;
  });

  return NextResponse.json({ stock: result.stock, label: result.label });
}
