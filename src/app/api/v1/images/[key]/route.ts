import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { IMAGE_KEY_RE, decodeDataUrl, mimeForKey, readImage } from '@/lib/imageStore';

// Images are immutable — cache them hard at the CDN edge.
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/images/[key] — serve an admin-uploaded image.
 *
 * Reads the filesystem first (`NK_MEDIA_DIR`, default `storage/media`), which
 * is where uploads land now. Only a miss falls back to the legacy
 * `SiteSetting` row `image:<key>` that held a base64 data URL — that keeps
 * every link written before `scripts/extract-images-to-files.mjs` ran working
 * without a migration deadline.
 *
 * Private namespaces (`slip:` payment evidence) are served only through
 * /api/v1/payments/slip-download/[key], which requires authorization (or the
 * order's own upload token) — the disk path is public images only, and the
 * database lookup below refuses slip keys.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await ctx.params;
  if (!IMAGE_KEY_RE.test(key)) {
    return NextResponse.json({ error: 'INVALID_KEY' }, { status: 400 });
  }

  const headers = (mime: string, length: number) => ({
    'Content-Type': mime,
    'Content-Length': String(length),
    'Cache-Control': 'public, max-age=31536000, immutable',
  });

  const onDisk = await readImage(key);
  if (onDisk) {
    const mime = mimeForKey(key);
    if (mime) return new NextResponse(new Uint8Array(onDisk), { headers: headers(mime, onDisk.length) });
    // A file with an unknown suffix is not something we publish; fall through
    // to the row (which still carries its own MIME) rather than guessing.
  }

  // Financial documents (payment slips) must not be publicly readable even
  // when the key is known.
  const slip = await prisma.siteSetting.findUnique({ where: { key: `slip:${key}` } });
  if (slip) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const row = await prisma.siteSetting.findUnique({ where: { key: `image:${key}` } });
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const decoded = decodeDataUrl(row.value);
  if (!decoded) return NextResponse.json({ error: 'CORRUPT' }, { status: 500 });

  return new NextResponse(new Uint8Array(decoded.bytes), {
    headers: headers(decoded.mime, decoded.bytes.length),
  });
}
