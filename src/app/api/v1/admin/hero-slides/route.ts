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

  const imageFocus = parseFocus(b['imageFocus']);
  if (imageFocus === undefined) {
    return NextResponse.json({ error: 'INVALID_IMAGE_FOCUS' }, { status: 400 });
  }

  const slide = await prisma.heroSlide.create({
    data: {
      imageUrl,
      imageFocus,
      label,
      href: typeof b['href'] === 'string' && b['href'].trim() ? b['href'].trim() : null,
      alt,
      sortOrder: typeof b['sortOrder'] === 'number' ? b['sortOrder'] : 0,
      isActive: b['isActive'] !== false,
    },
  });
  return NextResponse.json({ slide }, { status: 201 });
}
