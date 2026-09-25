import { NextRequest, NextResponse } from 'next/server';

import { MIN_PASSWORD_LENGTH, resetPasswordWithToken } from '@/api/passwordReset';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/reset-password — consume a reset token and set the new
 * password. Body: { token, password }
 *
 * The token is single-use (atomic claim), 30-minute TTL and bound to one
 * account; a successful reset also bumps sessionsInvalidBefore so every
 * earlier customer JWT stops resolving. Per-IP limit: 10 / 15 min.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  const rl = await checkRateLimit('_reset_pw_ip', ip, {
    route: '_reset_pw_ip',
    maxRequests: 10,
    windowMs: 15 * 60_000,
    keyBy: 'ip',
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  let token = '';
  let password = '';
  try {
    const body = (await req.json()) as { token?: unknown; password?: unknown };
    token = String(body.token ?? '');
    password = String(body.password ?? '');
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  if (!token) {
    return NextResponse.json({ error: 'TOKEN_REQUIRED' }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: 'PASSWORD_TOO_SHORT', minLength: MIN_PASSWORD_LENGTH },
      { status: 400 },
    );
  }

  const result = await resetPasswordWithToken({
    rawToken: token,
    newPassword: password,
    ipAddress: ip,
  });

  if (!result.ok) {
    const status =
      result.error === 'TOKEN_EXPIRED'
        ? 410
        : result.error === 'TOKEN_USED'
          ? 409
          : result.error === 'ACCOUNT_BLOCKED'
            ? 403
            : 400; // INVALID_TOKEN
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    success: true,
    message: 'ตั้งรหัสผ่านใหม่สำเร็จ — เข้าสู่ระบบด้วยรหัสผ่านใหม่ได้เลย',
  });
}
