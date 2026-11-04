/**
 * Admin entry point must be a door, not a 404 (4 พ.ย. 2569).
 *
 * Production served `/management/` → 308 → `/management` → **404**: there was
 * `app/management/layout.tsx` and every sub-route, but no root page. The spec
 * treats that URL as the admin entry (02-user-flow "Entry: /management/ →
 * redirect to /management/login/"; 03-IA "/management/ … Admin Dashboard"), so
 * anyone who typed or bookmarked the documented URL got a dead page while
 * `/management/login` worked. Nobody noticed because every admin link in the
 * app points at a sub-route.
 *
 * The fix is a redirect-only page. That only stays correct while three things
 * hold, so each gets a check:
 *
 *   M1  the route exists at all,
 *   M2  it sends the visitor to `/management/login` and nothing else — the
 *       login page owns the auth decision, so a second entry rule cannot
 *       drift from it,
 *   M3  it renders no admin markup: a redirect-only page cannot flash the
 *       dashboard shell to a signed-out visitor,
 *   M4  `/management/login` still bounces a live session to the dashboard,
 *       which is what makes "or the dashboard when authenticated" true
 *       without a second auth check in the entry page.
 *
 * Static source assertions, like the sibling route gates: rendering an
 * authenticated admin flow would need a real session and a database.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
const ENTRY = path.join(ROOT, 'src', 'app', 'management', 'page.tsx');
const LOGIN = path.join(ROOT, 'src', 'app', 'management', 'login', 'page.tsx');

const source = readFileSync(ENTRY, 'utf8');
const loginSource = readFileSync(LOGIN, 'utf8');

describe('/management admin entry', () => {
  it('M1: the entry route exists', () => {
    expect(source.length).toBeGreaterThan(0);
    expect(source).toMatch(/export default function/);
  });

  it('M2: it redirects to the login gate and nowhere else', () => {
    expect(source).toMatch(/from 'next\/navigation'/);
    expect(source).toMatch(/redirect\('\/management\/login'\)/);
    // A second admin destination here would duplicate the auth decision.
    expect(source).not.toMatch(/redirect\('\/management\/(?!login)/);
    expect(source).not.toMatch(/router\.(push|replace)/);
  });

  it('M3: it renders no admin markup (redirect only)', () => {
    expect(source).not.toMatch(/'use client'/);
    expect(source).not.toMatch(/<[A-Za-z][A-Za-z0-9.]*[\s/>]/);
    expect(source).not.toMatch(/@\/components\/admin/);
  });

  it('M4: login still hands a live session to the dashboard', () => {
    expect(loginSource).toMatch(/\/api\/v1\/auth\/admin\/me/);
    expect(loginSource).toMatch(/\/management\/dashboard/);
  });
});
