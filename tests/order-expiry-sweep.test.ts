/**
 * Unpaid-order expiry sweep — storefront review finding #2 (2026-10-05).
 *
 * The claim under test: checkout creates a real `pending_payment` order
 * before the customer commits to a payment action, and NOTHING in the
 * repository ever expired them. `updateOrderStatus` permitted
 * `pending_payment → expired` but had no caller, and the inventory queue
 * documented in `src/lib/jobs/mockQueue.ts` ("Reservation sweep (5min),
 * expiry sweep (15min)") had zero registered handlers.
 *
 * The contracts this file pins:
 *  1. The sweep moves ONLY `pending_payment`, and only rows older than the
 *     payment window (default 30 min, 06-database
 *     `order_payment_timeout_minutes`).
 *  2. The `updateMany` re-asserts `status: 'pending_payment'` in its
 *     `where` — this is the CAS that makes a cron tick safe against a
 *     payment webhook landing at the same moment. If someone ever "cleans
 *     up" that predicate into a bare `id: { in }`, a paid order can be
 *     flipped to expired after the money arrived. That is the single most
 *     dangerous line in this feature, so it gets its own assertion.
 *  3. `expired` is a legal target in the real `VALID_TRANSITIONS` table
 *     (drift guard against `src/api/orders.ts`).
 *  4. NO stock or code side effects: `createOrder` only *validates* stock;
 *     the debit happens in the fulfilment transaction at payment
 *     confirmation. `releaseExpiredReservations` walks an in-memory mock
 *     store that is empty on a serverless cold start, so wiring it into a
 *     cron route would be theatre — this suite asserts it is not wired.
 *  5. The route is gated exactly like its sibling email-outbox drain:
 *     503 when NK_CRON_SECRET is unset, 401 on a bad token.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'expiry-test-secret-0123456789abcdef0123456789abcdef';

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    siteSetting: { findUnique: vi.fn(async () => null) },
    order: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    // Deliberately present so "the sweep touches no stock" can be asserted
    // by CALL, not by reading the source and hoping.
    productVariant: { update: vi.fn(), updateMany: vi.fn() },
    giftCode: { updateMany: vi.fn() },
    // verifyAdminJwt (the panel-triggered sweep path) reads the live admin row.
    adminUser: {
      findUnique: vi.fn(async () => ({
        role: 'super_admin',
        status: 'active',
        sessionsInvalidBefore: null,
        mustChangePassword: false,
      })),
    },
  };
  return { prismaMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

const SRC = join(process.cwd(), 'src');
const read = (p: string): string => readFileSync(join(SRC, p), 'utf8');

const NOW = new Date('2026-10-05T12:00:00.000Z');

// Typed accessors for the recorded prisma calls. The mocks are declared
// with zero-arg implementations (so they need no real Prisma), which makes
// vitest infer a zero-length argument tuple — hence the explicit casts.
interface OrderFindArgs {
  where: { status: string; createdAt?: { lt: Date } };
  take?: number;
}
interface OrderUpdateArgs {
  where: { id: { in: string[] }; status?: string };
  data: { status: string; expiredAt: Date };
}

const findArgs = (i = 0): OrderFindArgs =>
  (prismaMock.order.findMany.mock.calls as unknown as [OrderFindArgs][])[i]![0];
const updateArgs = (i = 0): OrderUpdateArgs =>
  (prismaMock.order.updateMany.mock.calls as unknown as [OrderUpdateArgs][])[i]![0];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['NK_CRON_SECRET'];
  prismaMock.siteSetting.findUnique.mockResolvedValue(null);
  prismaMock.order.findMany.mockResolvedValue([]);
  prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
});

describe('resolvePaymentTimeoutMinutes', () => {
  it('defaults to 30 minutes when no SiteSetting override exists', async () => {
    const { resolvePaymentTimeoutMinutes, DEFAULT_PAYMENT_TIMEOUT_MINUTES } = await import(
      '@/lib/orderExpiry'
    );
    expect(DEFAULT_PAYMENT_TIMEOUT_MINUTES).toBe(30);
    expect(await resolvePaymentTimeoutMinutes()).toBe(30);
  });

  it('honours the order_payment_timeout_minutes override', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: '45' } as never);
    const { resolvePaymentTimeoutMinutes, PAYMENT_TIMEOUT_SETTING_KEY } = await import(
      '@/lib/orderExpiry'
    );
    expect(await resolvePaymentTimeoutMinutes()).toBe(45);
    expect(prismaMock.siteSetting.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: PAYMENT_TIMEOUT_SETTING_KEY } }),
    );
    expect(PAYMENT_TIMEOUT_SETTING_KEY).toBe('order_payment_timeout_minutes');
  });

  it.each([
    ['zero', '0'],
    ['negative', '-5'],
    ['not a number', 'soon'],
    ['empty', ''],
  ])('falls back to the default for a %s setting', async (_label, value) => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value } as never);
    const { resolvePaymentTimeoutMinutes } = await import('@/lib/orderExpiry');
    expect(await resolvePaymentTimeoutMinutes()).toBe(30);
  });

  it('clamps an absurd setting instead of trusting it', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: '100000' } as never);
    const { resolvePaymentTimeoutMinutes } = await import('@/lib/orderExpiry');
    // 24h ceiling — a typo must not park every order for a week.
    expect(await resolvePaymentTimeoutMinutes()).toBe(1440);
  });

  it('survives a DB failure (a sweep that throws leaves orders unexpired)', async () => {
    prismaMock.siteSetting.findUnique.mockRejectedValue(new Error('ECONNREFUSED'));
    const { resolvePaymentTimeoutMinutes } = await import('@/lib/orderExpiry');
    await expect(resolvePaymentTimeoutMinutes()).resolves.toBe(30);
  });
});

describe('expireUnpaidOrders — scope', () => {
  it('only considers pending_payment rows older than the payment window', async () => {
    const { expireUnpaidOrders } = await import('@/lib/orderExpiry');
    await expireUnpaidOrders({ now: NOW, timeoutMinutes: 30 });

    expect(prismaMock.order.findMany).toHaveBeenCalledTimes(1);
    const where = findArgs().where;
    expect(where.status).toBe('pending_payment');
    // cutoff = now - 30min
    expect(where.createdAt!.lt.toISOString()).toBe('2026-10-05T11:30:00.000Z');
  });

  it('writes status=expired and stamps expiredAt (the column nothing wrote before)', async () => {
    prismaMock.order.findMany.mockResolvedValue([{ id: 'o1' }] as never);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    const { expireUnpaidOrders } = await import('@/lib/orderExpiry');
    const res = await expireUnpaidOrders({ now: NOW, timeoutMinutes: 30 });

    expect(res.expired).toBe(1);
    expect(updateArgs().data).toEqual({ status: 'expired', expiredAt: NOW });
  });

  it('is a no-op when nothing is stale', async () => {
    const { expireUnpaidOrders } = await import('@/lib/orderExpiry');
    const res = await expireUnpaidOrders({ now: NOW, timeoutMinutes: 30 });
    expect(res).toMatchObject({ scanned: 0, expired: 0, batches: 0, timeoutMinutes: 30 });
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('is idempotent — a second run finds nothing left to expire', async () => {
    prismaMock.order.findMany
      .mockResolvedValueOnce([{ id: 'o1' }, { id: 'o2' }] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.order.updateMany.mockResolvedValue({ count: 2 });
    const { expireUnpaidOrders } = await import('@/lib/orderExpiry');

    expect((await expireUnpaidOrders({ now: NOW, timeoutMinutes: 30 })).expired).toBe(2);
    expect((await expireUnpaidOrders({ now: NOW, timeoutMinutes: 30 })).expired).toBe(0);
  });
});

describe('expireUnpaidOrders — concurrency (the CAS that matters)', () => {
  it('re-asserts status=pending_payment in the updateMany where-clause', async () => {
    prismaMock.order.findMany.mockResolvedValue([{ id: 'o1' }] as never);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    const { expireUnpaidOrders } = await import('@/lib/orderExpiry');
    await expireUnpaidOrders({ now: NOW, timeoutMinutes: 30 });

    const where = updateArgs().where;
    expect(where.status).toBe('pending_payment');
    expect(where.id).toEqual({ in: ['o1'] });
  });

  it('reports a lost race instead of double-transitioning an order', async () => {
    // A webhook confirmed o1 between the SELECT and the UPDATE: the CAS
    // matches 0 rows, so `scanned` > `expired` and the order is untouched.
    prismaMock.order.findMany.mockResolvedValue([{ id: 'o1' }, { id: 'o2' }] as never);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    const { expireUnpaidOrders } = await import('@/lib/orderExpiry');

    const res = await expireUnpaidOrders({ now: NOW, timeoutMinutes: 30 });
    expect(res.scanned).toBe(2);
    expect(res.expired).toBe(1);
  });

  it('batches a backlog instead of one unbounded statement', async () => {
    const full = Array.from({ length: 2 }, (_, i) => ({ id: `o${i}` }));
    prismaMock.order.findMany
      .mockResolvedValueOnce(full as never)
      .mockResolvedValueOnce([{ id: 'o2' }] as never) // partial → loop ends
      .mockResolvedValue([]);
    prismaMock.order.updateMany.mockResolvedValue({ count: 2 });
    const { expireUnpaidOrders } = await import('@/lib/orderExpiry');

    const res = await expireUnpaidOrders({ now: NOW, timeoutMinutes: 30, batchSize: 2 });
    expect(res.batches).toBe(2);
    expect(res.expired).toBe(4);
    expect(findArgs().take).toBe(2);
  });
});

describe('expireUnpaidOrders — no inventory side effects', () => {
  it('never writes stock or gift-code rows', async () => {
    prismaMock.order.findMany.mockResolvedValue([{ id: 'o1' }] as never);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    const { expireUnpaidOrders } = await import('@/lib/orderExpiry');
    await expireUnpaidOrders({ now: NOW, timeoutMinutes: 30 });

    // Stock is debited in the fulfilment transaction at payment
    // confirmation (src/lib/fulfilment.ts), NOT at order creation — so an
    // expired unpaid order has nothing to release.
    expect(prismaMock.productVariant.update).not.toHaveBeenCalled();
    expect(prismaMock.productVariant.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.giftCode.updateMany).not.toHaveBeenCalled();
  });

  it('does not import the in-memory reservation sweep', () => {
    // Comments are stripped first: the module header NAMES
    // releaseExpiredReservations to explain why it is not called, and that
    // explanation must not read as a wiring of it.
    const code = read('lib/orderExpiry.ts').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/delivery\/reservation/);
    expect(code).not.toMatch(/releaseExpiredReservations/);
    expect(code).not.toMatch(/mockQueue/);
  });

  it('the reservation sweep it declines to call really is mock-only', () => {
    // Guard against the premise rotting: if reservation.ts ever moves to a
    // DB-backed store, this assertion fails and the "no stock side effects"
    // reasoning above has to be revisited.
    const src = read('lib/delivery/reservation.ts');
    expect(src).toMatch(/mockCodeStore/);
    expect(src).toMatch(/In production, this queries the order table/);
  });
});

describe('drift guard — expired is a legal transition', () => {
  it('pending_payment → expired is still allowed by VALID_TRANSITIONS', () => {
    const src = read('api/orders.ts');
    const block = src.slice(src.indexOf('const VALID_TRANSITIONS'));
    const pending = block.slice(
      block.indexOf('pending_payment:'),
      block.indexOf('payment_confirmed: ['),
    );
    expect(pending).toMatch(/'expired'/);
  });

  it('the sweep targets exactly that status', async () => {
    const { expireUnpaidOrders } = await import('@/lib/orderExpiry');
    await expireUnpaidOrders({ now: NOW, timeoutMinutes: 30 });
    expect(findArgs().where.status).toBe('pending_payment');
  });
});

describe('POST /api/v1/internal/orders/expire — gating', () => {
  const sweepPath = '../src/app/api/v1/internal/orders/expire/route';
  const call = async (req: NextRequest): Promise<Response> => {
    const route = (await import(sweepPath)) as Record<string, unknown>;
    return (route['POST'] as (r: NextRequest) => Promise<Response>)(req);
  };
  const post = (url: string, headers: Record<string, string> = {}): NextRequest =>
    new NextRequest(url, { method: 'POST', headers });

  it('503 SWEEP_DISABLED when NK_CRON_SECRET is unset (fail-closed)', async () => {
    const res = await call(post('http://localhost/api/v1/internal/orders/expire'));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe('SWEEP_DISABLED');
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('401 with a wrong token — no order is expired', async () => {
    process.env['NK_CRON_SECRET'] = 'cron-secret-value';
    const res = await call(
      post('http://localhost/api/v1/internal/orders/expire', { 'x-cron-token': 'nope' }),
    );
    expect(res.status).toBe(401);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('200 with the correct cron secret and per-run counters', async () => {
    process.env['NK_CRON_SECRET'] = 'cron-secret-value';
    prismaMock.order.findMany.mockResolvedValue([{ id: 'o1' }] as never);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });

    const res = await call(
      post('http://localhost/api/v1/internal/orders/expire', {
        'x-cron-token': 'cron-secret-value',
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      expired: number;
      timeoutMinutes: number;
    };
    expect(body.ok).toBe(true);
    expect(body.expired).toBe(1);
    expect(body.timeoutMinutes).toBe(30);
  });

  it('accepts a valid admin JWT as Bearer (panel-triggered sweep)', async () => {
    process.env['NK_CRON_SECRET'] = 'cron-secret-value';
    const { issueAdminJwt } = await import('@/lib/jwt');
    const token = await issueAdminJwt('admin-super', 'super@test.local', 'super_admin', [
      'orders:write',
    ]);
    const res = await call(
      post('http://localhost/api/v1/internal/orders/expire', {
        authorization: `Bearer ${token}`,
      }),
    );
    expect(res.status).toBe(200);
  });

  it('clamps the ?batch parameter', async () => {
    process.env['NK_CRON_SECRET'] = 'cron-secret-value';
    await call(
      post('http://localhost/api/v1/internal/orders/expire?batch=99999', {
        'x-cron-token': 'cron-secret-value',
      }),
    );
    expect(findArgs().take).toBe(500);
  });
});