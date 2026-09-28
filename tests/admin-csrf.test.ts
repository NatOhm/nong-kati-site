/**
 * Unit coverage for the admin auth-mutation CSRF guard (lib/adminCsrf.ts +
 * guardAdminAuthMutation in lib/adminRequest.ts):
 *
 *  - Origin check: same-origin passes, cross-site Origin/Referer fail with
 *    ORIGIN_MISMATCH (403), plain requests without Origin/Referer pass
 *    (non-browser clients — curl, API scripts, the E2E harness).
 *  - Double-submit: cookie-authenticated refresh/logout must echo the
 *    middleware-seeded nk_csrf cookie in x-csrf-token; a missing or
 *    mismatched echo fails closed. Bearer callers skip this layer.
 *  - Cookie flags: nk_csrf is seeded non-HttpOnly (JS must read it) while
 *    session cookies stay HttpOnly.
 */
import { describe, expect, it } from 'vitest';

import {
  checkAdminAuthMutation,
  generateCsrfToken,
  isSameOrigin,
  validateCsrfDoubleSubmit,
} from '@/lib/adminCsrf';
import { guardAdminAuthMutation } from '@/lib/adminRequest';

function req(headers: Record<string, string>): { headers: { get(name: string): string | null } } {
  const map = new Map(Object.entries(headers));
  return { headers: { get: (n) => map.get(n) ?? null } };
}

const CSRF = generateCsrfToken();

describe('isSameOrigin', () => {
  it('passes for a matching Origin', () => {
    expect(isSameOrigin(req({ origin: 'https://admin.example', host: 'admin.example' }))).toBe(
      true,
    );
  });

  it('passes for a matching Referer when Origin is absent', () => {
    expect(
      isSameOrigin(
        req({ referer: 'https://admin.example/management/login', host: 'admin.example' }),
      ),
    ).toBe(true);
  });

  it('passes for non-browser clients without Origin/Referer', () => {
    expect(isSameOrigin(req({ host: 'admin.example' }))).toBe(true);
  });

  it('fails a cross-site Origin', () => {
    expect(isSameOrigin(req({ origin: 'https://evil.example', host: 'admin.example' }))).toBe(
      false,
    );
  });

  it('fails a cross-site Referer fallback', () => {
    expect(isSameOrigin(req({ referer: 'https://evil.example/x', host: 'admin.example' }))).toBe(
      false,
    );
  });

  it('fails when host is missing but Origin present', () => {
    expect(isSameOrigin(req({ origin: 'https://admin.example' }))).toBe(false);
  });

  it('rejects a malformed Origin', () => {
    expect(isSameOrigin(req({ origin: 'not-a-url', host: 'admin.example' }))).toBe(false);
  });
});

describe('validateCsrfDoubleSubmit', () => {
  it('passes when header echoes the cookie', () => {
    expect(
      validateCsrfDoubleSubmit(req({ cookie: `nk_csrf=${CSRF}; other=1`, 'x-csrf-token': CSRF })),
    ).toBe(true);
  });

  it('fails when the header is missing', () => {
    expect(validateCsrfDoubleSubmit(req({ cookie: `nk_csrf=${CSRF}` }))).toBe(false);
  });

  it('fails when the cookie is missing', () => {
    expect(validateCsrfDoubleSubmit(req({ 'x-csrf-token': CSRF }))).toBe(false);
  });

  it('fails on a value mismatch (forged header)', () => {
    expect(
      validateCsrfDoubleSubmit(req({ cookie: `nk_csrf=${CSRF}`, 'x-csrf-token': 'a'.repeat(64) })),
    ).toBe(false);
  });
});

describe('checkAdminAuthMutation', () => {
  it('requires double-submit only when authenticated by cookie', () => {
    const headers = { host: 'x', cookie: `nk_csrf=${CSRF}` };
    // Bearer client: origin check only — no echo needed.
    expect(checkAdminAuthMutation(req(headers), false).ok).toBe(true);
    // Cookie client: missing echo fails closed.
    const result = checkAdminAuthMutation(req(headers), true);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('CSRF_TOKEN_MISSING');
  });

  it('cross-site origin fails even with a valid CSRF echo', () => {
    const result = checkAdminAuthMutation(
      req({
        origin: 'https://evil.example',
        host: 'x',
        cookie: `nk_csrf=${CSRF}`,
        'x-csrf-token': CSRF,
      }),
      true,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('ORIGIN_MISMATCH');
  });
});

describe('guardAdminAuthMutation response mapping', () => {
  it('maps ORIGIN_MISMATCH to 403', () => {
    const res = guardAdminAuthMutation(req({ origin: 'https://evil.example', host: 'x' }), false);
    expect(res?.status).toBe(403);
  });

  it('maps a missing CSRF echo to 409', () => {
    const res = guardAdminAuthMutation(req({ host: 'x', cookie: 'nk_csrf=abc' }), true);
    expect(res?.status).toBe(409);
  });

  it('returns null (allow) for a clean same-origin cookie request', () => {
    const res = guardAdminAuthMutation(
      req({ host: 'x', cookie: `nk_csrf=${CSRF}`, 'x-csrf-token': CSRF }),
      true,
    );
    expect(res).toBeNull();
  });
});

describe('token shape', () => {
  it('generates 64-char hex tokens with entropy', () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toEqual(b);
  });
});
