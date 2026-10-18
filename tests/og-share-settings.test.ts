/**
 * Share-preview copy (SiteSetting key 'ogShare') — the admin-editable weblink
 * (OG) card + homepage link preview, plus the product short description that
 * drives og:description on product link previews.
 *
 * lib/ogShareSettings is the single conversion point: GET/PUT
 * /api/v1/admin/settings/og-share, getOgShareSettings (opengraph-image and
 * homepage generateMetadata) and the /management/og-share editor all run
 * through it. The wiring section at the bottom locks every consumer to it —
 * a refactor that unhooks a consumer (or re-hardcodes the card copy) fails here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OG_SHARE,
  OG_SHARE_CHANNEL_MAX,
  OG_SHARE_HEADING_MAX,
  OG_SHARE_META_DESC_MAX,
  OG_SHARE_META_TITLE_MAX,
  OG_SHARE_PILL_MAX,
  PRODUCT_SHORT_DESCRIPTION_MAX,
  normalizeOgShareBody,
  normalizeProductShortDescription,
  parseOgShare,
} from '@/lib/ogShareSettings';

const SRC = join(process.cwd(), 'src');
const read = (p: string): string => readFileSync(join(SRC, p), 'utf8');

describe('weblink card — built-in defaults', () => {
  it('reproduce the copy that shipped hardcoded in opengraph-image + homepage meta', () => {
    expect(DEFAULT_OG_SHARE.headingLine1).toBe('แอคดูหนัง ซีรีส์');
    expect(DEFAULT_OG_SHARE.headingLine2).toBe('ส่งถึงอีเมลทันที');
    expect(DEFAULT_OG_SHARE.channels).toBe('Netflix · Spotify · YouTube · HBO Max');
    expect(DEFAULT_OG_SHARE.pill1).toBe('โอนเงิน · ตรวจสลิป');
    expect(DEFAULT_OG_SHARE.pill2).toBe('ส่งโค้ดทันที');
    expect(DEFAULT_OG_SHARE.ogTitle).toContain('Nong-Kati — ');
    expect(DEFAULT_OG_SHARE.ogDescription).toContain('โอนเงิน');
  });

  it('fit inside their own limits, so the defaults can never be silently over-quota', () => {
    expect(DEFAULT_OG_SHARE.headingLine1.length).toBeLessThanOrEqual(OG_SHARE_HEADING_MAX);
    expect(DEFAULT_OG_SHARE.headingLine2.length).toBeLessThanOrEqual(OG_SHARE_HEADING_MAX);
    expect(DEFAULT_OG_SHARE.channels.length).toBeLessThanOrEqual(OG_SHARE_CHANNEL_MAX);
    expect(DEFAULT_OG_SHARE.pill1.length).toBeLessThanOrEqual(OG_SHARE_PILL_MAX);
    expect(DEFAULT_OG_SHARE.pill2.length).toBeLessThanOrEqual(OG_SHARE_PILL_MAX);
    expect(DEFAULT_OG_SHARE.ogTitle.length).toBeLessThanOrEqual(OG_SHARE_META_TITLE_MAX);
    expect(DEFAULT_OG_SHARE.ogDescription.length).toBeLessThanOrEqual(OG_SHARE_META_DESC_MAX);
  });

  it('keep the verified fulfilment wording, never a fabricated time promise', () => {
    // Same audit rule as the trust badges: promise the process, not a speed.
    const copy = `${DEFAULT_OG_SHARE.headingLine1} ${DEFAULT_OG_SHARE.headingLine2} ${DEFAULT_OG_SHARE.ogDescription}`;
    expect(copy).toContain('ยืนยัน');
    expect(copy).not.toMatch(/60\s*วิ/);
  });
});

describe('weblink card — parseOgShare', () => {
  it('unusable JSON / arrays / missing row falls back to the defaults', () => {
    expect(parseOgShare('not-json')).toEqual(DEFAULT_OG_SHARE);
    expect(parseOgShare('[1, 2]')).toEqual(DEFAULT_OG_SHARE);
    expect(parseOgShare(null)).toEqual(DEFAULT_OG_SHARE);
    expect(parseOgShare(undefined)).toEqual(DEFAULT_OG_SHARE);
    expect(parseOgShare('{}')).toEqual(DEFAULT_OG_SHARE);
  });

  it('a blank or non-string field falls back per-field instead of blanking the card', () => {
    const parsed = parseOgShare(
      JSON.stringify({ headingLine1: '   ', ogTitle: 42, pill1: '' }),
    );
    expect(parsed).toEqual(DEFAULT_OG_SHARE);
  });

  it('keeps edited copy per-field, trimmed, leaving the rest at their defaults', () => {
    const parsed = parseOgShare(JSON.stringify({ pill1: '  โอนไว · ตรวจเร็ว  ' }));
    expect(parsed.pill1).toBe('โอนไว · ตรวจเร็ว');
    expect(parsed.headingLine1).toBe(DEFAULT_OG_SHARE.headingLine1);
    expect(parsed.ogTitle).toBe(DEFAULT_OG_SHARE.ogTitle);
  });

  it('caps overlong values at the documented limits', () => {
    const parsed = parseOgShare(
      JSON.stringify({
        headingLine1: 'x'.repeat(OG_SHARE_HEADING_MAX * 3),
        channels: 'c'.repeat(OG_SHARE_CHANNEL_MAX * 2),
        ogTitle: 't'.repeat(OG_SHARE_META_TITLE_MAX * 2),
        ogDescription: 'd'.repeat(OG_SHARE_META_DESC_MAX * 2),
      }),
    );
    expect(parsed.headingLine1).toHaveLength(OG_SHARE_HEADING_MAX);
    expect(parsed.channels).toHaveLength(OG_SHARE_CHANNEL_MAX);
    expect(parsed.ogTitle).toHaveLength(OG_SHARE_META_TITLE_MAX);
    expect(parsed.ogDescription).toHaveLength(OG_SHARE_META_DESC_MAX);
  });

  it('strips control characters but keeps Thai text and the · separators', () => {
    const parsed = parseOgShare(
      JSON.stringify({ headingLine1: 'สวัสดี\u0000\u0007ครับ', channels: 'Netflix · Spotify' }),
    );
    expect(parsed.headingLine1).toBe('สวัสดีครับ');
    expect(parsed.channels).toBe('Netflix · Spotify');
  });
});

describe('weblink card — normalizeOgShareBody (PUT path)', () => {
  it('ignores unknown keys so junk in the payload cannot leak into settings', () => {
    const next = normalizeOgShareBody({
      headingLine1: 'ใหม่',
      __proto__: 'x',
      isAdmin: true,
      nested: { a: 1 },
    });
    expect(next).toEqual({ ...DEFAULT_OG_SHARE, headingLine1: 'ใหม่' });
  });

  it('round-trips save → parse: GET after PUT returns exactly what the card renders', () => {
    const next = normalizeOgShareBody({
      headingLine1: '  ดูหนัง 4K  ',
      headingLine2: 'ส่งไวถึงเมล',
      channels: 'Netflix · iQIYYI',
      pill1: 'โอนเงิน',
      pill2: 'รับโค้ดเลย',
      ogTitle: 'Nong-Kati — ดูหนัง 4K ราคาดี',
      ogDescription: 'โอนเงินแนบสลิป ทีมงานยืนยันแล้วส่งโค้ดถึงอีเมล',
    });
    const reparsed = parseOgShare(JSON.stringify(next));
    expect(reparsed).toEqual(next);
    expect(reparsed.headingLine1).toBe('ดูหนัง 4K');
    expect(reparsed.ogDescription).toContain('ยืนยัน');
  });

  it('a fully blank body yields the shipped defaults, not empty strings', () => {
    expect(normalizeOgShareBody({})).toEqual(DEFAULT_OG_SHARE);
    expect(
      normalizeOgShareBody({ headingLine1: '', ogTitle: '   ', ogDescription: '' }),
    ).toEqual(DEFAULT_OG_SHARE);
  });
});

describe('product short description — og:description on product links', () => {
  it('trims, strips control chars and collapses whitespace', () => {
    expect(normalizeProductShortDescription('  ส่งโค้ด  ทันที \n')).toBe('ส่งโค้ด ทันที');
    expect(normalizeProductShortDescription('a\u0000b\u0007c')).toBe('abc');
  });

  it('caps at PRODUCT_SHORT_DESCRIPTION_MAX', () => {
    const out = normalizeProductShortDescription('y'.repeat(PRODUCT_SHORT_DESCRIPTION_MAX * 3));
    expect(out).toHaveLength(PRODUCT_SHORT_DESCRIPTION_MAX);
  });

  it('empties to "" so the API maps it to null and the fallback copy returns', () => {
    expect(normalizeProductShortDescription('   ')).toBe('');
    expect(normalizeProductShortDescription('\u0000\u0007')).toBe('');
    expect(PRODUCT_SHORT_DESCRIPTION_MAX).toBe(160);
  });
});

// ─── Wiring — every consumer stays hooked to the shared lib ────────────────

describe('weblink card — consumers are wired, not re-hardcoded', () => {
  it('opengraph-image renders from getOgShareSettings and is not prerendered', () => {
    const src = read('app/opengraph-image.tsx');
    expect(src).toContain("from '@/lib/data'");
    expect(src).toContain('getOgShareSettings');
    expect(src).toContain("export const dynamic = 'force-dynamic'");
    // The copy now flows through settings — the literals are gone from the card.
    expect(src).not.toContain('Netflix · Spotify · YouTube · HBO Max');
    expect(src).not.toContain('>โอนเงิน · ตรวจสลิป<');
  });

  it('homepage metadata reads ogTitle/ogDescription through generateMetadata', () => {
    const src = read('app/page.tsx');
    expect(src).toContain('export async function generateMetadata');
    expect(src).toContain('getOgShareSettings');
    expect(src).toContain('og.ogTitle');
    expect(src).toContain('og.ogDescription');
    // The static openGraph block with hardcoded copy must be gone.
    expect(src).not.toContain("title: 'Nong-Kati — แอคดูหนัง ซีรีส์ ส่งถึงอีเมลทันที'");
  });

  it('admin API guards GET with settings:read and PUT with settings:write', () => {
    const src = read('app/api/v1/admin/settings/og-share/route.ts');
    expect(src).toContain("key: 'ogShare'");
    expect(src).toMatch(/checkPermission\(token, 'settings:read'\)/);
    expect(src).toMatch(/checkPermission\(token, 'settings:write'\)/);
    // Same no-op-write behaviour as the trust-badges route.
    expect(src).toContain('sameSettings(next, currentSettings)');
  });

  it('the editor page exists and the admin nav links to it', () => {
    const page = read('app/management/og-share/page.tsx');
    expect(page).toContain("'/api/v1/admin/settings/og-share'");
    expect(page).toContain("method: 'PUT'");
    const nav = read('lib/adminNav.ts');
    expect(nav).toContain("href: '/management/og-share'");
  });

  it('products admin API both returns and accepts shortDescription', () => {
    const list = read('app/api/v1/admin/products/route.ts');
    expect(list).toContain('shortDescription: p.shortDescription');
    expect(list).toContain('normalizeProductShortDescription');
    const update = read('app/api/v1/admin/products/[id]/route.ts');
    expect(update).toContain("b['shortDescription']");
    expect(update).toContain('normalizeProductShortDescription');
    // …and the editor actually sends it (create + edit share one payload).
    const editor = read('app/management/products/page.tsx');
    expect(editor).toContain('shortDescription: shortDescription.trim() || null');
    expect(editor).toContain('PRODUCT_SHORT_DESCRIPTION_MAX');
  });
});
