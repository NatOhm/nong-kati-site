import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

// Images are immutable — cache them hard at the CDN edge.
const KEY_RE = /^[0-9a-z-]+$/i;

/**
 * GET /api/v1/images/[key] — serve an admin-uploaded image from its
 * SiteSetting row. Public: image paths are unguessable (timestamp+size+type).
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await ctx.params;
  if (!KEY_RE.test(key)) {
    return NextResponse.json({ error: 'INVALID_KEY' }, { status: 400 });
  }

  const row = await prisma.siteSetting.findUnique({ where: { key: `image:${key}` } });
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const match = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(row.value);
  const mime = match?.[1];
  const base64 = match?.[2];
  if (!mime || !base64) return NextResponse.json({ error: 'CORRUPT' }, { status: 500 });

  const bytes = Buffer.from(base64, 'base64');
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
