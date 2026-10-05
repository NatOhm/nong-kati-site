/**
 * Forced password change must not look like a permissions problem.
 *
 * Client report 2026-10-05: a **super_admin** opened /management/products and
 * got a red `INSUFFICIENT_PERMISSIONS` banner over "0 รายการ", with the full
 * 7-section sidebar still rendered.
 *
 * The chain that produced it:
 *  1. `mustChangePassword` is set (first login, or a forced rotation from
 *     staff management).
 *  2. `verifyAdminJwt` empties the token perms — deliberate, so a temp
 *     password grants nothing.
 *  3. The sidebar is gated on ROLE (`visibleNav` → `roleHasPermission`), not
 *     on that token, so a super_admin still sees every module.
 *  4. Every API call checks the token, so all of them 403. Nav and API
 *     disagree, and the error named permissions — not the actual blocker.
 *  5. Nothing server-side redirected. The ONLY nudge was a client-side
 *     `router.push` in the login page; miss it, or open a bookmark, and the
 *     admin is stranded.
 *
 * Why `admin-authz-matrix.test.ts` never caught it: that matrix hardcodes
 * `mustChangePassword: false` for all 53 endpoints × 6 roles. This state has
 * never been exercised by the suite — which is why it reached production
 * green. This file is that missing state.
 *
 * Contracts pinned:
 *  - a forced admin's perms are still empty (the gate is NOT weakened);
 *  - the reason reported is PASSWORD_CHANGE_REQUIRED, not a permission error;
 *  - a genuine role denial still reports INSUFFICIENT_PERMISSIONS;
 *  - the management layout redirects them to the change form, and exempts
 *    only that page (so the redirect cannot loop);
 *  - the self-service change-password route stays reachable for them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'forced-pw-test-secret-0123456789abcdef0123456789abcde';

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    adminUser: { findUnique: vi.fn() },
    adminSession: { updateMany: vi.fn(async () => ({ count: 1 })) },
    product: { findMany: vi.fn(async () => []) },
    siteSetting: { findMany: vi.fn(async () => []) },
  };
  return { prismaMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

const SRC = join(process.cwd(), 'src');
const read = (p: string): string => readFileSync(join(SRC, p), 'utf8');

function adminRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    role: 'super_admin',
    status: 'active',
    sessionsInvalidBefore: null,
    mustChangePassword: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.adminUser.findUnique.mockResolvedValue(adminRow());
  prismaMock.product.findMany.mockResolvedValue([]);
});

describe('a forced admin is zeroed — the gate is not weakened', () => {
  it('verifyAdminJwt empties perms when mustChangePassword is set', async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue(adminRow({ mustChangePassword: true }));
    const { issueAdminJwt, verifyAdminJwt } = await import('@/lib/jwt');

    const token = await issueAdminJwt('adm-1', 'oil@test.local', 'super_admin', [
      'products:read',
      'orders:write',
    ]);
    const payload = await verifyAdminJwt(token);

    expect(payload).not.toBeNull();
    // The token really did carry products:read — it was stripped.
    expect(payload!.perms).toEqual([]);
  });

  it('marks passwordChangeRequired so callers can report the real reason', async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue(adminRow({ mustChangePassword: true }));
    const { issueAdminJwt, verifyAdminJwt } = await import('@/lib/jwt');
    const token = await issueAdminJwt('adm-1', 'oil@test.local', 'super_admin', ['products:read']);

    expect((await verifyAdminJwt(token))!.passwordChangeRequired).toBe(true);
  });

  it('leaves an ordinary admin untouched', async () => {
    const { issueAdminJwt, verifyAdminJwt } = await import('@/lib/jwt');
    const token = await issueAdminJwt('adm-1', 'oil@test.local', 'super_admin', ['products:read']);
    const payload = await verifyAdminJwt(token);

    expect(payload!.perms).toContain('products:read');
    expect(payload!.passwordChangeRequired).toBeUndefined();
  });
});

describe('checkPermission reports the truth', () => {
  it('answers PASSWORD_CHANGE_REQUIRED, not INSUFFICIENT_PERMISSIONS', async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue(adminRow({ mustChangePassword: true }));
    const { issueAdminJwt } = await import('@/lib/jwt');
    const { checkPermission } = await import('@/lib/rbac');

    const token = await issueAdminJwt('adm-1', 'oil@test.local', 'super_admin', [
      'products:read',
    ]);
    const res = await checkPermission(token, 'products:read');

    expect(res.allowed).toBe(false);
    expect(res.error).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('still answers INSUFFICIENT_PERMISSIONS for a real role denial', async () => {
    // A finance_viewer asking for products:read — nothing to do with
    // passwords. This must not be swept up by the new branch. The DB row's
    // role must match the token's, or verifyAdminJwt's stale-role guard
    // rejects it first and we'd be asserting on UNAUTHENTICATED.
    prismaMock.adminUser.findUnique.mockResolvedValue(adminRow({ role: 'finance_viewer' }));
    const { issueAdminJwt } = await import('@/lib/jwt');
    const { checkPermission } = await import('@/lib/rbac');

    const token = await issueAdminJwt('adm-2', 'fin@test.local', 'finance_viewer', [
      'orders:read',
    ]);
    const res = await checkPermission(token, 'products:read');

    expect(res.allowed).toBe(false);
    expect(res.error).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('still admits a permitted admin', async () => {
    const { issueAdminJwt } = await import('@/lib/jwt');
    const { checkPermission } = await import('@/lib/rbac');

    const token = await issueAdminJwt('adm-1', 'oil@test.local', 'super_admin', [
      'products:read',
    ]);
    expect((await checkPermission(token, 'products:read')).allowed).toBe(true);
  });
});

describe('the products route surfaces the honest code', () => {
  it('403 PASSWORD_CHANGE_REQUIRED for a forced super_admin', async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue(adminRow({ mustChangePassword: true }));
    const { issueAdminJwt } = await import('@/lib/jwt');
    const { GET } = (await import('@/app/api/v1/admin/products/route')) as Record<string, unknown>;

    const token = await issueAdminJwt('adm-1', 'oil@test.local', 'super_admin', [
      'products:read',
    ]);
    const req = new NextRequest('http://localhost/api/v1/admin/products', {
      headers: { cookie: `nk_admin_at=${token}` },
    });
    const res = (await (GET as (r: NextRequest) => Promise<Response>)(req)) as Response;

    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('PASSWORD_CHANGE_REQUIRED');
    // And it really did refuse to leak the catalog.
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });
});

describe('the management layout redirects instead of stranding', () => {
  const layout = (): string => read('app/management/layout.tsx');

  it('checks the DB-reported mustChangePassword flag', () => {
    // /auth/admin/me is auth-only, which is the only reason this check can
    // work for an admin holding zero permissions.
    expect(layout()).toMatch(/\/api\/v1\/auth\/admin\/me/);
    expect(layout()).toMatch(/mustChangePassword/);
  });

  it('redirects to the change-password form', () => {
    expect(layout()).toMatch(/FORCED_PASSWORD_CHANGE_PATH\s*=\s*'\/management\/settings\?tab=security'/);
    expect(layout()).toMatch(/router\.replace\(FORCED_PASSWORD_CHANGE_PATH\)/);
  });

  it('exempts only the settings page, so the redirect cannot loop', () => {
    expect(layout()).toMatch(
      /FORCED_CHANGE_EXEMPT_PATH\s*=\s*'\/management\/settings'/,
    );
    expect(layout()).toMatch(/pathname === FORCED_CHANGE_EXEMPT_PATH/);
  });

  it('never runs on the login page', () => {
    expect(layout()).toMatch(/if \(!isAuthenticated \|\| isPublic\) return;/);
  });

  it('a failed check never locks anyone out (the 403 stays the backstop)', () => {
    // The catch is deliberately empty and documented; assert it is there so
    // someone cannot "fix" a redirect that never fires into a hard block.
    expect(layout()).toMatch(/\.catch\(\(\) => \{[\s\S]{0,200}?\n {6}\}\);/);
  });

  it('/auth/admin/me really is auth-only, not permission-gated', () => {
    const me = read('app/api/v1/auth/admin/me/route.ts');
    expect(me).not.toMatch(/checkPermission/);
    expect(me).toMatch(/mustChangePassword/);
  });
});

describe('the escape route stays open', () => {
  it('change-password requires no permission, so a forced admin can escape', () => {
    const route = read('app/api/v1/auth/admin/change-password/route.ts');
    expect(route).not.toMatch(/checkPermission/);
    expect(route).toMatch(/verifyAdminJwt/);
  });

  it('completing the change clears the flag and revokes sessions', () => {
    // If this ever stopped clearing the flag, the admin would change their
    // password and STILL be locked out — an unrecoverable state.
    const auth = read('api/adminAuth.ts');
    const fn = auth.slice(auth.indexOf('export async function changeAdminPassword'));
    expect(fn.slice(0, 2000)).toMatch(/mustChangePassword: false/);
    expect(fn.slice(0, 2000)).toMatch(/revokedAt: new Date\(\)/);
  });

  it('the settings page is reachable without a permission gate', () => {
    const settings = read('app/management/settings/page.tsx');
    expect(settings).not.toMatch(/checkPermission/);
    // The form must render inside the security tab, not behind a flag.
    expect(settings).toMatch(/activeTab === 'security' && <SecuritySettings/);
    // The form must render in the rendered branch, i.e. after the loading
    // early-return — and that branch's .finally() clears loading even when
    // the security-settings fetch 403s, so a forced admin still reaches it.
    const security = settings.slice(settings.indexOf('function SecuritySettings'));
    const rendered = security.slice(security.indexOf('if (loading)'));
    expect(rendered).toMatch(/<ChangePassword \/>/);
    expect(security.slice(0, security.indexOf('if (loading)'))).toMatch(/\.finally\(\(\) => \{/);
  });
});

describe('drift guard — the matrix still never exercises this state', () => {
  it('admin-authz-matrix.test.ts pins mustChangePassword: false', () => {
    // If someone widens the matrix to cover this state they should DELETE
    // this test and say so in the header; leaving it silently would make
    // the matrix look like coverage it isn't.
    expect(read('../tests/admin-authz-matrix.test.ts')).toMatch(
      /mustChangePassword: false/,
    );
  });
});