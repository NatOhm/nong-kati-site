import { NextRequest, NextResponse } from 'next/server';
import { registerCustomer, loginCustomer } from '@/api/customerAuth';
import { createMagicLinkToken, magicLinkUrl } from '@/api/magicLink';
import { sendMagicLinkEmail } from '@/lib/email/magicLinkEmail';

const COOKIE = 'nk_session';

/**
 * POST /api/v1/auth/register — create a customer account.
 *
 * No account enumeration (audit 2026-11-13): the route used to answer
 * `EMAIL_ALREADY_EXISTS` for a registered address, so anyone could test
 * addresses through the signup form one at a time. Both branches — new and
 * already registered — now return the same response and mail the same
 * sign-in link to the address. Only the mailbox owner can act on it, and the
 * browser learns nothing about whether the account existed.
 *
 * A new account whose mail cannot be delivered is signed in directly instead
 * (that address was created by this very request, so nothing leaks), which
 * keeps registration working during a mail outage.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const email = String(body['email'] ?? '')
      .trim()
      .toLowerCase();
    const password = String(body['password'] ?? '');
    const fullName = body['fullName'] ? String(body['fullName']) : undefined;
    const registerParams: Parameters<typeof registerCustomer>[0] = {
      email,
      password,
      marketingOptIn: Boolean(body['marketingOptIn']),
    };
    if (fullName !== undefined) registerParams.fullName = fullName;
    const result = await registerCustomer(registerParams);

    // Validation failures stay visible; "this address exists" must not.
    if (!result.success && result.error !== 'EMAIL_ALREADY_EXISTS') {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const link = await createMagicLinkToken({ email });
    if (link.ok) {
      const base = process.env['NEXT_PUBLIC_SITE_URL'] ?? req.nextUrl.origin;
      const delivery = await sendMagicLinkEmail({
        to: email,
        url: magicLinkUrl(link.token, base),
        expiresAt: link.expiresAt,
      });
      if (delivery.ok) {
        return NextResponse.json({ success: true, checkEmail: true });
      }
      console.error('[register] sign-in link delivery failed:', delivery.error);
      if (!result.success) {
        // Known address + broken mail: same honest 503 the magic-link route
        // answers, with the same documented exception to enumeration safety.
        return NextResponse.json(
          {
            error: 'EMAIL_DELIVERY_UNAVAILABLE',
            message: 'ระบบส่งอีเมลขัดข้องชั่วคราว — กรุณาลองอีกครั้งในภายหลัง',
          },
          { status: 503 },
        );
      }
    } else if (!result.success) {
      return NextResponse.json({ error: link.error }, { status: 400 });
    }

    // New account, no mail: sign in rather than strand the customer.
    const login = await loginCustomer({ email, password, rememberMe: true });
    const res = NextResponse.json({
      success: true,
      autoLogin: login.success,
      customerId: result.data?.customerId,
      email: result.data?.email,
    });
    if (login.success && login.data) {
      res.cookies.set(COOKIE, login.data.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: login.data.expiresIn,
        path: '/',
      });
    }
    return res;
  } catch {
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
