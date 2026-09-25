import { NextRequest, NextResponse } from 'next/server';

import { createPasswordResetToken, passwordResetUrl } from '@/api/passwordReset';
import { sendPasswordResetEmail } from '@/lib/email/passwordResetEmail';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/forgot-password — request a reset link.
 * Body: { email }
 *
 * Responses are intentionally uniform: the same 200 lands whether or not
 * the address has an account (or one with a password at all — OAuth-only
 * accounts are skipped silently), so the endpoint cannot enumerate
 * customers or become a free mail relay. Rate limit: 3 requests / 15 min
 * per email PLUS a shared 10 / 15 min per-IP budget (same shape as the
 * magic link route).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let email = '';
  try {
    const body = (await req.json()) as { email?: unknown };
    email = String(body.email ?? '')
      .trim()
      .toLowerCase();
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const rl = await checkRateLimit('_forgot_pw_email', email, {
    route: '_forgot_pw_email',
    maxRequests: 3,
    windowMs: 15 * 60_000,
    keyBy: 'email',
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }
  const ip = getClientIp(req);
  const ipRl = await checkRateLimit(`_forgot_pw_ip:${ip}`, '_global', {
    route: `_forgot_pw_ip:${ip}`,
    maxRequests: 10,
    windowMs: 15 * 60_000,
    keyBy: 'email',
  });
  if (!ipRl.allowed) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  const result = await createPasswordResetToken({ email, ipAddress: ip });
  if (!result.ok) {
    // INVALID_EMAIL is the only client-fixable error.
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (result.accountExists) {
    const base = process.env['NEXT_PUBLIC_SITE_URL'] ?? req.nextUrl.origin;
    await sendPasswordResetEmail({
      to: email,
      url: passwordResetUrl(result.token, base),
      expiresAt: result.expiresAt,
    });
  }

  return NextResponse.json({
    success: true,
    message:
      'หากอีเมลนี้มีบัญชีรหัสผ่าน เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว (ลิงก์ใช้ได้ใน 30 นาที)',
  });
}
