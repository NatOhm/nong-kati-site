/**
 * GET /api/v1/admin/inventory/variants/:variantId/codes — list a variant's
 * stored accounts, MASKED.
 *
 * This is the list the inventory UI needs to answer "did my paste land?".
 * It decrypts server-side only to derive a mask (maskCode), so the response
 * carries enough to recognise an account without handing out credentials to
 * every staff member who can read inventory.
 *
 * Revealing a full account stays a separate, separately-gated action
 * (`GET .../codes/:id/reveal`, `inventory:reveal`, super_admin only) that is
 * audited per call. Reading the list is deliberately NOT audited per row —
 * the audit that matters is on the reveal.
 *
 * Gated on `inventory:read`, the same permission as the inventory overview.
 */
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { decryptCode, maskCode } from '@/lib/crypto/giftCode';

export const dynamic = 'force-dynamic';

const MAX_LIMIT = 100;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ variantId: string }> },
): Promise<NextResponse> {
  const token = getAdminToken(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const check = await checkPermission(token, 'inventory:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const { variantId } = await ctx.params;

  const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '25');
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(1, Math.floor(limitParam)), MAX_LIMIT)
    : 25;
  const offset = Math.max(
    0,
    Number.parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10) || 0,
  );
  const statusParam = req.nextUrl.searchParams.get('status');
  const statusFilter =
    statusParam === 'available' || statusParam === 'voided' || statusParam === 'delivered'
      ? statusParam
      : null;

  const where = {
    variantId,
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const [total, rows, variant] = await Promise.all([
    prisma.giftCode.count({ where }),
    prisma.giftCode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: { order: { select: { orderNumber: true } } },
    }),
    prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true, label: true, stock: true, product: { select: { name: true } } },
    }),
  ]);

  if (!variant) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const codes = rows.map((r) => {
    let masked: string;
    try {
      masked = maskCode(decryptCode(r.codeEncrypted, r.nonce, r.keyVersion));
    } catch {
      // One unreadable row (e.g. written by a newer key version) must not
      // blank the whole list — say so on that row and move on.
      masked = '(อ่านไม่ได้)';
    }
    return {
      id: r.id,
      masked,
      status: r.status,
      voidReason: r.voidReason,
      voidedAt: r.voidedAt?.toISOString() ?? null,
      orderNumber: r.order?.orderNumber ?? null,
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return NextResponse.json({
    variantId: variant.id,
    variantLabel: variant.label,
    productName: variant.product.name,
    stock: variant.stock,
    total,
    offset,
    limit,
    codes,
  });
}