/**
 * Drawer categories (client report 2026-11-02: "3 ขีดไม่ซิงก์หมวดหมู่").
 *
 * The drawer hardcoded four category links whose slugs — movie-series, music,
 * chinese-apps, editing — exist in no category row, so every one of them
 * 404'd and the drawer never followed the catalogue. It now reads
 * /api/v1/categories, which is the same reader the homepage cards use.
 *
 * These gates keep the list from drifting back to hand-written slugs.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');

describe('mobile drawer categories', () => {
  const sidebar = read('src/components/layout/FacebookSidebar.tsx');

  it('hardcodes no category link — the list comes from the API', () => {
    expect(sidebar, 'a literal category href returned').not.toMatch(/\/category\/[a-z0-9-]+/);
    expect(sidebar).toContain("fetch('/api/v1/categories')");
  });

  it('builds each category href from the API response', () => {
    expect(sidebar).toContain('href: `/category/${c.slug}`');
    expect(sidebar).toContain("fetch('/api/v1/categories')");
  });
});

describe('GET /api/v1/categories', () => {
  const route = read('src/app/api/v1/categories/route.ts');

  it('serves the same tree the homepage cards render', () => {
    expect(route).toContain('getCategoriesWithProductCounts');
    expect(route).toContain('{ categories }');
  });

  it('is rate-limited (the rule already existed before the route did)', () => {
    expect(read('src/lib/rateLimit.ts')).toContain("route: '/api/v1/categories'");
  });
});
