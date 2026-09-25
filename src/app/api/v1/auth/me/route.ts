import { NextRequest, NextResponse } from 'next/server';

import {
  getCustomerFromToken,
  getCustomerProfile,
  updateCustomerProfile,
} from '@/api/customerAuth';
import { normalizeThaiPhone } from '@/api/phoneOtp';
import { prisma } from '@/lib/db';

const COOKIE = 'nk_session';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ customer: null });

  const session = await getCustomerFromToken(token);
  if (!session) return NextResponse.json({ customer: null });

  const profile = await getCustomerProfile(session.id);
  return NextResponse.json({ customer: profile });
}

/**
 * PATCH /api/v1/auth/me — update the signed-in customer's profile
 * (fullName / phoneNumber / marketingOptIn). Server-authoritative:
 * the email and tier are NOT editable here.
 */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const session = await getCustomerFromToken(token);
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  let body: { fullName?: unknown; phoneNumber?: unknown; marketingOptIn?: unknown };
  try {
    // Review: req.json() accepts JSON null — validate the top-level value
    // before field access or the handler 500s on a malformed request.
    const parsed: unknown = await req.json();
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    }
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const fullName =
    typeof body.fullName === 'string' ? body.fullName.trim().slice(0, 120) : undefined;
  // Canonical phone identity (audit [Medium]): whatever format the customer
  // types (08x…, +668x…, spaced), the profile stores E.164 — the SAME value
  // OTP sign-in matches against. Empty string clears the number.
  const phoneRaw = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : undefined;
  const phoneNumber =
    phoneRaw === undefined ? undefined : phoneRaw === '' ? '' : normalizeThaiPhone(phoneRaw);
  const marketingOptIn = typeof body.marketingOptIn === 'boolean' ? body.marketingOptIn : undefined;

  if (fullName !== undefined && fullName.length === 0) {
    return NextResponse.json({ error: 'NAME_REQUIRED' }, { status: 400 });
  }
  if (phoneNumber === null) {
    return NextResponse.json({ error: 'INVALID_PHONE' }, { status: 400 });
  }
  if (phoneNumber && phoneNumber !== '') {
    // One number belongs to one customer — OTP sign-in resolves by this
    // value, so a clash would silently merge/steal identities.
    const clash = await prisma.customer.findFirst({
      where: { phoneNumber, id: { not: session.id } },
      select: { id: true },
    });
    if (clash) {
      return NextResponse.json({ error: 'PHONE_ALREADY_IN_USE' }, { status: 409 });
    }
  }

  const result = await updateCustomerProfile(session.id, {
    ...(fullName !== undefined && { fullName }),
    ...(phoneNumber !== undefined && { phoneNumber }),
    ...(marketingOptIn !== undefined && { marketingOptIn }),
  });
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? 'UPDATE_FAILED' }, { status: 400 });
  }

  const profile = await getCustomerProfile(session.id);
  return NextResponse.json({ success: true, customer: profile });
}
