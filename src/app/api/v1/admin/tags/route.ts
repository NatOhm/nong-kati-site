import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/** Thai-friendly slug: lowercase, trim, spaces → dashes, strip URL-unsafe chars. */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{Letter}\p{Number}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * GET /api/v1/admin/tags — all tags with product counts (products:read).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'products:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const tags = await prisma.tag.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true } } },
  });
  return NextResponse.json({
    tags: tags.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      productCount: t._count.products,
      createdAt: t.createdAt,
    })),
  });
}

/**
 * POST /api/v1/admin/tags — create a tag (products:write). Body { name }.
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
  const name =
    typeof (body as Record<string, unknown>)?.['name'] === 'string'
      ? ((body as Record<string, string>)['name'] as string).trim()
      : '';
  if (name === '') return NextResponse.json({ error: 'NAME_REQUIRED' }, { status: 400 });

  const slug = slugify(name) || `tag-${Date.now()}`;
  const clash = await prisma.tag.findFirst({ where: { OR: [{ name }, { slug }] } });
  if (clash) return NextResponse.json({ error: 'TAG_TAKEN' }, { status: 409 });

  const tag = await prisma.tag.create({ data: { name, slug } });
  return NextResponse.json(
    { id: tag.id, name: tag.name, slug: tag.slug, productCount: 0 },
    { status: 201 },
  );
}
