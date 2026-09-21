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
 * GET /api/v1/admin/hero-slides — all slides in edit order (settings:read).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const slides = await prisma.heroSlide.findMany({ orderBy: { sortOrder: 'asc' } });
  return NextResponse.json({ slides });
}

/**
 * POST /api/v1/admin/hero-slides — create a slide (settings:write).
 * Body: { imageUrl?, label?, href?, alt?, sortOrder?, isActive? }
 * Either an image (banner slide) or a label (text deal card) is required.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const imageUrl =
    typeof b['imageUrl'] === 'string' && b['imageUrl'].trim() ? b['imageUrl'].trim() : null;
  const label = typeof b['label'] === 'string' && b['label'].trim() ? b['label'].trim() : null;
  if (!imageUrl && !label) {
    return NextResponse.json({ error: 'IMAGE_OR_LABEL_REQUIRED' }, { status: 400 });
  }
  const alt =
    typeof b['alt'] === 'string' && b['alt'].trim()
      ? b['alt'].trim()
      : (label ?? 'แบนเนอร์โปรโมชั่น');

  const slide = await prisma.heroSlide.create({
    data: {
      imageUrl,
      label,
      href: typeof b['href'] === 'string' && b['href'].trim() ? b['href'].trim() : null,
      alt,
      sortOrder: typeof b['sortOrder'] === 'number' ? b['sortOrder'] : 0,
      isActive: b['isActive'] !== false,
    },
  });
  return NextResponse.json({ slide }, { status: 201 });
}
