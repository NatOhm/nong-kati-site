/**
 * Recently viewed products (mobile search sheet, 2026-11-06).
 *
 * The sheet shows what the visitor opened last. The list lives in
 * localStorage, which means every read can meet garbage (older build, devtools,
 * a half-written value), and every write can meet a browser that refuses to
 * store (private mode, quota). Neither may break the sheet.
 */
import { describe, expect, it } from 'vitest';

import { readRecentProducts, withRecent, type RecentProduct } from '@/lib/recentlyViewed';

const p = (slug: string): RecentProduct => ({
  slug,
  name: `Product ${slug}`,
  imageUrl: null,
  price: 100,
});

describe('withRecent', () => {
  it('puts the newest product first', () => {
    expect(withRecent([p('b'), p('a')], p('c')).map((x) => x.slug)).toEqual(['c', 'b', 'a']);
  });

  it('moves a revisited product to the front instead of duplicating it', () => {
    expect(withRecent([p('b'), p('a'), p('c')], p('a')).map((x) => x.slug)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('keeps at most 8 entries', () => {
    let list: RecentProduct[] = [];
    for (let i = 0; i < 12; i++) list = withRecent(list, p(`p${i}`));
    expect(list).toHaveLength(8);
    expect(list[0]?.slug).toBe('p11');
  });
});

describe('storage guards (node, no window)', () => {
  it('reads as empty instead of throwing', () => {
    expect(readRecentProducts()).toEqual([]);
  });
});
