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

/**
 * POST /api/v1/admin/products/publish — bulk publish/unpublish (products:write).
 * Body: { value: boolean } — true = publish all, false = unpublish (hide) all.
 * Returns the number of rows flipped so the UI can confirm precisely.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'products:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const value = (body as Record<string, unknown> | null)?.['value'];
  if (typeof value !== 'boolean') {
    return NextResponse.json({ error: 'INVALID_VALUE' }, { status: 400 });
  }

  const result = await prisma.product.updateMany({
    where: { isActive: !value },
    data: { isActive: value },
  });

  // Review: bulk catalogue visibility flip is audited (which products moved).
  const flipped = await prisma.product.findMany({
    where: { isActive: value },
    select: { id: true, sku: true },
  });
  writeAuditLog({
    actorType: 'admin',
    actorId: check.payload?.sub ?? 'unknown',
    actorEmail: check.payload?.email ?? '',
    action: value ? 'products_bulk_publish' : 'products_bulk_unpublish',
    tableName: 'Product',
    recordId: 'bulk',
    metadata: { changed: result.count, skus: flipped.map((p) => p.sku).slice(0, 100) },
  });

  return NextResponse.json({
    value,
    changed: result.count,
    activeTotal: await prisma.product.count({ where: { isActive: true } }),
  });
}
