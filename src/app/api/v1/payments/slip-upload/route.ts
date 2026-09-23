import { NextRequest, NextResponse } from 'next/server';

import { getOrderById } from '@/api/orders';
import { prisma } from '@/lib/db';
import { getClientIp, checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const KEY_RE = /^[0-9a-z-]+$/i;

/**
 * POST /api/v1/payments/slip-upload — ส่งสลิปให้แอดมินตรวจ (manual check).
 * Customer uploads the transfer slip for an order; the image is stored in the
 * existing SiteSetting image store and linked to the order for the admin.
 * Works whether or not SlipOK auto-verification is configured — the admin
 * still confirms with ยืนยันการชำระเงิน (unchanged), this just gives them
 * the actual slip to look at instead of asking the customer in chat.
 *
 * Body: multipart { orderId, slip: File } (same shape as slip-verify).
 * Rate limit: 10 / 10 min per IP.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  const rl = checkRateLimit('_slip_upload_ip', ip, {
    route: '_slip_upload_ip',
    maxRequests: 10,
    windowMs: 10 * 60_000,
    keyBy: 'ip',
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  let orderId = '';
  let dataUrl = '';
  try {
    const form = await req.formData();
    orderId = String(form.get('orderId') ?? '');
    const file = form.get('slip');
    if (file instanceof File) {
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        return NextResponse.json({ error: 'UNSUPPORTED_TYPE' }, { status: 415 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      dataUrl = `data:${file.type};base64,${buf.toString('base64')}`;
    }
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  if (!orderId || !dataUrl) {
    return NextResponse.json({ error: 'ORDER_AND_SLIP_REQUIRED' }, { status: 400 });
  }

  const order = await getOrderById(orderId);
  if (!order) return NextResponse.json({ error: 'ORDER_NOT_FOUND' }, { status: 404 });
  if (order.status !== 'pending_payment') {
    return NextResponse.json({ error: 'ORDER_NOT_PAYABLE' }, { status: 409 });
  }

  // Content sniffing — magic bytes must match the declared MIME (same rules
  // as /admin/upload).
  const bytes = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const webp = bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP';
  const declaredPng = dataUrl.startsWith('data:image/png');
  const declaredWebp = dataUrl.startsWith('data:image/webp');
  if (!((declaredPng && png) || (!declaredPng && !declaredWebp && jpg) || (declaredWebp && webp))) {
    return NextResponse.json({ error: 'CONTENT_MISMATCH' }, { status: 400 });
  }

  // Store in the same image table admin uploads use (immutable, unguessable key).
  const key = `image:${Date.now().toString(36)}-${bytes.length.toString(36)}-png`;
  await prisma.siteSetting.upsert({
    where: { key },
    update: { value: dataUrl },
    create: { key, value: dataUrl },
  });
  const imagePath = `/api/v1/images/${key.slice('image:'.length)}`;
  if (!KEY_RE.test(key.slice('image:'.length))) {
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { slipImageUrl: imagePath, slipUploadedAt: new Date() },
  });

  return NextResponse.json({
    status: 'slip_received',
    slipImageUrl: imagePath,
    message: 'ได้รับสลิปแล้ว — แอดมินจะตรวจและยืนยันให้เร็วที่สุด',
  });
}
