import { NextRequest, NextResponse } from 'next/server';

import { createPhoneOtp, normalizeThaiPhone } from '@/api/phoneOtp';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { isSmsConfigured, sendOtpSms } from '@/lib/sms/otpSms';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/phone-otp — request a sign-in code by SMS.
 * Body: { phone } (Thai mobile, any common format — normalized to E.164)
 *
 * Responses are uniform whether or not the number has an account (no
 * enumeration). Rate limit: 3 codes / 15 min per number (plus the global
 * IP limiter in middleware).
 */
/**
 * GET /api/v1/auth/phone-otp — availability probe for the login UI.
 * The phone section renders only when the SMS gateway is configured (or
 * dev mode is on) — same pattern as the social providers list.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ available: isSmsConfigured() });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSmsConfigured()) {
    return NextResponse.json({ error: 'SMS_UNAVAILABLE' }, { status: 503 });
  }

  let phoneRaw = '';
  try {
    const body = (await req.json()) as { phone?: unknown };
    phoneRaw = String(body.phone ?? '');
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const phone = normalizeThaiPhone(phoneRaw);
  if (!phone) {
    return NextResponse.json({ error: 'INVALID_PHONE' }, { status: 400 });
  }

  const rl = await checkRateLimit('_phone_otp_number', phone, {
    route: '_phone_otp_number',
    maxRequests: 3,
    windowMs: 15 * 60_000,
    keyBy: 'email',
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  const result = await createPhoneOtp({ phoneE164: phone, ipAddress: getClientIp(req) });
  if (!result.ok) {
    // Blocked accounts get the same "sent" answer as everyone else — no
    // enumeration; verification will simply refuse the session.
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  const sent = await sendOtpSms({ to: phone, code: result.code });
  if (!sent) {
    return NextResponse.json({ error: 'SMS_SEND_FAILED' }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    message: `ส่งรหัส 6 หลักไปที่เบอร์ ${phone.slice(0, 7)}**** แล้ว (ใช้ได้ 5 นาที)`,
  });
}
