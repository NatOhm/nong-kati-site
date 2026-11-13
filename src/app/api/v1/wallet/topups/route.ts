import { NextRequest, NextResponse } from 'next/server';

import { getCustomerFromToken } from '@/api/customerAuth';
import { prisma } from '@/lib/db';
import { mintSlipStorageKey, slipImageRoute } from '@/lib/slipSecurity';
import { roundThb } from '@/lib/walletCredit';

export const dynamic = 'force-dynamic';

const COOKIE = 'nk_session';
const MAX_SLIP_BYTES = 5 * 1024 * 1024;
const MIN_TOPUP_THB = 20;
const MAX_TOPUP_THB = 100_000;
/** Guard against ledger spam from a stuck client — not a business limit. */
const MAX_PENDING_PER_CUSTOMER = 3;

/**
 * POST /api/v1/wallet/topups — ขอเติมเงินผ่านการโอนเข้าบัญชีร้าน.
 *
 * Client ask (2026-11-13): "ปรับเพิ่มเรื่องการเติมเงินผ่าน บช ด้วยได้มั้ย".
 * The customer transfers to the account shown on the wallet page and sends
 * the slip with the request. Nothing is credited here: the row starts
 * `pending` and an admin approves it in ประวัติเติมเงิน, which is what keeps a
 * forged request from minting credit. The slip image lives in the private
 * `slip:` namespace (same as order slips) and its route is stored as the
 * reference so the review screen can display it.
 *
 * Body: multipart { amountThb, slip?: File, note?: string }.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE)?.value;
  const session = token ? await getCustomerFromToken(token) : null;
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  let amountRaw = '';
  let note = '';
  let slipDataUrl: string | null = null;
  try {
    const form = await req.formData();
    amountRaw = String(form.get('amountThb') ?? '').trim();
    note = String(form.get('note') ?? '').trim();
    const file = form.get('slip');
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_SLIP_BYTES) {
        return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        return NextResponse.json({ error: 'UNSUPPORTED_TYPE' }, { status: 415 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      // Content sniffing — the declared MIME must match the bytes, exactly as
      // the order-slip upload requires.
      const png = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const jpg = buf[0] === 0xff && buf[1] === 0xd8;
      const webp =
        buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
        buf.subarray(8, 12).toString('latin1') === 'WEBP';
      const declaredPng = file.type === 'image/png';
      const declaredWebp = file.type === 'image/webp';
      if (!((declaredPng && png) || (!declaredPng && !declaredWebp && jpg) || (declaredWebp && webp))) {
        return NextResponse.json({ error: 'CONTENT_MISMATCH' }, { status: 400 });
      }
      slipDataUrl = `data:${file.type};base64,${buf.toString('base64')}`;
    }
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const amount = roundThb(Number(amountRaw));
  if (!Number.isFinite(amount) || amount < MIN_TOPUP_THB) {
    return NextResponse.json({ error: 'AMOUNT_TOO_SMALL' }, { status: 400 });
  }
  if (amount > MAX_TOPUP_THB) {
    return NextResponse.json({ error: 'AMOUNT_TOO_LARGE' }, { status: 400 });
  }

  const pending = await prisma.topUpLog.count({
    where: { customerId: session.id, status: 'pending' },
  });
  if (pending >= MAX_PENDING_PER_CUSTOMER) {
    return NextResponse.json({ error: 'TOO_MANY_PENDING' }, { status: 409 });
  }

  // Every request gets its own private key, so a re-upload never replaces
  // earlier evidence.
  let reference: string | null = null;
  if (slipDataUrl) {
    const key = mintSlipStorageKey();
    await prisma.siteSetting.create({ data: { key, value: slipDataUrl } });
    reference = slipImageRoute(key);
  }
  if (note) {
    // The reference column is the only free-text slot on the ledger row; keep
    // the slip route first so the admin screen can still detect it.
    reference = reference ? `${reference}|${note.slice(0, 120)}` : note.slice(0, 190);
  }

  const log = await prisma.topUpLog.create({
    data: {
      customerId: session.id,
      amountThb: amount,
      method: 'bank_transfer',
      reference,
      status: 'pending',
    },
    select: { id: true, amountThb: true, status: true, createdAt: true },
  });

  return NextResponse.json(
    {
      success: true,
      topup: {
        id: log.id,
        amountThb: Number(log.amountThb),
        status: log.status,
        hasSlip: Boolean(slipDataUrl),
        createdAt: log.createdAt.toISOString(),
      },
      message: 'ส่งคำขอเติมเงินแล้ว — แอดมินจะตรวจสอบและเพิ่มเครดิตให้ภายใน 2 ชั่วโมง',
    },
    { status: 201 },
  );
}
