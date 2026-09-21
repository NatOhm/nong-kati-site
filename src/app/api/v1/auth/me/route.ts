import { NextRequest, NextResponse } from 'next/server';

import {
  getCustomerFromToken,
  getCustomerProfile,
  updateCustomerProfile,
} from '@/api/customerAuth';

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
  const phoneNumber =
    typeof body.phoneNumber === 'string' ? body.phoneNumber.trim().slice(0, 20) : undefined;
  const marketingOptIn = typeof body.marketingOptIn === 'boolean' ? body.marketingOptIn : undefined;

  if (fullName !== undefined && fullName.length === 0) {
    return NextResponse.json({ error: 'NAME_REQUIRED' }, { status: 400 });
  }
  if (phoneNumber !== undefined && phoneNumber.length > 0 && !/^0\d{8,9}$/.test(phoneNumber)) {
    return NextResponse.json({ error: 'INVALID_PHONE' }, { status: 400 });
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
