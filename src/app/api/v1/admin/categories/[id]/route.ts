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
 * DELETE /api/v1/admin/categories/[id] - delete an empty leaf category
 * (categories:write). Refuses when the category has child categories or
 * products, so admins re-home those explicitly instead of losing them.
 */
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
  const { id } = await ctx.params;

  const existing = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

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
