import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { imageDimensions, isWithinImageLimits, isWithinImageSize, MAX_IMAGE_BYTES } from '@/lib/imageValidation';
import { pruneOrphanImageRows } from '@/lib/imageCleanup';
import { writeImage } from '@/lib/imageStore';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_DIMENSION = 8192;

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
}

/**
 * POST /api/v1/admin/upload — persist a product image and return its public
 * path (products:write).
 *
 * The bytes go to the filesystem (`NK_MEDIA_DIR`, default `storage/media`) and
 * are served by GET /api/v1/images/[key]. A host without a writable disk falls
 * back to the old behaviour — a `SiteSetting` row `image:<key>` holding the
 * data URL — so the endpoint keeps working on serverless too.
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
  const filename = typeof (body as Record<string, unknown>)?.['filename'] === 'string'
    ? String((body as Record<string, unknown>)['filename'])
    : '';
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return NextResponse.json({ error: 'UNSUPPORTED_TYPE', message: 'รองรับไฟล์ PNG, JPG, WebP และ GIF เท่านั้น' }, { status: 400 });

  const mime = match[1] ?? '';
  const extension = filename.toLowerCase().split('.').pop() ?? '';
  const allowedExtensions = mime === 'image/jpeg' ? ['jpg', 'jpeg'] : [ALLOWED_TYPES[mime]];
  if (!filename || !allowedExtensions.includes(extension)) {
    return NextResponse.json({ error: 'EXTENSION_MISMATCH', message: 'นามสกุลไฟล์ไม่ตรงกับชนิดรูปภาพ' }, { status: 400 });
  }
  const base64 = match[2] ?? '';
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) return NextResponse.json({ error: 'EMPTY_FILE', message: 'ไฟล์รูปภาพว่างเปล่า' }, { status: 400 });
  if (!isWithinImageSize(bytes.length)) {
    return NextResponse.json({ error: 'FILE_TOO_LARGE', message: 'รูปภาพต้องมีขนาดไม่เกิน 5 MB', maxBytes: MAX_IMAGE_BYTES }, { status: 413 });
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
  if (!sniffed) return NextResponse.json({ error: 'CONTENT_MISMATCH', message: 'เนื้อหาไฟล์ไม่ใช่รูปภาพชนิดที่แจ้งไว้' }, { status: 400 });
  const dimensions = imageDimensions(bytes, mime);
  if (!dimensions) {
    return NextResponse.json({ error: 'INVALID_IMAGE_DIMENSIONS', message: 'อ่านขนาดรูปภาพไม่ได้ กรุณาเลือกไฟล์รูปภาพอื่น' }, { status: 400 });
  }
  if (!isWithinImageLimits(dimensions)) {
    return NextResponse.json({ error: 'IMAGE_DIMENSIONS_TOO_LARGE', message: 'รูปภาพมีขนาดพิกเซลใหญ่เกินกำหนด กรุณาย่อรูปก่อนอัปโหลด', maxDimension: MAX_DIMENSION }, { status: 400 });
  }

  const storageKey = `${Date.now().toString(36)}-${bytes.length.toString(36)}-${ALLOWED_TYPES[mime]}`;

  let storedOnDisk = true;
  try {
    await writeImage(storageKey, bytes);
  } catch {
    // Read-only or missing media directory (serverless, locked-down host):
    // keep the previous database-backed behaviour rather than failing an upload.
    storedOnDisk = false;
    await prisma.siteSetting.upsert({
      where: { key: `image:${storageKey}` },
      update: { value: dataUrl, updatedBy: check.payload?.sub ?? null },
      create: { key: `image:${storageKey}`, value: dataUrl, updatedBy: check.payload?.sub ?? null },
    });
  }

  // Replacing a product photo used to leave its old row behind forever; sweep
  // unreferenced rows while an admin is already waiting on this upload. Never
  // fail the upload over it — the new image is stored and useful either way.
  await pruneOrphanImageRows(prisma).catch(() => undefined);

  return NextResponse.json(
    { path: `/api/v1/images/${storageKey}`, storage: storedOnDisk ? 'file' : 'database' },
    { status: 201 },
  );
}
