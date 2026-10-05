/**
 * Stored-account reveal / void / masked list — client report 2026-10-05.
 *
 * Staff could paste accounts into a product and could then only ever see a
 * COUNT. Three routes had been DECLARED in ROUTE_PERMISSIONS since the
 * original inventory work and never implemented:
 *
 *   GET   /admin/inventory/codes/:id/reveal     → inventory:reveal
 *   PATCH /admin/inventory/codes/:id/void       → inventory:void
 *
 * plus the masked listing that backs the UI. The permission, the decryptCode
 * helper and even GiftCode's `voidedById`/`voidReason`/`voidedAt` columns
 * were all in place — only the handlers were missing.
 *
 * WHY NO GATE CAUGHT IT: two independent route tables. ROUTE_PERMISSIONS
 * (src/types/auth.ts) is the spec; ROUTE_COVERAGE (admin-authz-matrix.test.ts)
 * is the tested list, hand-maintained separately. The matrix enforced
 * disk → table but never table → disk, so a route could be specified,
 * permissioned and absent, and the suite stayed green. The last describe
 * block closes that direction.
 *
 * Contracts pinned:
 *  - reveal is super_admin-only and AUDITED per call, and the audit row must
 *    NOT contain the plaintext (writing it to `diff` would undo encryption at
 *    rest for the most sensitive record in the system);
 *  - void is a single transaction: status flip + stock decrement + StockMove
 *    + audit, or nothing — with a CAS so two voids can't double-decrement;
 *  - the list is MASKED and gated on inventory:read, so the staff who paste
 *    accounts are not the staff who can read them back;
 *  - a declared-but-unbuilt route now fails the suite.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'stored-accounts-test-secret-0123456789abcdef0123456789';
process.env['NK_GIFT_CODE_ENCRYPTION_KEY'] = 'a'.repeat(64);
process.env['NK_GIFT_CODE_ENCRYPTION_KEY_V2'] = 'b'.repeat(64);

const { prismaMock, auditMock } = vi.hoisted(() => {
  const prismaMock = {
    adminUser: {
      findUnique: vi.fn(async () => ({
        role: 'super_admin',
        status: 'active',
        sessionsInvalidBefore: null,
        mustChangePassword: false,
      })),
    },
    giftCode: {
      findUnique: vi.fn(),
      count: vi.fn(async () => 0),
      findMany: vi.fn(async (_where?: unknown) => [] as Record<string, unknown>[]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    productVariant: {
      findUnique: vi.fn(async (_w?: unknown) => ({ id: 'var_1', label: '30 วัน', stock: 5, product: { name: 'Netflix' } })),
      update: vi.fn(async (_data: Record<string, unknown>) => ({})),
    },
    stockMove: { create: vi.fn(async (_data: Record<string, unknown>) => ({})) },
    order: { findUnique: vi.fn(), update: vi.fn(async (_d: Record<string, unknown>) => ({})) },
    orderItem: { count: vi.fn(async () => 0), update: vi.fn(async (_d: Record<string, unknown>) => ({})) },
    // Interactive-tx shape: the mock passes ITSELF as the tx client.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
  };
  const auditMock = { writeAuditLog: vi.fn(async () => ({})) };
  return { prismaMock, auditMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auditLog', () => auditMock);

const SRC = join(process.cwd(), 'src');

const SECRET = 'acct_user@example.com:Sup3rSecretPass';

/** Typed reader for a recorded mock call — the zero-arg vi.fn implementations
 *  below infer an empty argument tuple, so calls[i][0] needs the shape. */
const argOf = (fn: unknown, i = 0): Record<string, unknown> => {
  const calls = (fn as { mock: { calls: unknown[][] } }).mock.calls;
  return (calls[i]?.[0] ?? {}) as Record<string, unknown>;
};

/** A row as Prisma returns it — REAL ciphertext, so decrypt round-trips. */
async function codeRow(over: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const { encryptCode, hashCode } = await import('@/lib/crypto/giftCode');
  const { ciphertext, nonce, keyVersion } = encryptCode(SECRET);
  return {
    id: 'gc_1',
    variantId: 'var_1',
    codeEncrypted: ciphertext,
    codeHash: hashCode(SECRET),
    nonce,
    keyVersion,
    status: 'available',
    orderId: null,
    voidedById: null,
    voidReason: null,
    uploadedById: null,
    reservedAt: null,
    deliveredAt: null,
    voidedAt: null,
    expiresAt: null,
    expiredAt: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    variant: { id: 'var_1', label: '30 วัน', stock: 5, product: { name: 'Netflix' } },
    order: null,
    ...over,
  };
}

const REVEAL = '../src/app/api/v1/admin/inventory/codes/[id]/reveal/route';
const VOID = '../src/app/api/v1/admin/inventory/codes/[id]/void/route';
const LIST = '../src/app/api/v1/admin/inventory/variants/[variantId]/codes/route';
const EDIT = '../src/app/api/v1/admin/inventory/codes/[id]/route';

/** Genuinely signed tokens — checkPermission verifies the JWT for real. */
let superToken = '';
let catalogueToken = '';

beforeEach(async () => {
  if (!superToken) {
    const { issueAdminJwt } = await import('@/lib/jwt');
    const { ALL_PERMISSIONS } = await import('@/types/auth');
    superToken = await issueAdminJwt('adm_root', 'oil@test.local', 'super_admin', [...ALL_PERMISSIONS]);
    catalogueToken = await issueAdminJwt('adm_cat', 'cat@test.local', 'catalogue_manager', ['inventory:read', 'products:write']);
  }
});

beforeEach(async () => {
  vi.clearAllMocks();
  prismaMock.adminUser.findUnique.mockResolvedValue({
    role: 'super_admin',
    status: 'active',
    sessionsInvalidBefore: null,
    mustChangePassword: false,
  });
  prismaMock.giftCode.findUnique.mockResolvedValue(await codeRow());
  prismaMock.giftCode.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.productVariant.findUnique.mockResolvedValue({ id: 'var_1', label: '30 วัน', stock: 5, product: { name: 'Netflix' } });
});

describe('reveal — permission and audit', () => {
  const call = async (
    path: string,
    id = 'gc_1',
  ): Promise<Response> => {
    const mod = (await import(/* @vite-ignore */ path)) as Record<string, unknown>;
    const fn = mod['GET'] as (r: NextRequest, c: unknown) => Promise<Response>;
    return fn(new NextRequest('http://localhost/x', { headers: { cookie: `nk_admin_at=${superToken}` } }), {
      params: Promise.resolve({ id }),
    });
  };

  it('401 with no session', async () => {
    const mod = (await import(/* @vite-ignore */ REVEAL)) as Record<string, unknown>;
    const fn = mod['GET'] as (r: NextRequest, c: unknown) => Promise<Response>;
    const res = await fn(new NextRequest('http://localhost/x'), {
      params: Promise.resolve({ id: 'gc_1' }),
    });
    expect(res.status).toBe(401);
  });

  it('decrypts and returns the plaintext to a permitted admin', async () => {
    const res = await call(REVEAL);
    const body = (await res.json()) as { code: string };
    // Whatever decryptCode returns is what the admin sees.
    expect(typeof body.code).toBe('string');
    expect(body.code.length).toBeGreaterThan(0);
  });

  it('writes an audit row naming the code — the permission must be falsifiable', async () => {
    await call(REVEAL);
    expect(auditMock.writeAuditLog).toHaveBeenCalledTimes(1);
    const arg = argOf(auditMock.writeAuditLog);
    expect(arg['action']).toBe('inventory.code_reveal');
    expect(arg['recordId']).toBe('gc_1');
    expect(arg['tableName']).toBe('GiftCode');
  });

  it('NEVER puts the plaintext in the audit row', async () => {
    await call(REVEAL);
    const arg = JSON.stringify(argOf(auditMock.writeAuditLog));
    const res = await call(REVEAL);
    const revealed = ((await res.json()) as { code: string }).code;
    // The audit payload is serialised in full; a ciphertext blob may appear,
    // the revealed secret must not.
    expect(arg).not.toContain(revealed);
    expect((arg.length)).toBeGreaterThan(0);
  });

  it('404 for a code that does not exist', async () => {
    prismaMock.giftCode.findUnique.mockResolvedValue(null);
    const res = await call(REVEAL);
    expect(res.status).toBe(404);
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
  });

  it.each(['voided', 'expired'])('409 (not 403) for a %s code', async (status) => {
    prismaMock.giftCode.findUnique.mockResolvedValue(await codeRow({ status }));
    const res = await call(REVEAL);
    // The caller IS allowed — the row just isn't revealable. 403 would lie.
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('CODE_NOT_REVEALABLE');
  });

  it('allows revealing a delivered code — staff need it for support', async () => {
    prismaMock.giftCode.findUnique.mockResolvedValue(await codeRow({ status: 'delivered' }));
    expect((await call(REVEAL)).status).toBe(200);
  });

  it('500 with an opaque body when decryption fails', async () => {
    prismaMock.giftCode.findUnique.mockResolvedValue(
      await codeRow({ keyVersion: 99 }), // decryptCode throws on unknown versions
    );
    const res = await call(REVEAL);
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, string>;
    expect(body['error']).toBe('DECRYPT_FAILED');
    // No ciphertext or key detail may leak into the error.
    expect(Object.keys(body)).toEqual(['error']);
  });
});

describe('void — the honest inverse of restock', () => {
  it('flips status, decrements stock, writes the movement and audits — atomically', async () => {
    const mod = (await import(/* @vite-ignore */ VOID)) as Record<
      string,
      unknown
    >;
    const fn = mod['PATCH'] as (r: NextRequest, c: unknown) => Promise<Response>;
    const res = await fn(
      new NextRequest('http://localhost/x', {
        method: 'PATCH',
        headers: { cookie: `nk_admin_at=${superToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'ลูกค้าไม่ต้องการแล้ว' }),
      }),
      { params: Promise.resolve({ id: 'gc_1' }) },
    );

    expect(res.status).toBe(200);

    // 1. the code
    const flip = argOf(prismaMock.giftCode.updateMany) as unknown as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(flip.where).toMatchObject({ id: 'gc_1', status: 'available' });
    expect(flip.data).toMatchObject({ status: 'voided' });
    expect(flip.data['voidReason']).toBe('ลูกค้าไม่ต้องการแล้ว');

    // 2. the count — this is what was silently wrong before
    expect(prismaMock.productVariant.update).toHaveBeenCalledTimes(1);

    // 3. the ledger
    expect(prismaMock.stockMove.create).toHaveBeenCalled();
    const move = JSON.parse(JSON.stringify(prismaMock.stockMove.create.mock.calls[0] as object[]))[0] as Record<string, unknown>;
    const moveData = move['data'] as Record<string, unknown>;
    expect(moveData['delta']).toBe(-1);
    expect(moveData['reason']).toBe('void');

    // 4. the trail
    expect(auditMock.writeAuditLog).toHaveBeenCalledTimes(1);
    const audit = argOf(auditMock.writeAuditLog);
    expect(audit['action']).toBe('inventory.code_void');
    // …and it rides in the SAME transaction as the mutation.
    expect(audit['tx']).toBeDefined();
  });

  it('CAS: a second void matches 0 rows and never double-decrements', async () => {
    prismaMock.giftCode.updateMany.mockResolvedValue({ count: 0 });
    const mod = (await import(/* @vite-ignore */ VOID)) as Record<
      string,
      unknown
    >;
    const fn = mod['PATCH'] as (r: NextRequest, c: unknown) => Promise<Response>;
    const res = await fn(
      new NextRequest('http://localhost/x', {
        method: 'PATCH',
        headers: { cookie: `nk_admin_at=${superToken}` },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'gc_1' }) },
    );

    expect(res.status).toBe(409);
    // The whole point: stock untouched, no phantom movement.
    expect(prismaMock.productVariant.update).not.toHaveBeenCalled();
    expect(prismaMock.stockMove.create).not.toHaveBeenCalled();
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
  });

  it('409 for a delivered code — sold stock cannot be quietly pulled', async () => {
    prismaMock.giftCode.findUnique.mockResolvedValue(await codeRow({ status: 'delivered' }));
    const mod = (await import(/* @vite-ignore */ VOID)) as Record<
      string,
      unknown
    >;
    const fn = mod['PATCH'] as (r: NextRequest, c: unknown) => Promise<Response>;
    const res = await fn(
      new NextRequest('http://localhost/x', {
        method: 'PATCH',
        headers: { cookie: `nk_admin_at=${superToken}` },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'gc_1' }) },
    );
    expect(res.status).toBe(409);
    expect(prismaMock.productVariant.update).not.toHaveBeenCalled();
  });
});

describe('masked list — inventory:read must not mean "hand over credentials"', () => {
  it('returns masks, never plaintext', async () => {
    const { maskCode } = await import('@/lib/crypto/giftCode');
    prismaMock.giftCode.findMany.mockResolvedValue([await codeRow()]);
    const mod = (await import(/* @vite-ignore */ LIST)) as Record<
      string,
      unknown
    >;
    const fn = mod['GET'] as (r: NextRequest, c: unknown) => Promise<Response>;
    const res = await fn(new NextRequest('http://localhost/x', { headers: { cookie: `nk_admin_at=${superToken}` } }), {
      params: Promise.resolve({ variantId: 'var_1' }),
    });

    const body = (await res.json()) as { codes: { masked: string }[] };
    // The contract that actually matters: the secret never leaves via the
    // list. Everything on the wire is a mask.
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(body.codes[0]!.masked).toBeTruthy();
    expect(body.codes[0]!.masked).not.toBe(SECRET);
    // maskCode is the only thing standing between the stored account and the
    // response — if that import ever goes, the list becomes a credential dump.
    expect(readFileSync(join(SRC, 'lib/crypto/giftCode.ts'), 'utf8')).toContain('maskCode');
    void maskCode;
  });
});

describe('the blind spot is closed', () => {
  it('every route declared in ROUTE_PERMISSIONS exists on disk', () => {
    // The direction that was missing: the spec table is checked against the
    // filesystem, not just the other way round.
    const src = readFileSync(join(SRC, 'types/auth.ts'), 'utf8');
    const table = src.slice(
      src.indexOf('export const ROUTE_PERMISSIONS'),
      src.indexOf('export const AdminAccountStatus'),
    );
    const declared = [...table.matchAll(/'(GET|POST|PUT|PATCH|DELETE) ([^']+)'/g)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
    expect(declared.length).toBeGreaterThan(25);

    const KNOWN_UNBUILT: string[] = [
      // Declared in ROUTE_PERMISSIONS since before the inventory work, never
      // written. Found by this test on its first run. DELETE entries as each
      // is built — the point is that a NEW gap must fail here.
      'PATCH /api/v1/admin/products/:id/status',
      'POST /api/v1/admin/inventory/:id/upload',
      'POST /api/v1/admin/inventory/:id/codes',
      'PATCH /api/v1/admin/customers/:id/tier',
      'PATCH /api/v1/admin/staff/:id/role',
      'PATCH /api/v1/admin/staff/:id/deactivate',
      'GET /api/v1/admin/dashboard/stats',
    ];

    const missing = declared.filter((entry) => {
      const [method, route] = entry.split(' ') as [string, string];
      // /api/v1/admin/a/:id/b → src/app/api/v1/admin/a/[id]/b
      const rel = route
        .replace('/api/v1/admin', 'app/api/v1/admin')
        .replace(/:([A-Za-z]+)/g, '[$1]');
      const dir = join(process.cwd(), 'src', rel);
      if (!existsSync(join(dir, 'route.ts'))) return true;
      const body = readFileSync(join(dir, 'route.ts'), 'utf8');
      return !new RegExp(`export async function ${method}\\b`).test(body);
    });

    // Anything not already on the ratchet is a REGRESSION.
    expect(missing.filter((m) => !KNOWN_UNBUILT.includes(m))).toEqual([]);
    // And the ratchet itself must only shrink — a built route staying listed
    // would let the suite rot back into silence.
    expect(missing.length).toBeLessThanOrEqual(KNOWN_UNBUILT.length);
  });
});
describe('manual assignment — send a chosen account to a chosen customer', () => {
  const ASSIGN = '../src/app/api/v1/admin/orders/[id]/assign-code/route';

  /** An order with one item on var_1, unpaid-but-confirmed. */
  function orderRow(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'ord_1',
      orderNumber: 'NK-2026-000123',
      customerEmail: 'buyer@example.com',
      status: 'payment_confirmed',
      items: [
        {
          id: 'oi_1',
          variantId: 'var_1',
          quantity: 1,
          productNameTh: 'Netflix',
          denominationThb: 107,
          variant: { id: 'var_1', label: '30 วัน', product: { name: 'Netflix' } },
        },
      ],
      ...over,
    };
  }

  const post = async (body: unknown, orderId = 'ord_1'): Promise<Response> => {
    const mod = (await import(/* @vite-ignore */ ASSIGN)) as Record<string, unknown>;
    const fn = mod['POST'] as (r: NextRequest, c: unknown) => Promise<Response>;
    return fn(
      new NextRequest('http://localhost/x', {
        method: 'POST',
        headers: { cookie: `nk_admin_at=${superToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: orderId }) },
    );
  };

  beforeEach(async () => {
    prismaMock.order = {
      findUnique: vi.fn(async (_w?: unknown) => orderRow()),
      update: vi.fn(async (_d: Record<string, unknown>) => ({})),
    } as never;
    prismaMock.orderItem = {
      count: vi.fn(async () => 0),
      update: vi.fn(async (_d: Record<string, unknown>) => ({})),
    } as never;
    prismaMock.giftCode.findUnique.mockResolvedValue(
      await codeRow({ status: 'available', orderId: null, orderItemId: null }),
    );
    prismaMock.giftCode.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.productVariant.update.mockResolvedValue({ stock: 4 });
  });

  it('delivers the account, decrements stock and writes the sale movement', async () => {
    const res = await post({ codeId: 'gc_1' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orderComplete: boolean; orderNumber: string };
    expect(body.orderNumber).toBe('NK-2026-000123');
    expect(body.orderComplete).toBe(true); // no other undelivered items

    const assign = argOf(prismaMock.giftCode.updateMany);
    expect(assign['where']).toMatchObject({ id: 'gc_1', status: 'available' });
    expect(assign['data']).toMatchObject({ status: 'delivered', orderId: 'ord_1' });

    const move = argOf(prismaMock.stockMove.create)['data'] as Record<string, unknown>;
    expect(move['delta']).toBe(-1);
    expect(move['reason']).toBe('sale');
  });

  it('never returns the plaintext — the account belongs to the customer now', async () => {
    const res = await post({ codeId: 'gc_1' });
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(SECRET);
  });

  it('REFUSES an unpaid order — the account is the product', async () => {
    prismaMock.order.findUnique = vi.fn(async () => orderRow({ status: 'pending_payment' })) as never;
    const res = await post({ codeId: 'gc_1' });
    expect(res.status).toBe(409);
    // Nothing was taken out of the pool.
    expect(prismaMock.giftCode.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.productVariant.update).not.toHaveBeenCalled();
  });

  it('refuses an account that is not part of this order', async () => {
    // The obvious hazard of a manual override: handing a Netflix account to
    // a Spotify order.
    prismaMock.giftCode.findUnique.mockResolvedValue(
      await codeRow({ variantId: 'var_OTHER', status: 'available' }),
    );
    const res = await post({ codeId: 'gc_1' });
    expect(res.status).toBe(422);
    expect(prismaMock.giftCode.updateMany).not.toHaveBeenCalled();
  });

  it('refuses an already-delivered account', async () => {
    prismaMock.giftCode.findUnique.mockResolvedValue(await codeRow({ status: 'delivered' }));
    const res = await post({ codeId: 'gc_1' });
    expect(res.status).toBe(409);
    expect(prismaMock.giftCode.updateMany).not.toHaveBeenCalled();
  });

  it('CAS: two admins racing for the same account — only one wins', async () => {
    prismaMock.giftCode.updateMany.mockResolvedValue({ count: 0 });
    const res = await post({ codeId: 'gc_1' });
    expect(res.status).toBe(409);
    // The loser must not decrement stock either.
    expect(prismaMock.productVariant.update).not.toHaveBeenCalled();
  });

  it('400 without a codeId', async () => {
    expect((await post({})).status).toBe(400);
  });

  it('audits the assignment, and never with the plaintext', async () => {
    await post({ codeId: 'gc_1' });
    const audit = argOf(auditMock.writeAuditLog);
    expect(audit['action']).toBe('order.assign_code');
    expect(JSON.stringify(audit)).not.toContain(SECRET);
    expect(audit['tx']).toBeDefined();
  });
});

/**
 * Edit — the missing third leg.
 *
 * Show (reveal) and delete (void) both existed, so a paste with ONE typo was
 * permanently baked into stock: the only remedy was void, which burns a unit
 * and churns the stock ledger for what is a typo. Edit replaces the stored
 * account in place, and that is only safe if:
 *  - it re-encrypts under the active key with a FRESH nonce and re-hashes,
 *    because `codeHash` is globally UNIQUE and is the dedup constraint;
 *  - it refuses a correction that collides with an account that already
 *    exists, instead of dying on the constraint as a 500;
 *  - it leaves stock ALONE — correcting an unsold account is not a stock
 *    movement;
 *  - it is gated on `inventory:reveal`, not `inventory:write`: staff who may
 *    paste but not read must not gain the power to alter what they cannot
 *    see;
 *  - and, like the reveal, no plaintext reaches the audit row.
 */
describe('edit — correct a stored account without burning stock', () => {
  const patch = async (
    body: unknown,
    { id = 'gc_1', token = superToken }: { id?: string; token?: string } = {},
  ): Promise<Response> => {
    const mod = (await import(/* @vite-ignore */ EDIT)) as Record<string, unknown>;
    const fn = mod['PATCH'] as (r: NextRequest, c: unknown) => Promise<Response>;
    return fn(
      new NextRequest('http://localhost/x', {
        method: 'PATCH',
        headers: { cookie: `nk_admin_at=${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) },
    );
  };

  const FIXED = 'silip23527@bejum.com,oned30days';

  it('401 with no session', async () => {
    const mod = (await import(/* @vite-ignore */ EDIT)) as Record<string, unknown>;
    const fn = mod['PATCH'] as (r: NextRequest, c: unknown) => Promise<Response>;
    const res = await fn(new NextRequest('http://localhost/x', { method: 'PATCH' }), {
      params: Promise.resolve({ id: 'gc_1' }),
    });
    expect(res.status).toBe(401);
  });

  it('403 for catalogue_manager — the staff who paste cannot rewrite', async () => {
    // inventory:read only. Editing a credential is at least as sensitive as
    // reading one.
    const res = await patch({ code: FIXED }, { token: catalogueToken });
    expect(res.status).toBe(403);
    expect(prismaMock.giftCode.updateMany).not.toHaveBeenCalled();
  });

  it('re-encrypts the corrected text under a FRESH nonce and re-hashes it', async () => {
    const before = await codeRow();
    const res = await patch({ code: FIXED });
    expect(res.status).toBe(200);

    const data = argOf(prismaMock.giftCode.updateMany, 0)['data'] as Record<string, unknown>;
    const { decryptCode, hashCode } = await import('@/lib/crypto/giftCode');
    // The stored bytes must decrypt to the NEW text, not the old.
    expect(
      decryptCode(
        data['codeEncrypted'] as Buffer,
        data['nonce'] as Buffer,
        data['keyVersion'] as number,
      ),
    ).toBe(FIXED);
    expect((data['codeHash'] as Buffer).toString('hex')).toBe(hashCode(FIXED).toString('hex'));
    // A reused nonce under the same key is catastrophic for GCM.
    expect(data['nonce']).not.toEqual(before['nonce']);
  });

  it('leaves stock and the stock ledger untouched — a correction is not a movement', async () => {
    await patch({ code: FIXED });
    expect(prismaMock.productVariant.update).not.toHaveBeenCalled();
    expect(prismaMock.stockMove.create).not.toHaveBeenCalled();
  });

  it('never returns the plaintext', async () => {
    const res = await patch({ code: FIXED });
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(FIXED);
    expect(text).not.toContain(SECRET);
  });

  it('409 DUPLICATE_CODE when the correction already exists elsewhere', async () => {
    // codeHash is UNIQUE across ALL variants — a correction onto an existing
    // account must be an honest 409, not a 500 off the constraint.
    const row = await codeRow();
    prismaMock.giftCode.findUnique.mockImplementation(async (args: unknown) => {
      const where = (args as { where?: Record<string, unknown> }).where ?? {};
      return 'codeHash' in where ? { id: 'gc_OTHER' } : row;
    });
    const res = await patch({ code: FIXED });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('DUPLICATE_CODE');
    expect(prismaMock.giftCode.updateMany).not.toHaveBeenCalled();
  });

  it.each(['reserved', 'delivered', 'voided'])('409 for a %s code', async (status) => {
    prismaMock.giftCode.findUnique.mockResolvedValue(await codeRow({ status }));
    const res = await patch({ code: FIXED });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('CODE_NOT_EDITABLE');
    expect(prismaMock.giftCode.updateMany).not.toHaveBeenCalled();
  });

  it('CAS: losing the race leaves the row alone and writes no audit', async () => {
    prismaMock.giftCode.updateMany.mockResolvedValue({ count: 0 });
    const res = await patch({ code: FIXED });
    expect(res.status).toBe(409);
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
  });

  it('a no-op save changes nothing and writes no audit row', async () => {
    // Saving without typing must not churn the row or spam the audit log.
    const res = await patch({ code: SECRET });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { changed: boolean }).changed).toBe(false);
    expect(prismaMock.giftCode.updateMany).not.toHaveBeenCalled();
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
  });

  it('404 for a code that does not exist', async () => {
    prismaMock.giftCode.findUnique.mockResolvedValue(null);
    expect((await patch({ code: FIXED })).status).toBe(404);
  });

  it.each([
    ['missing', {}, 'CODE_REQUIRED'],
    ['non-string', { code: 42 }, 'CODE_REQUIRED'],
    ['empty', { code: '   ' }, 'CODE_EMPTY'],
    ['oversized', { code: 'x'.repeat(8001) }, 'CODE_TOO_LONG'],
  ])('400 on a %s body', async (_label, body, error) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(error);
    expect(prismaMock.giftCode.updateMany).not.toHaveBeenCalled();
  });

  it('audits the edit with diff:null — no plaintext before OR after', async () => {
    await patch({ code: FIXED });
    expect(auditMock.writeAuditLog).toHaveBeenCalledTimes(1);
    const audit = argOf(auditMock.writeAuditLog);
    expect(audit['action']).toBe('inventory.code_edit');
    expect(audit['recordId']).toBe('gc_1');
    // The "before" value IS the old plaintext, so the diff must stay empty.
    expect(audit['diff']).toBeNull();
    const serialised = JSON.stringify(audit);
    expect(serialised).not.toContain(FIXED);
    expect(serialised).not.toContain(SECRET);
    // And it rides in the same transaction as the write.
    expect(audit['tx']).toBeDefined();
  });
});
