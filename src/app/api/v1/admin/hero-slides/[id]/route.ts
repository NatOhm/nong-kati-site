import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
}

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PUT /api/v1/admin/hero-slides/[id] — update a slide (settings:write).
 * Accepts partial bodies: imageUrl, label, href, alt, sortOrder, isActive.
 */

/**
 * Focal point for object-cover cropping, stored as "X% Y%".
 *
 * Strictly validated because it lands in a `style` attribute: anything that
 * is not a pair of percentages in 0–100 is rejected outright rather than
 * passed through. Returns null for "not supplied", and null in the DB means
 * centred, so every existing slide keeps rendering exactly as before.
 */
const FOCUS_RE = /^(\d{1,3})% (\d{1,3})%$/;
function parseFocus(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (!t) return null;
  const m = FOCUS_RE.exec(t);
  if (!m) return undefined;
  const x = Number(m[1]);
  const y = Number(m[2]);
  if (x > 100 || y > 100) return undefined;
  return `${x}% ${y}%`;
}
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
    imageUrl?: string | null;
    imageFocus?: string | null;
    label?: string | null;
    href?: string | null;
    alt?: string;
    sortOrder?: number;
    isActive?: boolean;
  } = {};
  // imageUrl/label: a slide may be an image banner, a text deal card, or
  // both (image + deal chip). Empty string clears the field.
  if ('imageUrl' in b) {
    const v = b['imageUrl'];
    data.imageUrl = typeof v === 'string' && v.trim() ? v.trim() : null;
  }
  if ('label' in b) {
    const v = b['label'];
    data.label = typeof v === 'string' && v.trim() ? v.trim() : null;
  }
  if ('href' in b)
    data.href = typeof b['href'] === 'string' && b['href'].trim() ? b['href'].trim() : null;
  if (typeof b['alt'] === 'string' && b['alt'].trim()) data.alt = b['alt'].trim();
  if (typeof b['sortOrder'] === 'number') data.sortOrder = b['sortOrder'];
  if (typeof b['isActive'] === 'boolean') data.isActive = b['isActive'];

  if ('imageFocus' in b) {
    const parsed = parseFocus(b['imageFocus']);
    if (parsed === undefined) {
      return NextResponse.json({ error: 'INVALID_IMAGE_FOCUS' }, { status: 400 });
    }
    data.imageFocus = parsed;
  }

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
