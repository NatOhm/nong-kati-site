/**
 * The public origin every absolute URL is built from (2026-11-02).
 *
 * Production was serving `http://localhost:4200` in every canonical, og:url and
 * sitemap <loc>: NEXT_PUBLIC_SITE_URL is inlined at BUILD time, so a dev value
 * in the build environment is frozen into the shipped bundle. `publicOrigin()`
 * used to pass any non-empty value straight through, and fall back to a
 * vercel.app domain nobody visits.
 *
 * These gates fail on that behaviour. They are the reason a localhost build can
 * no longer be published: the fallback is the real storefront, and a loopback
 * value is treated as unset rather than trusted.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { publicOrigin } from '@/lib/siteConfig';

const ORIGINAL = process.env['NEXT_PUBLIC_SITE_URL'];

function withSiteUrl(value: string | undefined): string {
  if (value === undefined) delete process.env['NEXT_PUBLIC_SITE_URL'];
  else process.env['NEXT_PUBLIC_SITE_URL'] = value;
  return publicOrigin();
}

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env['NEXT_PUBLIC_SITE_URL'];
  else process.env['NEXT_PUBLIC_SITE_URL'] = ORIGINAL;
});

describe('publicOrigin', () => {
  it('uses the configured production origin', () => {
    expect(withSiteUrl('https://nongkatistore.com')).toBe('https://nongkatistore.com');
  });

  it('strips trailing slashes (no double slash in emitted URLs)', () => {
    expect(withSiteUrl('https://nongkatistore.com//')).toBe('https://nongkatistore.com');
  });

  it('falls back to the production origin when nothing is configured', () => {
    expect(withSiteUrl(undefined)).toBe('https://nongkatistore.com');
    expect(withSiteUrl('')).toBe('https://nongkatistore.com');
    expect(withSiteUrl('   ')).toBe('https://nongkatistore.com');
  });

  it('never emits a loopback origin, even when one is configured', () => {
    // The exact value production was built with on 2026-11-02.
    for (const loopback of [
      'http://localhost:4200',
      'http://localhost',
      'http://127.0.0.1:3000',
      'http://0.0.0.0:8080',
      'http://[::1]:4000',
      'HTTP://LOCALHOST:4200',
    ]) {
      expect(withSiteUrl(loopback), loopback).toBe('https://nongkatistore.com');
    }
  });
});
