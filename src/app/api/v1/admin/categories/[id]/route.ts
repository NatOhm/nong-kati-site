import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { purgeProductInTx, emptyPurgeCounts, type PurgeOutcome } from '@/lib/catalogPurge';
import { writeAuditLog } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
}

/**
 * PUT /api/v1/admin/categories/[id] - update name, slug, parent, sort order
 * or active flag (categories:write). Tree safety: the parent must exist and
 * a category can never become its own ancestor (cycle walk from the
 * proposed parent up to the root).
 */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'categories:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const { id } = await ctx.params;

  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const data: {
    name?: string;
    slug?: string;
    parentId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  } = {};

  if (body['name'] !== undefined) {
    const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
    if (name.length < 2 || name.length > 80) {
      return NextResponse.json({ error: 'INVALID_NAME' }, { status: 400 });
    }
    data.name = name;
  }

  if (body['slug'] !== undefined) {
    const slug = typeof body['slug'] === 'string' ? body['slug'].trim().toLowerCase() : '';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return NextResponse.json({ error: 'INVALID_SLUG' }, { status: 400 });
    }
    data.slug = slug;
  }

  if (body['parentId'] !== undefined) {
    const parentId =
      typeof body['parentId'] === 'string' && body['parentId'] !== '' ? body['parentId'] : null;
    if (parentId === id) {
      return NextResponse.json({ error: 'CYCLE' }, { status: 400 });
    }
    if (parentId) {
      const parent = await prisma.category.findUnique({ where: { id: parentId } });
      if (!parent) return NextResponse.json({ error: 'PARENT_NOT_FOUND' }, { status: 400 });
      let cursor = parentId;
      const seen = new Set<string>();
      while (cursor) {
        if (cursor === id) return NextResponse.json({ error: 'CYCLE' }, { status: 400 });
        if (seen.has(cursor)) break;
        seen.add(cursor);
        const row = await prisma.category.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
        cursor = row?.parentId ?? '';
      }
    }
    data.parentId = parentId;
  }

  if (body['sortOrder'] !== undefined) {
    const n = Number(body['sortOrder']);
    if (!Number.isFinite(n)) return NextResponse.json({ error: 'INVALID_SORT' }, { status: 400 });
    data.sortOrder = Math.round(n);
  }

  if (body['isActive'] !== undefined) {
    data.isActive = Boolean(body['isActive']);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'NO_CHANGES' }, { status: 400 });
  }

  try {
    const updated = await prisma.category.update({ where: { id }, data });
    return NextResponse.json({ category: { id: updated.id, slug: updated.slug } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'SLUG_TAKEN' }, { status: 409 });
    }
    return NextResponse.json({ error: 'UPDATE_FAILED' }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/admin/categories/[id] - delete a category (categories:write).
 * Default (no query): refuses when the category has child categories or
 * products, so admins re-home those explicitly instead of losing them.
 * ?cascade=true: deletes the whole subtree in ONE transaction - every product
 * under the category (recursively, via the guarded product purge so in-flight
 * orders still block it) and every child category, then the category itself.
 * Order history and money totals survive (OrderItem snapshots the catalog).
 */
/**
 * A guard refusal inside the cascade. THROWN, never returned: Prisma COMMITS
 * an interactive-tx callback that returns normally, so `return`-ing here would
 * keep every product purged before this one while the client is told
 * "refused" — silent, un-undoable partial deletion. Throwing rolls the whole
 * cascade back as one unit, which is what the doc comment above promises.
 */
class CascadeBlocked extends Error {
  readonly detail: Extract<PurgeOutcome, { ok: false }>;
  constructor(detail: Extract<PurgeOutcome, { ok: false }>) {
    super(detail.error);
    this.name = 'CascadeBlocked';
    this.detail = detail;
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'categories:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const actor = check.payload!;
  const { id } = await ctx.params;
  const cascade = new URL(req.url).searchParams.get('cascade') === 'true';
  const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const existing = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (!cascade) {
    const children = await prisma.category.count({ where: { parentId: id } });
    if (children > 0) {
      return NextResponse.json({ error: 'HAS_CHILDREN', children }, { status: 400 });
    }
    if (existing._count.products > 0) {
      return NextResponse.json(
        { error: 'HAS_PRODUCTS', products: existing._count.products },
        { status: 400 },
      );
    }
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  }

  // Cascade: collect the subtree of category ids (this category + descendants).
  const categoryIds: string[] = [];
  const collect = async (catId: string): Promise<void> => {
    categoryIds.push(catId);
    const kids = await prisma.category.findMany({
      where: { parentId: catId },
      select: { id: true },
    });
    for (const k of kids) await collect(k.id);
  };
  await collect(id);

  const products = await prisma.product.findMany({
    where: { categoryId: { in: categoryIds } },
    select: { id: true, name: true },
  });

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const counts = emptyPurgeCounts();
        for (const p of products) {
          const r = await purgeProductInTx(
            tx,
            p.id,
            { sub: actor.sub, email: actor.email },
            ipAddress,
            counts,
          );
          if (!r.ok) throw new CascadeBlocked(r);
        }
        await tx.category.deleteMany({ where: { id: { in: categoryIds } } });

        await writeAuditLog({
          actorType: 'admin',
          actorId: actor.sub,
          actorEmail: actor.email,
          action: 'catalog.category_cascade_purge',
          tableName: 'Category',
          recordId: id,
          diff: { before: { name: existing.name, slug: existing.slug }, after: null },
          ipAddress,
          metadata: {
            categoryId: id,
            categoryName: existing.name,
            categorySlug: existing.slug,
            categories: categoryIds.length,
            purgedProducts: products.length,
            ...counts,
          },
          tx,
        });

        return {
          deleted: true,
          categories: categoryIds.length,
          products: products.length,
          counts,
        };
      },
      { timeout: 60000 },
    );

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof CascadeBlocked) {
      const d = err.detail;
      if (d.error === 'IN_FLIGHT_ORDER') {
        return NextResponse.json(
          { error: 'IN_FLIGHT_ORDER', orderNumbers: d.orderNumbers },
          { status: 409 },
        );
      }
      if (d.error === 'ORPHANED_RESERVED_CODE') {
        return NextResponse.json({ error: 'ORPHANED_RESERVED_CODE', count: d.count }, { status: 409 });
      }
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    console.error('[categories] cascade purge failed', err);
    return NextResponse.json(
      { error: 'PURGE_FAILED', detail: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 },
    );
  }
}
