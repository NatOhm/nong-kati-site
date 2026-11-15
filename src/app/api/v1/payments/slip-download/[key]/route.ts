import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { isValidSlipUploadToken } from '@/lib/slipSecurity';
import { readSlip, sniffSlipMime } from '@/lib/slipStore';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
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
 *
 * Bytes come from the private file store first (`NK_SLIP_DIR`, a subdirectory
 * of the media root the public image route never reads) and fall back to a
 * legacy `slip:` settings row, so evidence uploaded either side of the move is
 * served identically.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await ctx.params;
  if (!/^[0-9a-f]{32}$/.test(key)) {
    return NextResponse.json({ error: 'INVALID_KEY' }, { status: 400 });
  }

  const onDisk = await readSlip(key);
  const row = onDisk ? null : await prisma.siteSetting.findUnique({ where: { key: `slip:${key}` } });
  if (!onDisk && !row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

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

  let bytes: Buffer;
  let mime: string;
  if (onDisk) {
    bytes = onDisk;
    mime = sniffSlipMime(onDisk);
  } else {
    const match = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(row?.value ?? '');
    const legacyMime = match?.[1];
    const base64 = match?.[2];
    if (!legacyMime || !base64) return NextResponse.json({ error: 'CORRUPT' }, { status: 500 });
    mime = legacyMime;
    bytes = Buffer.from(base64, 'base64');
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
    },
  });
}
