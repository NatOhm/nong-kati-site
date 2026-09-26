/**
 * Authorization matrix — every admin endpoint × every admin role.
 *
 * Calls each route handler in-process (no HTTP server, no database — prisma
 * is mocked to throw past the guard) with:
 *
 *   R0  no Authorization header   → expect 401 exactly
 *   R1…R6  each of the 6 AdminRoles:
 *         role lacks the endpoint's permission → expect 403 exactly
 *         role has  the endpoint's permission → expect NOT 401/403
 *           (guard passed; the request dies later as 400/404/500 on mocked
 *            infra, which proves authorization alone let it through)
 *
 * Expected results are DERIVED, never hand-written: permission per endpoint
 * from the route table below, role→permission from ROLE_PERMISSIONS in
 * src/types/auth.ts. The matrix therefore cannot silently drift from the
 * production RBAC source of truth.
 *
 * Also enforced: ROUTE_COVERAGE must list every route file under
 * src/app/api/v1/admin — a new endpoint without a matrix row fails the suite
 * (authorization cannot be "forgotten" for new endpoints).
 *
 * Guard contract being tested (matches every route): missing bearer → 401,
 * JWT valid but permission absent → 403, permission present → pass the gate.
 * Tokens are real signed JWTs (NK_JWT_SECRET set in beforeEach) so
 * checkPermission exercises verifyAdminJwt for real.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NK_JWT_SECRET'] = 'matrix-test-secret-0123456789abcdef0123456789abcdef';
process.env['GIFT_CODE_KEY'] ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/**
 * prisma mock with a precise split:
 *  - adminUser.findUnique ANSWERS (verifyAdminJwt checks live role/status/
 *    session-invalidation state on every request — part of the auth gate
 *    itself). Tokens carry sub = `admin-<role>`, so the mock derives the
 *    matching active row from the id; unknown ids behave like "no such user".
 *  - every other model access THROWS: business logic must never run in an
 *    authz test — reaching it at all is a (harmless, caught) proof that the
 *    guard passed.
 * Created inside vi.hoisted because vi.mock factories are hoisted above
 * module-level declarations.
 */
const { prismaThrow, auditCreate } = vi.hoisted(() => {
  const adminUser = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const m = /^admin-(.+)$/.exec(where.id);
      if (!m) return null;
      return {
        role: m[1],
        status: 'active',
        sessionsInvalidBefore: null,
        mustChangePassword: false,
      };
    }),
  };
  const prismaThrow = new Proxy(
    { adminUser },
    {
      get(target, model) {
        if (model === 'adminUser') return target.adminUser;
        throw new Error(`PRISMA_REACHED_IN_AUTHZ_TEST: ${String(model)}`);
      },
    },
  );
  const auditCreate = vi.fn<(input: unknown) => Promise<unknown>>();
  auditCreate.mockResolvedValue({});
  return { prismaThrow, auditCreate };
});

vi.mock('@/lib/db', () => ({ prisma: prismaThrow }));

/**
 * React 18.3.1 (what vitest resolves) has no `cache` export — Next.js ships
 * its own canary where it exists. The admin API layer's RSC cache() wrapper
 * (src/lib/data.ts) must still import in the plain node env; a passthrough
 * keeps semantics (call straight through) without touching anything else.
 */
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: (fn: unknown) => fn };
});

vi.mock('@/lib/auditLog', () => ({
  writeAuditLog: (input: { tx?: { auditLog: { create: (args: unknown) => Promise<unknown> } } }) =>
    input.tx ? input.tx.auditLog.create({ data: input }) : auditCreate({ data: input }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  auditCreate.mockResolvedValue({});
});

import { issueAdminJwt } from '@/lib/jwt';
import { ROLE_PERMISSIONS, type AdminRole, type Permission } from '@/types/auth';

const ROLES = Object.keys(ROLE_PERMISSIONS) as AdminRole[];

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
interface MatrixRow {
  method: Method;
  path: string;
  perm: Permission;
  /** JSON body for POST/PATCH/PUT so the handler reaches its guard before validating. */
  body?: unknown;
  /** x2fa-code header for TOTP-protected routes. */
  headers?: Record<string, string>;
}

/**
 * One row per admin endpoint×method. Permission is the one the route's
 * checkPermission call enforces (source: each admin route file's guards).
 */
const ROUTE_COVERAGE: MatrixRow[] = [
  // announcement
  { method: 'GET', path: '/announcement', perm: 'settings:read' },
  { method: 'PUT', path: '/announcement', perm: 'settings:write', body: { text: 'x' } },
  // audit-log
  { method: 'GET', path: '/audit-log', perm: 'audit:read' },
  // categories
  { method: 'GET', path: '/categories', perm: 'categories:read' },
  { method: 'POST', path: '/categories', perm: 'categories:write', body: { nameTh: 'x' } },
  { method: 'PUT', path: '/categories/cat-1', perm: 'categories:write', body: { nameTh: 'x' } },
  { method: 'DELETE', path: '/categories/cat-1', perm: 'categories:write' },
  // coupons
  { method: 'GET', path: '/coupons', perm: 'coupons:read' },
  { method: 'POST', path: '/coupons', perm: 'coupons:write', body: { code: 'X' } },
  { method: 'PATCH', path: '/coupons/c-1', perm: 'coupons:write', body: { active: false } },
  { method: 'DELETE', path: '/coupons/c-1', perm: 'coupons:delete' },
  // dev-seed (guarded 404 in production builds, guard order itself is tested)
  { method: 'POST', path: '/dev-seed', perm: 'customers:write', body: {} },
  // hero-slides
  { method: 'GET', path: '/hero-slides', perm: 'settings:read' },
  { method: 'POST', path: '/hero-slides', perm: 'settings:write', body: {} },
  { method: 'PUT', path: '/hero-slides/h-1', perm: 'settings:write', body: {} },
  { method: 'DELETE', path: '/hero-slides/h-1', perm: 'settings:write' },
  // customers
  { method: 'GET', path: '/customers', perm: 'customers:read' },
  { method: 'GET', path: '/customers/cust-1', perm: 'customers:read' },
  { method: 'PATCH', path: '/customers/cust-1', perm: 'customers:write', body: {} },
  { method: 'PATCH', path: '/customers/cust-1/block', perm: 'customers:block', body: {} },
  // dashboard
  { method: 'GET', path: '/dashboard', perm: 'reports:read' },
  // inventory
  { method: 'GET', path: '/inventory', perm: 'inventory:read' },
  { method: 'POST', path: '/inventory', perm: 'inventory:upload', body: {} },
  // orders
  { method: 'GET', path: '/orders', perm: 'orders:read' },
  { method: 'GET', path: '/orders/ord-1', perm: 'orders:read' },
  {
    method: 'POST',
    path: '/orders/ord-1/verify-payment',
    perm: 'orders:write',
    body: { verified: true },
  },
  // pricing
  { method: 'POST', path: '/pricing/bulk', perm: 'products:write', body: {} },
  // products
  { method: 'GET', path: '/products', perm: 'products:read' },
  { method: 'POST', path: '/products', perm: 'products:write', body: {} },
  { method: 'PUT', path: '/products/p-1', perm: 'products:write', body: {} },
  { method: 'DELETE', path: '/products/p-1', perm: 'products:write' },
  { method: 'POST', path: '/products/import', perm: 'products:write', body: {} },
  { method: 'POST', path: '/products/publish', perm: 'products:write', body: { skus: [] } },
  // reports
  { method: 'GET', path: '/reports/customer-sales', perm: 'reports:read' },
  // CSV export — PII masking rides customers:read:full inside the handler
  { method: 'GET', path: '/reports/customer-sales/export', perm: 'reports:export' },
  { method: 'GET', path: '/reports/slow-stock', perm: 'reports:read' },
  { method: 'PUT', path: '/reports/slow-stock', perm: 'settings:write', body: { days: 30 } },
  // settings
  { method: 'GET', path: '/settings/some-key', perm: 'settings:read' },
  { method: 'PUT', path: '/settings/some-key', perm: 'settings:write', body: { value: 'x' } },
  // staff
  { method: 'GET', path: '/staff', perm: 'staff:read' },
  { method: 'POST', path: '/staff', perm: 'staff:write', body: {} },
  {
    method: 'PATCH',
    path: '/staff/s-1',
    perm: 'staff:write',
    body: { action: 'role', role: 'support_agent' },
  },
  { method: 'POST', path: '/staff/s-1', perm: 'staff:reset-2fa', body: { action: 'unlock' } },
  // stock
  { method: 'POST', path: '/stock/bulk', perm: 'products:write', body: {} },
  // tags
  { method: 'GET', path: '/tags', perm: 'products:read' },
  { method: 'POST', path: '/tags', perm: 'products:write', body: {} },
  { method: 'PATCH', path: '/tags/t-1', perm: 'products:write', body: {} },
  { method: 'DELETE', path: '/tags/t-1', perm: 'products:write' },
  // tickets
  { method: 'GET', path: '/tickets', perm: 'tickets:read' },
  { method: 'GET', path: '/tickets/tk-1', perm: 'tickets:read' },
  { method: 'PATCH', path: '/tickets/tk-1', perm: 'tickets:write', body: {} },
  // topups
  { method: 'GET', path: '/topups', perm: 'topups:read' },
  // upload
  { method: 'POST', path: '/upload', perm: 'products:write', body: {} },
  // variants
  { method: 'PATCH', path: '/variants/v-1', perm: 'products:write', body: {} },
];

const ADMIN_DIR = 'src/app/api/v1/admin';

function listRouteFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name === 'route.ts') out.push(p.split(path.sep).join('/'));
    }
  };
  walk(ADMIN_DIR);
  return out.sort();
}

const dynamicImport = (routePath: string): Promise<Record<string, unknown>> =>
  // Runtime import via file URL — `[id]` segments are illegal URL characters
  // and must be percent-encoded, which pathToFileURL handles (Windows too).
  // @vite-ignore keeps Vite from pre-bundling a specifier unknown at build time.
  import(/* @vite-ignore */ pathToFileURL(path.resolve(routePath)).href) as Promise<
    Record<string, unknown>
  >;

function makeRequest(
  method: Method,
  suffix: string,
  body: unknown,
  headers?: Record<string, string>,
): NextRequest {
  const url = `http://localhost/api/v1/admin${suffix}`;
  const hasBody = body !== undefined && method !== 'GET';
  return new NextRequest(url, {
    method,
    headers: {
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...(headers ?? {}),
    },
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
  });
}

const CTX = (id: string) => ({ params: Promise.resolve({ id }) });

async function callHandler(
  mod: Record<string, unknown>,
  row: MatrixRow,
  token: string | null,
): Promise<Response> {
  const handler = mod[row.method] as
    | ((req: NextRequest, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>)
    | undefined;
  if (typeof handler !== 'function') throw new Error(`${row.method} missing for ${row.path}`);
  const req = makeRequest(row.method, row.path, row.body, {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...row.headers,
  });
  const idMatch = /\/(cat-1|c-1|h-1|cust-1|ord-1|p-1|s-1|t-1|tk-1|v-1|some-key)(\/)?$/.exec(
    row.path,
  );
  return idMatch ? handler(req, CTX(idMatch[1] as string)) : handler(req);
}

async function importAllRoutes(): Promise<Record<string, Record<string, unknown>>> {
  const mods: Record<string, Record<string, unknown>> = {};
  for (const file of listRouteFiles()) {
    const suffix = file.slice(ADMIN_DIR.length, -'/route.ts'.length);
    try {
      mods[suffix] = await dynamicImport(file);
    } catch (err) {
      mods[suffix] = { __importError: String(err) };
    }
  }
  return mods;
}

let mods: Record<string, Record<string, unknown>>;

beforeEach(async () => {
  if (!mods) {
    mods = await importAllRoutes();
    buildRoutePatterns();
  }
});

/**
 * Module keys use the real `[param]` route segments (which differ per route:
 * [id], [key], …); matrix rows use concrete ids. Match rows to real route
 * files by turning each directory's `[param]` into a wildcard.
 */
let routePatterns: Array<{ pattern: RegExp; key: string }> = [];

function buildRoutePatterns(): void {
  routePatterns = Object.keys(mods ?? {}).map((key) => ({
    key,
    pattern: new RegExp(
      '^' + key.replace(/[.*+?^${}()[\]\\]/g, '\\$&').replace(/\\\[[^\\\\]+\\\]/g, '([^/]+)') + '$',
    ),
  }));
}

function keyForPath(p: string): string {
  if (!mods) return p;
  if (mods[p] !== undefined) return p;
  for (const { pattern, key } of routePatterns) {
    if (pattern.test(p)) return key;
  }
  return p;
}

const tokenCache = new Map<AdminRole | '__none__', string | null>();

async function tokenFor(role: AdminRole | '__none__'): Promise<string | null> {
  if (tokenCache.has(role)) return tokenCache.get(role) ?? null;
  let token: string | null;
  if (role === '__none__') token = null;
  else {
    token = await issueAdminJwt(`admin-${role}`, `${role}@nong-kati.test`, role, [
      ...ROLE_PERMISSIONS[role],
    ]);
  }
  tokenCache.set(role, token);
  return token;
}

describe('admin route coverage', () => {
  // 60s timeout: cold-start import of every admin route module (CI, no cache).
  it(
    'matrix covers every admin route file — new endpoints must be added',
    { timeout: 60_000 },
    () => {
      const files = listRouteFiles();
      const covered = new Set(ROUTE_COVERAGE.map((r) => `${r.method} ${keyForPath(r.path)}`));
      const missing: string[] = [];
      for (const file of files) {
        const suffix = file.slice(ADMIN_DIR.length, -'/route.ts'.length);
        const mod = mods[suffix];
        if (mod?.['__importError']) {
          missing.push(`${suffix} (import failed: ${String(mod['__importError']).slice(0, 300)})`);
          continue;
        }
        for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as Method[]) {
          if (typeof mod?.[method] === 'function' && !covered.has(`${method} ${suffix}`)) {
            missing.push(`${method} ${suffix}`);
          }
        }
      }
      expect(
        missing,
        `endpoints missing from the authz matrix:\n  ${missing.join('\n  ')}`,
      ).toEqual([]);
    },
  );
});

describe('authorization matrix', () => {
  it('unauthenticated: every endpoint returns exactly 401', async () => {
    const failures: string[] = [];
    for (const row of ROUTE_COVERAGE) {
      const mod = mods[keyForPath(row.path)];
      if (!mod || mod['__importError']) {
        failures.push(
          `${row.method} ${row.path} → module not importable: ${String(mod?.['__importError']).slice(0, 200)}`,
        );
        continue;
      }
      let status: number;
      try {
        status = (await callHandler(mod, row, null)).status;
      } catch (err) {
        failures.push(`${row.method} ${row.path} → threw ${String(err).slice(0, 120)}`);
        continue;
      }
      if (status !== 401) failures.push(`${row.method} ${row.path} → ${status} (expected 401)`);
    }
    expect(failures).toEqual([]);
  });

  describe.each(ROLES.map((r) => [r] as const))('role: %s', (role) => {
    it('endpoints outside the role → exactly 403; endpoints inside → never 401/403', async () => {
      const perms = ROLE_PERMISSIONS[role] as Permission[];
      const token = await tokenFor(role);
      const failures: string[] = [];
      for (const row of ROUTE_COVERAGE) {
        const mod = mods[keyForPath(row.path)];
        if (!mod || mod['__importError']) {
          failures.push(`${row.method} ${row.path} → module not importable`);
          continue;
        }
        const allowed = perms.includes(row.perm);
        let status: number;
        try {
          status = (await callHandler(mod, row, token)).status;
        } catch (err) {
          // Guards RETURN 401/403 JSON — they never throw. So a throw on an
          // allowed role happened past the gate (mocked prisma/infra, formData
          // on a JSON body, …) and proves authorization let the request in.
          // Deny-side throws are ALWAYS reported — no silent swallowing.
          if (allowed) continue;
          failures.push(
            `${row.method} ${row.path} → threw before 403: ${String(err).slice(0, 160)}`,
          );
          continue;
        }
        if (!allowed && status !== 403) {
          failures.push(`${row.method} ${row.path} (needs ${row.perm}) → ${status}, expected 403`);
        }
        if (allowed && (status === 401 || status === 403)) {
          failures.push(`${row.method} ${row.path} (has ${row.perm}) → ${status}, gate must pass`);
        }
      }
      expect(failures).toEqual([]);
    });
  });
});
