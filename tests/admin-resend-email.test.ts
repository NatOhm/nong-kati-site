/**
 * POST /api/v1/admin/orders/[id]/resend-email — the error contract.
 *
 * The route used to answer a provider outage with `result.error` verbatim as
 * the API `error` field. That string is a TRANSPORT message from
 * lib/email/resend.ts — `EMAIL_NOT_CONFIGURED: …`, `EMAIL_PROVIDER_ERROR:
 * Resend 422 …` — not one of this API's codes. The order modal branches on
 * `msg.includes('EMAIL_SEND_FAILED')`, which therefore never matched, so the
 * message someone wrote specifically for "the provider may have a problem"
 * was unreachable and every outage showed the generic "please try again".
 *
 * Nothing failed loudly, which is why it survived: the route still returned
 * 502 and still refused to claim a send that never happened. Only the
 * specificity of the operator-facing message was lost, and only in the exact
 * situation it was written for.
 *
 * Permission checking is exercised for real rather than stubbed to "allowed":
 * real signed tokens go through the real checkPermission. Only prisma itself
 * is faked — verifyAdminJwt reads the live admin_users row on every call, and
 * that check is the reason a demotion kills a live token, so mocking it away
 * would remove the part worth covering. The order lookup and the send are
 * faked too; nothing here touches the network or a real database.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'resendtest-secret-0123456789abcdef0123456789abcde';

const { prismaMock, ordersMock, sendMock } = vi.hoisted(() => {
  const prismaMock = { adminUser: { findUnique: vi.fn() } };
  const ordersMock = { getOrderById: vi.fn() };
  const sendMock = vi.fn<() => Promise<{ success: boolean; error?: string }>>(async () => ({
    success: true,
  }));
  return { prismaMock, ordersMock, sendMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

vi.mock('@/api/orders', () => ordersMock);
vi.mock('@/api/orderLookup', () => ({ sendOrderConfirmationEmail: sendMock }));

import { issueAdminJwt } from '@/lib/jwt';
import { ROLE_PERMISSIONS, type AdminRole } from '@/types/auth';

const ORDER = {
  id: 'ord-resend-1',
  orderNumber: 'NK-2026-RSND1',
  customerEmail: 'buyer@example.test',
  confirmationUuid: 'uuid-1',
  subtotalThb: '100.00',
  vatAmountThb: '7.00',
  totalAmountThb: '107.00',
  items: [],
};

const tokenFor = (role: AdminRole): Promise<string> =>
  issueAdminJwt(`admin-${role}`, `${role}@test.local`, role, [...ROLE_PERMISSIONS[role]]);

function request(token?: string): NextRequest {
  return new NextRequest('http://localhost/api/v1/admin/orders/ord-resend-1/resend-email', {
    method: 'POST',
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  });
}

async function call(mod: Record<string, unknown>, token?: string): Promise<Response> {
  const POST = mod['POST'] as (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;
  return POST(request(token), { params: Promise.resolve({ id: 'ord-resend-1' }) });
}

let route: Record<string, unknown>;

beforeAll(async () => {
  // Variable specifier — a literal '.ts' path in an import() trips TS5097
  // under this tsconfig.
  const routePath = '../src/app/api/v1/admin/orders/[id]/resend-email/route.ts';
  route = (await import(routePath)) as Record<string, unknown>;
});

beforeEach(() => {
  vi.clearAllMocks();
  // One active admin row per role, keyed by the `admin-<role>` subject the
  // tokens are issued for — an active row whose role matches the token, which
  // is exactly what a real super_admin looks like to verifyAdminJwt.
  prismaMock.adminUser.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => {
      const m = /^admin-(.+)$/.exec(where.id);
      if (!m) return null;
      return {
        role: m[1],
        status: 'active',
        sessionsInvalidBefore: null,
        mustChangePassword: false,
      };
    },
  );
  ordersMock.getOrderById.mockResolvedValue({ ...ORDER });
  sendMock.mockResolvedValue({ success: true });
});

describe('POST /api/v1/admin/orders/[id]/resend-email', () => {
  it('no token → exactly 401, nothing loaded or sent', async () => {
    const res = await call(route);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error?: string }).error).toBe('UNAUTHENTICATED');
    expect(ordersMock.getOrderById).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('a role without orders:write → exactly 403, nothing sent', async () => {
    const res = await call(route, await tokenFor('catalogue_manager'));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error?: string }).error).toBe('INSUFFICIENT_PERMISSIONS');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('unknown order → 404 ORDER_NOT_FOUND, nothing sent', async () => {
    ordersMock.getOrderById.mockResolvedValue(null);

    const res = await call(route, await tokenFor('super_admin'));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error?: string }).error).toBe('ORDER_NOT_FOUND');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('a delivered send answers 200 and names the ORDER’S OWN address', async () => {
    const res = await call(route, await tokenFor('super_admin'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { orderId: string; orderNumber: string; sentTo: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.sentTo).toBe(ORDER.customerEmail);
    expect(body.data.orderNumber).toBe(ORDER.orderNumber);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('a provider outage → 502 EMAIL_SEND_FAILED, with the transport text in detail', async () => {
    sendMock.mockResolvedValue({
      success: false,
      error: 'EMAIL_PROVIDER_ERROR: Resend 422 The from address is not verified.',
    });

    const res = await call(route, await tokenFor('super_admin'));
    expect(res.status).toBe(502);

    const body = (await res.json()) as { error?: string; detail?: string };
    // The regression: this is the code the order modal matches on.
    expect(body.error).toBe('EMAIL_SEND_FAILED');
    // …and the provider's own words are not lost, just moved out of `error`.
    expect(body.detail).toContain('EMAIL_PROVIDER_ERROR');
    expect(body.detail).toContain('not verified');
  });

  it('an unconfigured provider is still EMAIL_SEND_FAILED, not the env-var string', async () => {
    sendMock.mockResolvedValue({
      success: false,
      error: 'EMAIL_NOT_CONFIGURED: NK_RESEND_API_KEY is not set',
    });

    const res = await call(route, await tokenFor('super_admin'));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error?: string }).error).toBe('EMAIL_SEND_FAILED');
  });

  it('`error` stays the route code even when the provider text contains one', async () => {
    // The reason the raw string was wrong: clients branch on `includes(...)`,
    // so any code word inside a provider message could steer the UI into
    // another error's copy — here, blaming the admin's permissions for an
    // outage that has nothing to do with them.
    sendMock.mockResolvedValue({
      success: false,
      error: 'EMAIL_PROVIDER_ERROR: Resend 403 FORBIDDEN for this sending domain',
    });

    const res = await call(route, await tokenFor('super_admin'));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error?: string; detail?: string };
    expect(body.error).toBe('EMAIL_SEND_FAILED');
    expect(body.error).not.toContain('FORBIDDEN');
    expect(body.detail).toContain('FORBIDDEN');
  });

  it('an over-long provider message is truncated rather than echoed whole', async () => {
    sendMock.mockResolvedValue({ success: false, error: 'E'.repeat(5_000) });

    const res = await call(route, await tokenFor('super_admin'));
    const body = (await res.json()) as { detail?: string };
    expect((body.detail ?? '').length).toBe(300);
  });
});
