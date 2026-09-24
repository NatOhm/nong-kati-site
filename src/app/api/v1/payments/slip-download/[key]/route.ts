import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { isValidSlipUploadToken } from '@/lib/slipSecurity';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * GET /api/v1/payments/slip-download/[key] — authorized slip serving.
 *
 * Payment slips are financial documents and must not be publicly readable
 * (the public /api/v1/images route refuses the `slip:` namespace). This
 * route serves them only to:
 *   - admins holding `orders:read` (Bearer token), or
 *   - the order's own upload-token holder (same capability as upload).
 *
 * Responses are no-store: an intercepted URL must not linger in caches.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await ctx.params;
  if (!/^[0-9a-f]{32}$/.test(key)) {
    return NextResponse.json({ error: 'INVALID_KEY' }, { status: 400 });
  }

  const row = await prisma.siteSetting.findUnique({ where: { key: `slip:${key}` } });
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // ── Authorization ────────────────────────────────────────
  const token = bearer(req);
  if (token) {
    const check = await checkPermission(token, 'orders:read');
    if (!check.allowed) {
      return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
    }
  } else {
    // No admin token: allow only the order's own upload capability
    // (checkout flow fetching its just-uploaded slip back).
    const uploadToken =
      req.nextUrl.searchParams.get('token') ?? req.headers.get('x-slip-token') ?? '';
    const linked = await prisma.order.findFirst({
      where: { slipImageUrl: { contains: key } },
      select: { id: true },
    });
    if (!linked || !isValidSlipUploadToken(linked.id, uploadToken)) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
  }

  const match = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(row.value);
  const mime = match?.[1];
  const base64 = match?.[2];
  if (!mime || !base64) return NextResponse.json({ error: 'CORRUPT' }, { status: 500 });

  const bytes = Buffer.from(base64, 'base64');
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
    },
  });
}
