/**
 * `orphans` on GET /api/v1/admin/inventory — the only screen where a GiftCode
 * detached from its product is visible.
 *
 * Production held 13 `available` codes with `variantId: null` (2026-11-17):
 * they counted as sellable stock, appeared in no product row, and could not be
 * retired (the void endpoint refused them). The inventory list is what surfaces
 * them, so a silent regression here makes them invisible again — which is
 * exactly how they survived unnoticed in the first place.
 *
 * Contracts pinned:
 *  - TWO counts, not one: every detached code (`total`, the honesty line) and
 *    the still-`available` ones (`available`, the actionable set);
 *  - the list is the AVAILABLE ones only, ordered oldest-first, capped at 200;
 *  - `available` comes from `count()`, never from `codes.length`, so the 200-row
 *    cap cannot understate how many exist;
 *  - rows are MASKED, never plaintext, and carry only id/masked/createdAt;
 *  - one unreadable row reports `(อ่านไม่ได้)` instead of blanking the section.
 *
 * The 401 for an anonymous request is deliberately NOT retested here:
 * `tests/admin-authz-matrix.test.ts` already covers `GET /inventory` for every
 * missing/invalid credential shape, and a second copy would only drift.
 *
 * Prisma is mocked: this is the route contract, not a database test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'inventory-orphans-secret-0123456789abcdef012345';
process.env['NK_GIFT_CODE_ENCRYPTION_KEY'] = 'a'.repeat(64);
process.env['NK_GIFT_CODE_ENCRYPTION_KEY_V2'] = 'b'.repeat(64);

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    adminUser: {
      findUnique: vi.fn(async () => ({
        role: 'super_admin',
        status: 'active',
        sessionsInvalidBefore: null,
        mustChangePassword: false,
      })),
    },
    // Return types are declared (not inferred as `never[]`) so the tests can
    // feed rows in: `vi.fn(async () => [])` types as `never[]`.
    product: { findMany: vi.fn(async (_args?: unknown): Promise<unknown[]> => []) },
    stockMove: { findMany: vi.fn(async (_args?: unknown): Promise<unknown[]> => []) },
    giftCode: {
      count: vi.fn(async (_args?: unknown): Promise<number> => 0),
      findMany: vi.fn(async (_args?: unknown): Promise<Record<string, unknown>[]> => []),
      findUnique: vi.fn(),
      updateMany: vi.fn(async (_args?: unknown) => ({ count: 1 })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
  };
  return { prismaMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auditLog', () => ({ writeAuditLog: vi.fn(async () => ({})) }));

const ROUTE = '../src/app/api/v1/admin/inventory/route';

const SECRET = 'buyer@example.com:Sup3rSecretPass';

const argOf = (fn: unknown, i = 0): Record<string, unknown> => {
  const calls = (fn as { mock: { calls: unknown[][] } }).mock.calls;
  return (calls[i]?.[0] ?? {}) as Record<string, unknown>;
};

/** A detached row as Prisma returns it — real ciphertext, so decrypt round-trips. */
async function orphanRow(over: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const { encryptCode } = await import('@/lib/crypto/giftCode');
  const { ciphertext, nonce, keyVersion } = encryptCode(SECRET);
  return {
    id: 'gc_orphan_1',
    variantId: null,
    codeEncrypted: ciphertext,
    nonce,
    keyVersion,
    status: 'available',
    createdAt: new Date('2026-10-17T20:21:00.000Z'),
    ...over,
  };
}

let token = '';
beforeEach(async () => {
  if (!token) {
    const { issueAdminJwt } = await import('@/lib/jwt');
    const { ALL_PERMISSIONS } = await import('@/types/auth');
    token = await issueAdminJwt('adm_root', 'oil@test.local', 'super_admin', [...ALL_PERMISSIONS]);
  }
  vi.clearAllMocks();
  prismaMock.product.findMany.mockResolvedValue([]);
  prismaMock.stockMove.findMany.mockResolvedValue([]);
  prismaMock.giftCode.count.mockResolvedValue(0);
  prismaMock.giftCode.findMany.mockResolvedValue([]);
});

const call = async (): Promise<Response> => {
  const mod = (await import(/* @vite-ignore */ ROUTE)) as {
    GET: (r: NextRequest) => Promise<Response>;
  };
  return mod.GET(
    new NextRequest('http://localhost/api/v1/admin/inventory', {
      headers: { cookie: `nk_admin_at=${token}` },
    }),
  );
};

interface Orphans {
  total: number;
  available: number;
  codes: { id: string; masked: string; createdAt: string }[];
}

const orphansOf = async (res: Response): Promise<Orphans> => {
  const body = (await res.json()) as { orphans: Orphans };
  return body.orphans;
};

describe('inventory orphans — counts', () => {
  it('reports BOTH counts from count() — total detached, and the available subset', async () => {
    prismaMock.giftCode.count.mockResolvedValueOnce(99).mockResolvedValueOnce(13);

    const orphans = await orphansOf(await call());

    expect(orphans.total).toBe(99);
    expect(orphans.available).toBe(13);

    // The two counts must stay distinguishable: same table, different predicate.
    expect(argOf(prismaMock.giftCode.count, 0)['where']).toEqual({ variantId: null });
    expect(argOf(prismaMock.giftCode.count, 1)['where']).toEqual({
      variantId: null,
      status: 'available',
    });
  });

  it('lists only the available ones, oldest first, capped at 200', async () => {
    prismaMock.giftCode.findMany.mockResolvedValue([await orphanRow()]);

    await call();

    const query = argOf(prismaMock.giftCode.findMany);
    expect(query['where']).toEqual({ variantId: null, status: 'available' });
    expect(query['orderBy']).toEqual({ createdAt: 'asc' });
    expect(query['take']).toBe(200);
  });

  it('the cap cannot understate the count: 250 available but 200 rows listed', async () => {
    prismaMock.giftCode.count.mockResolvedValueOnce(300).mockResolvedValueOnce(250);
    const rows = await Promise.all(
      Array.from({ length: 200 }, (_, i) => orphanRow({ id: `gc_${i}`, createdAt: new Date(1_700_000_000_000 + i) })),
    );
    prismaMock.giftCode.findMany.mockResolvedValue(rows);

    const orphans = await orphansOf(await call());

    expect(orphans.codes).toHaveLength(200);
    // Derived from count(), not from the (truncated) list.
    expect(orphans.available).toBe(250);
    expect(orphans.total).toBe(300);
  });
});

describe('inventory orphans — the rows themselves', () => {
  it('masks the account and never returns the plaintext', async () => {
    prismaMock.giftCode.count.mockResolvedValueOnce(13).mockResolvedValueOnce(13);
    prismaMock.giftCode.findMany.mockResolvedValue([await orphanRow()]);

    // Read the body once: `Response.clone()` after `json()` throws, and this
    // assertion is about the WHOLE payload, not just the orphans block.
    const payload = await (await call()).text();
    const orphans = (JSON.parse(payload) as { orphans: Orphans }).orphans;

    expect(orphans.codes).toHaveLength(1);
    const row = orphans.codes[0]!;
    expect(row.masked).not.toBe(SECRET);
    expect(row.masked).not.toContain('Sup3rSecretPass');
    expect(row.masked.length).toBeGreaterThan(0);
    expect(row.createdAt).toBe('2026-10-17T20:21:00.000Z');
    // Exactly the three fields the UI needs — no ciphertext, no hash, no variant.
    expect(Object.keys(row).sort()).toEqual(['createdAt', 'id', 'masked']);
    expect(payload).not.toContain(SECRET);
    expect(payload).not.toContain('Sup3rSecretPass');
  });

  it('reports one unreadable row as (อ่านไม่ได้) without blanking the rest', async () => {
    prismaMock.giftCode.count.mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    prismaMock.giftCode.findMany.mockResolvedValue([
      await orphanRow({ id: 'gc_broken', codeEncrypted: Buffer.from('not-a-ciphertext'), nonce: Buffer.alloc(12) }),
      await orphanRow({ id: 'gc_fine' }),
    ]);

    const orphans = await orphansOf(await call());

    expect(orphans.codes.map((c) => c.id)).toEqual(['gc_broken', 'gc_fine']);
    expect(orphans.codes[0]?.masked).toBe('(อ่านไม่ได้)');
    // The healthy row still shows a mask — one bad row is not a blank section.
    expect(orphans.codes[1]?.masked).not.toBe('(อ่านไม่ได้)');
    expect(orphans.codes[1]?.masked).not.toBe(SECRET);
  });

  it('an empty section is reported as zeros, not omitted', async () => {
    const orphans = await orphansOf(await call());
    expect(orphans).toEqual({ total: 0, available: 0, codes: [] });
  });
});
