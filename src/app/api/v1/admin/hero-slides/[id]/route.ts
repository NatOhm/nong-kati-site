import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PUT /api/v1/admin/hero-slides/[id] — update a slide (settings:write).
 * Accepts partial bodies: imageUrl, href, alt, sortOrder, isActive.
 */
export async function PUT(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const data: {
    imageUrl?: string;
    href?: string | null;
    alt?: string;
    sortOrder?: number;
    isActive?: boolean;
  } = {};
  if (typeof b['imageUrl'] === 'string' && b['imageUrl'].trim())
    data.imageUrl = b['imageUrl'].trim();
  if ('href' in b)
    data.href = typeof b['href'] === 'string' && b['href'].trim() ? b['href'].trim() : null;
  if (typeof b['alt'] === 'string' && b['alt'].trim()) data.alt = b['alt'].trim();
  if (typeof b['sortOrder'] === 'number') data.sortOrder = b['sortOrder'];
  if (typeof b['isActive'] === 'boolean') data.isActive = b['isActive'];

  try {
    const slide = await prisma.heroSlide.update({ where: { id }, data });
    return NextResponse.json({ slide });
  } catch {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
}

/**
 * DELETE /api/v1/admin/hero-slides/[id] — remove a slide (settings:write).
 */
export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const { id } = await params;
  try {
    await prisma.heroSlide.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
}
