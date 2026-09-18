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
 * GET /api/v1/admin/categories - flat id/name list for editor dropdowns
 * (products:read). With ?view=tree, returns the full management tree with
 * product counts, sort order and active flags (categories:read).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'categories:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  if (req.nextUrl.searchParams.get('view') === 'tree') {
    const rows = await prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    const byId = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      byId.set(r.id, {
        id: r.id,
        name: r.name,
        slug: r.slug,
        icon: r.icon,
        parentId: r.parentId,
        sortOrder: r.sortOrder,
        isActive: r.isActive,
        productCount: r._count.products,
        children: [],
      });
    }
    const roots: Record<string, unknown>[] = [];
    for (const r of rows) {
      const node = byId.get(r.id)!;
      if (r.parentId && byId.has(r.parentId)) {
        const parent = byId.get(r.parentId)!;
        (parent['children'] as Record<string, unknown>[]).push(node);
      } else {
        roots.push(node);
      }
    }
    const sortNodes = (nodes: Record<string, unknown>[]) => {
      nodes.sort((a, b) => (a['sortOrder'] as number) - (b['sortOrder'] as number));
      for (const n of nodes) sortNodes(n['children'] as Record<string, unknown>[]);
    };
    sortNodes(roots);
    return NextResponse.json({ categories: roots });
  }

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { sortOrder: 'asc' },
  });
  return NextResponse.json({ categories });
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.length >= 2 ? base : `cat-${Date.now().toString(36)}`;
}

/**
 * POST /api/v1/admin/categories - create a category (categories:write).
 * Body: { name, slug?, parentId?, sortOrder? }. Parent must exist; slug is
 * derived from the name when omitted and must be unique.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'categories:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ error: 'INVALID_NAME' }, { status: 400 });
  }

  const slug =
    typeof body['slug'] === 'string' && body['slug'].trim() !== ''
      ? body['slug'].trim().toLowerCase()
      : slugify(name);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json({ error: 'INVALID_SLUG' }, { status: 400 });
  }

  const parentId =
    typeof body['parentId'] === 'string' && body['parentId'] !== '' ? body['parentId'] : null;
  if (parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) return NextResponse.json({ error: 'PARENT_NOT_FOUND' }, { status: 400 });
  }

  const sortOrder =
    typeof body['sortOrder'] === 'number' && Number.isFinite(body['sortOrder'])
      ? Math.round(body['sortOrder'])
      : 0;

  try {
    const created = await prisma.category.create({
      data: { name, slug, parentId, sortOrder, isActive: true },
    });
    return NextResponse.json({ category: { id: created.id, slug: created.slug } }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'SLUG_TAKEN' }, { status: 409 });
    }
    return NextResponse.json({ error: 'CREATE_FAILED' }, { status: 500 });
  }
}
