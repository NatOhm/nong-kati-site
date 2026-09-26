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
 * PATCH /api/v1/admin/variants/[id] — inline price/stock/cost/tier edit from
 * the products table (products:write). Updates the variant IN PLACE — never
 * delete+recreate, so its available GiftCodes stay attached.
 *
 * Body (all optional): { price, cost, stock, memberPrice, dealerPrice, isActive }
 * - stock: absolute value → delta lands in StockMove (adjust) like the editor.
 * - memberPrice/dealerPrice: number | null (null = inherit base price).
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'products:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const variant = await prisma.productVariant.findUnique({ where: { id } });
  if (!variant) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const num = (raw: unknown): { ok: boolean; v: number | null } => {
    if (raw === null || raw === '') return { ok: true, v: null };
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? { ok: true, v: n } : { ok: false, v: null };
  };

  const data: {
    price?: number;
    costThb?: number | null;
    memberPrice?: number | null;
    dealerPrice?: number | null;
    isActive?: boolean;
  } = {};

  if (b['price'] !== undefined) {
    const r = num(b['price']);
    if (!r.ok || r.v === null)
      return NextResponse.json({ error: 'INVALID_PRICE' }, { status: 400 });
    data.price = r.v;
  }
  if (b['cost'] !== undefined) {
    const r = num(b['cost']);
    if (!r.ok) return NextResponse.json({ error: 'INVALID_COST' }, { status: 400 });
    data.costThb = r.v;
  }
  if (b['memberPrice'] !== undefined) {
    const r = num(b['memberPrice']);
    if (!r.ok) return NextResponse.json({ error: 'INVALID_MEMBER_PRICE' }, { status: 400 });
    data.memberPrice = r.v;
  }
  if (b['dealerPrice'] !== undefined) {
    const r = num(b['dealerPrice']);
    if (!r.ok) return NextResponse.json({ error: 'INVALID_DEALER_PRICE' }, { status: 400 });
    data.dealerPrice = r.v;
  }
  if (typeof b['isActive'] === 'boolean') data.isActive = b['isActive'];

  const stockMove = b['stock'] !== undefined;
  let newStock: number | null = null;
  if (stockMove) {
    const n = Number(b['stock']);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return NextResponse.json({ error: 'INVALID_STOCK' }, { status: 400 });
    }
    newStock = n;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.productVariant.update({ where: { id }, data });
    if (newStock !== null && newStock !== v.stock) {
      await tx.stockMove.create({
        data: {
          variantId: id,
          delta: newStock - v.stock,
          reason: 'adjust',
          refType: 'manual',
          note: 'inline edit (products table)',
          stockAfter: newStock,
          actorId: check.payload?.sub ?? null,
        },
      });
      return tx.productVariant.update({ where: { id }, data: { stock: newStock } });
    }
    return v;
  });

  return NextResponse.json({
    id: updated.id,
    label: updated.label,
    price: Number(updated.price),
    cost: updated.costThb === null ? null : Number(updated.costThb),
    memberPrice: updated.memberPrice === null ? null : Number(updated.memberPrice),
    dealerPrice: updated.dealerPrice === null ? null : Number(updated.dealerPrice),
    stock: updated.stock,
    isActive: updated.isActive,
  });
}
