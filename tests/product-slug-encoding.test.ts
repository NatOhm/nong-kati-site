/**
 * Non-ASCII product slugs (client report 2026-11-02: "กดสินค้าบางอันเข้าไปดู
 * แบบละเอียดไม่ได้").
 *
 * Next percent-encodes every dynamic segment before the page sees it
 * (getDynamicParam → encodeURIComponent), so a Thai slug reached
 * getProductBySlug() still escaped and matched no row → notFound() → 404.
 * ASCII slugs were unaffected, which is why only some products broke.
 *
 * The source gates below keep the decode from being refactored away: a passing
 * unit test on the helper proves nothing if the page stops calling it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { decodeSlugParam } from '@/utils/slugParam';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');

describe('decodeSlugParam', () => {
  it('turns the percent-encoded param back into the stored slug', () => {
    // Exactly what getDynamicParam hands the page for
    // /product/microsoft-365-30-วัน-ytbr.
    expect(decodeSlugParam('microsoft-365-30-%E0%B8%A7%E0%B8%B1%E0%B8%99-ytbr')).toBe(
      'microsoft-365-30-วัน-ytbr',
    );
    expect(decodeSlugParam('%E0%B9%84%E0%B8%A1%E0%B9%88%E0%B8%95%E0%B9%88%E0%B8%AD-zli2')).toBe(
      'ไม่ต่อ-zli2',
    );
  });

  it('leaves ASCII slugs untouched', () => {
    expect(decodeSlugParam('bilibili-premium-xecl')).toBe('bilibili-premium-xecl');
  });

  it('returns malformed input instead of throwing (a 404, never a 500)', () => {
    expect(decodeSlugParam('100%-off')).toBe('100%-off');
    expect(decodeSlugParam('%E0%B8')).toBe('%E0%B8');
  });
});

describe('the product detail route decodes before it queries', () => {
  const page = read('src/app/product/[slug]/page.tsx');

  it('decodes the param in both generateMetadata and the page', () => {
    expect(page.match(/decodeSlugParam\(rawSlug\)/g)?.length, 'both entry points').toBe(2);
    expect(page).toContain("const { slug: rawSlug } = await params");
    // No raw param may reach the lookup (the exact bug that shipped):
    expect(page).not.toContain('getProductBySlug(rawSlug)');
  });

  it('keeps canonical/OpenGraph URLs percent-encoded', () => {
    expect(page).toContain('/product/${encodeURIComponent(slug)}');
    expect(page, 'raw Thai in a canonical URL').not.toContain('/product/${slug}`');
  });
});

describe('sibling routes with the same trap', () => {
  it('the category catch-all decodes every segment', () => {
    const page = read('src/app/category/[...slug]/page.tsx');
    expect(page.match(/slug\.map\(decodeSlugParam\)\.join\('\/'\)/g)?.length).toBe(2);
  });

  it('the sitemap emits encoded product URLs', () => {
    expect(read('src/app/sitemap.ts')).toContain('/product/${encodeURIComponent(slug)}');
  });
});
