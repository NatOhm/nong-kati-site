import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 512 * 1024; // 512 KB — plenty for a product card image
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * POST /api/v1/admin/upload — persist a product image and return its public
 * path (products:write). The image is stored in the database (SiteSetting
 * row `image:<hash>`) and served from GET /api/v1/images/[key], so it works
 * on any host — serverless or Node — with no filesystem writes.
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
  const dataUrl =
    typeof (body as Record<string, unknown>)?.['dataUrl'] === 'string'
      ? ((body as Record<string, unknown>)['dataUrl'] as string)
      : '';
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return NextResponse.json({ error: 'UNSUPPORTED_TYPE' }, { status: 400 });

  const mime = match[1] ?? '';
  const base64 = match[2] ?? '';
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) return NextResponse.json({ error: 'EMPTY_FILE' }, { status: 400 });
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: 'FILE_TOO_LARGE', maxBytes: MAX_BYTES }, { status: 413 });
  }

  // Content sniffing: magic bytes must match the declared MIME.
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const gif = bytes.subarray(0, 3).toString('latin1') === 'GIF';
  const webp =
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP';
  const sniffed =
    (mime === 'image/png' && png) ||
    (mime === 'image/jpeg' && jpg) ||
    (mime === 'image/gif' && gif) ||
    (mime === 'image/webp' && webp);
  if (!sniffed) return NextResponse.json({ error: 'CONTENT_MISMATCH' }, { status: 400 });

  const key = `image:${Date.now().toString(36)}-${bytes.length.toString(36)}-${ALLOWED_TYPES[mime]}`;

  await prisma.siteSetting.upsert({
    where: { key },
    update: { value: dataUrl, updatedBy: check.payload?.sub ?? null },
    create: { key, value: dataUrl, updatedBy: check.payload?.sub ?? null },
  });

  return NextResponse.json(
    { path: `/api/v1/images/${key.slice('image:'.length)}` },
    { status: 201 },
  );
}
