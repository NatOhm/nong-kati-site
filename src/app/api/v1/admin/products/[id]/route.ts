/**
 * DELETE /api/v1/admin/products/[id] — PERMANENT hard delete (products:write).
 *
 * This used to be a soft-archive (isActive: false), which is why the client
 * could never actually remove a test product — it just got hidden. It is now
 * a real delete: the product, its variants and its unused gift codes are
 * destroyed in one transaction, guarded so we never pull a variant out from
 * under an in-flight order.
 *
 * Order history and every money total survive: the purge DETACHES each
 * historical `OrderItem` (variantId → null, migration
 * 20261025150000_nullable_catalog_variant_links) instead of deleting it, and
 * every rendered field is an FK-free snapshot — so a past order still renders
 * and totals correctly after the product row is gone. Delivered gift codes
 * survive the same way.
 * See src/lib/catalogPurge.ts for the full guard + delete order.
 */
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { normalizeProductShortDescription } from '@/lib/ogShareSettings';
import { purgeProduct } from '@/lib/catalogPurge';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
}

/**
 * PUT /api/v1/admin/products/[id] — update product info, image and variants
 * (products:write). Only fields present in the body are changed.
 */
export async function PUT(
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

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const data: {
    name?: string;
    sku?: string | null;
    description?: string | null;
    shortDescription?: string | null;
    imageUrl?: string | null;
    categoryId?: string;
    isActive?: boolean;
    isFeatured?: boolean;
    tags?: { deleteMany: { productId: string }[]; create: { tagId: string }[] };
  } = {};

  if (typeof b['name'] === 'string' && b['name'].trim() !== '') data.name = b['name'].trim();
  // SKU: string เปลี่ยนรหัส (ต้องไม่ซ้ำ), null เคลียร์, ไม่ส่งมา = ไม่แก้
  if (b['sku'] === null) {
    data.sku = null;
  } else if (typeof b['sku'] === 'string') {
    const sku = b['sku'].trim().toUpperCase();
    if (sku === '') {
      data.sku = null;
    } else {
      const clash = await prisma.product.findUnique({ where: { sku } });
      if (clash && clash.id !== id) {
        return NextResponse.json({ error: 'SKU_TAKEN' }, { status: 409 });
      }
      data.sku = sku;
    }
  }
  if (typeof b['description'] === 'string' || b['description'] === null) {
    data.description = b['description'] as string | null;
  }
  // Short description (link-preview copy): string เปลี่ยน, null เคลียร์,
  // ไม่ส่งมา = ไม่แก้ — sanitize + cap ที่ normalizeProductShortDescription
  if (b['shortDescription'] === null) {
    data.shortDescription = null;
  } else if (typeof b['shortDescription'] === 'string') {
    const v = normalizeProductShortDescription(b['shortDescription']);
    data.shortDescription = v === '' ? null : v;
  }
  // Image: either a served upload path (/products/...) or null to clear.
  if (b['imageUrl'] === null) {
    data.imageUrl = null;
  } else if (typeof b['imageUrl'] === 'string' && b['imageUrl'].startsWith('/')) {
    data.imageUrl = b['imageUrl'];
  }
  if (typeof b['categoryId'] === 'string' && b['categoryId'] !== '') {
    const cat = await prisma.category.findUnique({ where: { id: b['categoryId'] } });
    if (!cat) return NextResponse.json({ error: 'CATEGORY_NOT_FOUND' }, { status: 400 });
    data.categoryId = b['categoryId'];
  }
  if (typeof b['isActive'] === 'boolean') data.isActive = b['isActive'];
  if (typeof b['isFeatured'] === 'boolean') data.isFeatured = b['isFeatured'];
  // Tags: replace-all semantics when present (array of tag ids).
  if (b['tagIds'] !== undefined) {
    if (!Array.isArray(b['tagIds'])) {
      return NextResponse.json({ error: 'INVALID_TAGS' }, { status: 400 });
    }
    const ids = [
      ...new Set((b['tagIds'] as unknown[]).filter((x): x is string => typeof x === 'string')),
    ];
    const valid = await prisma.tag.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (valid.length !== ids.length) {
      return NextResponse.json({ error: 'TAG_NOT_FOUND' }, { status: 400 });
    }
    data.tags = { deleteMany: [{ productId: id }], create: ids.map((tagId) => ({ tagId })) };
  }

  // Variants: replace-all semantics when present.
  if (b['variants'] !== undefined) {
    if (!Array.isArray(b['variants']) || b['variants'].length === 0) {
      return NextResponse.json({ error: 'VARIANTS_REQUIRED' }, { status: 400 });
    }
    const parsed = (b['variants'] as Record<string, unknown>[]).map((v) => {
      const label = typeof v['label'] === 'string' ? v['label'].trim() : '';
      const price = typeof v['price'] === 'number' ? v['price'] : NaN;
      const stock = typeof v['stock'] === 'number' ? v['stock'] : NaN;
      const isActive = v['isActive'] !== false;
      if (!label || !Number.isFinite(price) || price < 0 || !Number.isFinite(stock) || stock < 0) {
        return null;
      }
      // ต้นทุนต่อชิ้น (รายงานกำไร) — null ได้
      let cost: number | null = null;
      if (v['cost'] !== null && v['cost'] !== undefined && v['cost'] !== '') {
        cost = Number(v['cost']);
        if (!Number.isFinite(cost) || cost < 0) return null;
      }
      // Tier prices — optional, null means inherit the base price
      const tier = (raw: unknown): number | null => {
        if (raw === null || raw === undefined || raw === '') return null;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 ? n : null;
      };
      const memberPrice = tier(v['memberPrice']);
      const dealerPrice = tier(v['dealerPrice']);
      return { label, price, stock, isActive, cost, memberPrice, dealerPrice };
    });
    if (parsed.some((v) => v === null)) {
      return NextResponse.json({ error: 'INVALID_VARIANT' }, { status: 400 });
    }
    // Snapshot existing stock so editor-driven changes land in the
    // ประวัติการจัดสต๊อก (StockMove) audit trail.
    const beforeVariants = await prisma.productVariant.findMany({
      where: { productId: id },
      select: { id: true, label: true, stock: true },
    });
    const beforeByLabel = new Map(beforeVariants.map((v) => [v.label, v.stock]));

    // OrderItem.variant has onDelete: Restrict, so variants referenced by past
    // orders cannot be replaced wholesale — deactivate them instead, which
    // preserves order history while hiding the old denominations from sale.
    const referenced = await prisma.orderItem.findFirst({
      where: { variant: { productId: id } },
      select: { id: true },
    });
    if (referenced) {
      await prisma.productVariant.updateMany({
        where: { productId: id },
        data: { isActive: false },
      });
      await prisma.productVariant.createMany({
        data: parsed.map((v, i) => ({
          productId: id,
          label: v!.label,
          price: v!.price,
          memberPrice: v!.memberPrice,
          dealerPrice: v!.dealerPrice,
          stock: v!.stock,
          costThb: v!.cost,
          isActive: v!.isActive,
          sortOrder: i,
        })),
      });
      await prisma.product.update({ where: { id }, data });
    } else {
      await prisma.$transaction([
        prisma.productVariant.deleteMany({ where: { productId: id } }),
        prisma.product.update({
          where: { id },
          data: {
            ...data,
            variants: {
              create: parsed.map((v, i) => ({
                label: v!.label,
                price: v!.price,
                memberPrice: v!.memberPrice,
                dealerPrice: v!.dealerPrice,
                stock: v!.stock,
                costThb: v!.cost,
                isActive: v!.isActive,
                sortOrder: i,
              })),
            },
          },
        }),
      ]);
    }
    // Record stock deltas for labels whose stock changed (new labels count
    // as a restock from zero).
    const afterVariants = await prisma.productVariant.findMany({
      where: { productId: id, isActive: true },
      select: { id: true, label: true, stock: true },
    });
    const moves = afterVariants
      .map((v) => {
        const beforeStock = beforeByLabel.get(v.label) ?? 0;
        return { variantId: v.id, delta: v.stock - beforeStock, stockAfter: v.stock };
      })
      .filter((m) => m.delta !== 0);
    if (moves.length > 0) {
      await prisma.stockMove.createMany({
        data: moves.map((m) => ({
          variantId: m.variantId,
          delta: m.delta,
          reason: m.delta > 0 ? 'restock' : 'adjust',
          refType: 'product_edit',
          note: 'ปรับสต๊อกจากหน้าแก้ไขสินค้า',
          stockAfter: m.stockAfter,
          actorType: 'admin',
          actorId: check.payload?.sub ?? null,
        })),
      });
    }
  } else if (Object.keys(data).length > 0) {
    await prisma.product.update({ where: { id }, data });
  }

  const updated = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: { orderBy: { sortOrder: 'asc' } },
      tags: { include: { tag: true } },
    },
  });
  return NextResponse.json({
    id: updated!.id,
    name: updated!.name,
    slug: updated!.slug,
    description: updated!.description,
    imageUrl: updated!.imageUrl,
    isActive: updated!.isActive,
    isFeatured: updated!.isFeatured,
    tags: updated!.tags.map((pt) => ({ id: pt.tag.id, name: pt.tag.name, slug: pt.tag.slug })),
    variants: updated!.variants.map((v) => ({
      id: v.id,
      label: v.label,
      price: Number(v.price),
      memberPrice: v.memberPrice === null ? null : Number(v.memberPrice),
      dealerPrice: v.dealerPrice === null ? null : Number(v.dealerPrice),
      stock: v.stock,
      cost: v.costThb === null ? null : Number(v.costThb),
      isActive: v.isActive,
      sortOrder: v.sortOrder,
    })),
  });
}

/**
 * DELETE /api/v1/admin/products/[id] — PERMANENT hard delete (products:write).
 *
 * This used to be a soft-archive (isActive: false), which is why the client
 * could never actually remove a test product — it just got hidden. It is now
 * a real delete: the product, its variants and its unused gift codes are
 * destroyed in one transaction, guarded so we never pull a variant out from
 * under an in-flight order.
 *
 * Order history and every money total survive: the purge DETACHES each
 * historical `OrderItem` (variantId → null, migration
 * 20261025150000_nullable_catalog_variant_links) instead of deleting it, and
 * every rendered field is an FK-free snapshot — so a past order still renders
 * and totals correctly after the product row is gone. Delivered gift codes
 * survive the same way.
 * See src/lib/catalogPurge.ts for the full guard + delete order.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'products:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const actor = check.payload!;
  const { id } = await ctx.params;
  const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const result = await purgeProduct({ productId: id, actor: { sub: actor.sub, email: actor.email }, ipAddress });

  if (result.ok) {
    return NextResponse.json({ ok: true, name: result.name, counts: result.counts });
  }
  switch (result.error) {
    case 'NOT_FOUND':
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    case 'IN_FLIGHT_ORDER':
      return NextResponse.json(
        { error: 'IN_FLIGHT_ORDER', orderNumbers: result.orderNumbers },
        { status: 409 },
      );
    case 'ORPHANED_RESERVED_CODE':
      return NextResponse.json(
        { error: 'ORPHANED_RESERVED_CODE', count: result.count },
        { status: 409 },
      );
    default:
      // PURGE_FAILED carries the caught server message so the admin sees the
      // real cause in the toast instead of digging in server logs.
      return NextResponse.json(
        { error: 'PURGE_FAILED', detail: result.detail ?? 'unknown error' },
        { status: 500 },
      );
  }
}
