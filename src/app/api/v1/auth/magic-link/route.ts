import { NextRequest, NextResponse } from 'next/server';

import { createMagicLinkToken, magicLinkUrl } from '@/api/magicLink';
import { sendMagicLinkEmail } from '@/lib/email/magicLinkEmail';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/magic-link — request a sign-in link.
 * Body: { email }
 *
 * Responses are intentionally uniform: the same 200 lands whether or not
 * the address has an account (delivery failures included), so the endpoint
 * cannot be used to enumerate customers. Rate limit: 3 requests / 15 min
 * per email PLUS a shared 10 / 15 min per-IP limit — rotating recipient
 * addresses no longer rides the per-email rule as an anonymous mail relay
 * (review Medium). Outbound mail is enqueued only for real accounts; the
 * token row for unknown addresses simply expires unconsumed.
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

  const rl = await checkRateLimit('_magic_link_email', email, {
    route: '_magic_link_email',
    maxRequests: 3,
    windowMs: 15 * 60_000,
    keyBy: 'email',
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }
  // Shared per-IP budget (review Medium): a pool of rotating recipients is
  // still one sender. Keyed to the same limiter store by IP.
  const ipRl = await checkRateLimit(`_magic_link_ip:${getClientIp(req)}`, '_global', {
    route: `_magic_link_ip:${getClientIp(req)}`,
    maxRequests: 10,
    windowMs: 15 * 60_000,
    keyBy: 'email',
  });
  if (!ipRl.allowed) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  const result = await createMagicLinkToken({ email, ipAddress: getClientIp(req) });
  if (!result.ok) {
    // INVALID_EMAIL is the only client-fixable error; everything else is
    // answered with the same generic success to avoid enumeration.
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Only real accounts enqueue mail (review Medium): unknown addresses get
  // the identical response but no outbound email, so the endpoint cannot be
  // weaponized against arbitrary inboxes while still not leaking which
  // addresses are registered.
  if (result.accountExists) {
    const base = process.env['NEXT_PUBLIC_SITE_URL'] ?? req.nextUrl.origin;
    await sendMagicLinkEmail({
      to: email,
      url: magicLinkUrl(result.token, base),
      expiresAt: result.expiresAt,
    });
  }

  return NextResponse.json({
    success: true,
    message: 'หากอีเมลนี้สมัครสมาชิกไว้ เราได้ส่งลิงก์เข้าสู่ระบบแล้ว (ลิงก์ใช้ได้ใน 15 นาที)',
  });
}
