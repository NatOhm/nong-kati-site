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
 * PATCH /api/v1/admin/tags/[id] — rename a tag (products:write). Body { name }.
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
  const name =
    typeof (body as Record<string, unknown>)?.['name'] === 'string'
      ? ((body as Record<string, string>)['name'] as string).trim()
      : '';
  if (name === '') return NextResponse.json({ error: 'NAME_REQUIRED' }, { status: 400 });

  const slug = slugify(name) || `tag-${Date.now()}`;
  const clash = await prisma.tag.findFirst({ where: { OR: [{ name }, { slug }], NOT: { id } } });
  if (clash) return NextResponse.json({ error: 'TAG_TAKEN' }, { status: 409 });

  try {
    const tag = await prisma.tag.update({ where: { id }, data: { name, slug } });
    return NextResponse.json({ id: tag.id, name: tag.name, slug: tag.slug });
  } catch {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
}

/**
 * DELETE /api/v1/admin/tags/[id] — delete a tag (products:write). Product
 * links cascade away; products themselves are untouched.
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
  const { id } = await ctx.params;

  try {
    await prisma.tag.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
}
