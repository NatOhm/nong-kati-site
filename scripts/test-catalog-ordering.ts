/**
 * Adversarial test for getCatalogProducts global ordering.
 * Run: npx tsx scripts/test-catalog-ordering.ts
 */
import { getCatalogProducts } from '../src/lib/data';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log('  PASS ' + msg);
  } else {
    console.error('  FAIL ' + msg);
    failures++;
  }
}

function minPrices(items: Awaited<ReturnType<typeof getCatalogProducts>>['products']) {
  return items.map((p) =>
    p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : null,
  );
}
function names(items: Awaited<ReturnType<typeof getCatalogProducts>>['products']) {
  return items.map((p) => p.name);
}

async function main() {
  const LIMIT = 5; // small page size to force many page boundaries with 37 products

  // ── price-asc: full ordering across ALL pages ──
  {
    const pages: Awaited<ReturnType<typeof getCatalogProducts>>['products'][] = [];
    let page = 1;
    let total = -1;
    for (;;) {
      const r = await getCatalogProducts('', undefined, 'price-asc', page, LIMIT);
      total = r.total;
      if (r.products.length === 0) break;
      pages.push(r.products);
      page++;
      if (page > 20) break; // safety
    }
    const flat = pages.flat();
    console.log(`price-asc: ${flat.length} products over ${pages.length} pages (total=${total})`);
    assert(total === 37, `total is 37 (got ${total})`);
    assert(flat.length === total, 'all pages retrieved');

    const prices = minPrices(flat);
    const nonNull = prices.filter((p): p is number => p !== null);
    assert(
      prices.lastIndexOf(null) === -1 || prices.indexOf(null) === prices.length - prices.filter((p) => p === null).length,
      'variant-less products (if any) sink to the bottom',
    );
    let sorted = true;
    for (let i = 1; i < nonNull.length; i++) if (nonNull[i]! < nonNull[i - 1]!) sorted = false;
    assert(sorted, 'non-null prices non-decreasing across ALL page boundaries');

    // Boundary check: last item of page 1 precedes first item of page 2
    if (pages.length >= 2) {
      const lastP1 = minPrices(pages[0]).at(-1);
      const firstP2 = minPrices(pages[1])[0];
      assert(
        lastP1 !== null && firstP2 !== null && lastP1 <= firstP2,
        `page1 last (${lastP1}) <= page2 first (${firstP2})`,
      );
    }
  }

  // ── price-desc: reverse continuity ──
  {
    const r1 = await getCatalogProducts('', undefined, 'price-desc', 1, LIMIT);
    const r2 = await getCatalogProducts('', undefined, 'price-desc', 2, LIMIT);
    const lastP1 = minPrices(r1.products).at(-1);
    const firstP2 = minPrices(r2.products)[0];
    console.log(`price-desc: p1 last=${lastP1} p2 first=${firstP2}`);
    assert(
      lastP1 !== null && firstP2 !== null && lastP1! >= firstP2!,
      `page1 last (${lastP1}) >= page2 first (${firstP2})`,
    );
    const flat = [...r1.products, ...r2.products];
    const nn = minPrices(flat).filter((p): p is number => p !== null);
    let nonIncreasing = true;
    for (let i = 1; i < nn.length; i++) if (nn[i]! > nn[i - 1]!) nonIncreasing = false;
    assert(nonIncreasing, 'desc order non-increasing across boundary');
  }

  // ── determinism: same request twice → identical order ──
  {
    const a = await getCatalogProducts('', undefined, 'price-asc', 1, LIMIT);
    const b = await getCatalogProducts('', undefined, 'price-asc', 1, LIMIT);
    assert(JSON.stringify(names(a.products)) === JSON.stringify(names(b.products)), 'same request → identical order');
  }

  // ── name-asc is Thai-collated and deterministic ──
  {
    const a = await getCatalogProducts('', undefined, 'name-asc', 1, LIMIT);
    const b = await getCatalogProducts('', undefined, 'name-asc', 1, LIMIT);
    assert(JSON.stringify(names(a.products)) === JSON.stringify(names(b.products)), 'name-asc deterministic');
    const all = [];
    let page = 1;
    for (;;) {
      const r = await getCatalogProducts('', undefined, 'name-asc', page, LIMIT);
      if (r.products.length === 0) break;
      all.push(...names(r.products));
      page++;
      if (page > 20) break;
    }
    let sorted = true;
    for (let i = 1; i < all.length; i++) if (all[i]!.localeCompare(all[i - 1]!, 'th') < 0) sorted = false;
    assert(sorted, 'name-asc globally sorted with Thai collation');
  }

  // ── newest has no ties chaos (id tiebreaker) ──
  {
    const a = await getCatalogProducts('', undefined, 'newest', 1, LIMIT);
    const b = await getCatalogProducts('', undefined, 'newest', 1, LIMIT);
    assert(JSON.stringify(names(a.products)) === JSON.stringify(names(b.products)), 'newest deterministic');
  }

  // ── text search unchanged: q=hbo returns the 4 HBO products, ordered ──
  {
    const r = await getCatalogProducts('hbo', undefined, 'price-asc', 1, 24);
    console.log(`search q=hbo: ${r.total} results`);
    assert(r.total === 4, `search 'hbo' finds 4 products (got ${r.total})`);
    const p = minPrices(r.products).filter((x): x is number => x !== null);
    let sorted = true;
    for (let i = 1; i < p.length; i++) if (p[i]! < p[i - 1]!) sorted = false;
    assert(sorted, 'search results price-ordered');
  }

  // ── category filter unchanged ──
  {
    const r = await getCatalogProducts('', 'spotify', 'price-asc', 1, 24);
    console.log(`category spotify: ${r.total} results`);
    assert(r.total === 2, `category spotify finds 2 (got ${r.total})`);
    assert(r.products.every((p) => p.category.slug === 'spotify'), 'all results in spotify category');
  }

  // ── page beyond range → empty but total intact ──
  {
    const r = await getCatalogProducts('', undefined, 'price-asc', 99, 24);
    assert(r.products.length === 0 && r.total === 37, 'page beyond range → empty products, total preserved');
  }

  // ── combined search + category + sort ──
  {
    const r = await getCatalogProducts('', 'hbo-max', 'price-desc', 1, 24);
    const p = minPrices(r.products).filter((x): x is number => x !== null);
    let sorted = true;
    for (let i = 1; i < p.length; i++) if (p[i]! > p[i - 1]!) sorted = false;
    assert(r.total === 4 && sorted, 'category+sort combined works');
  }

  if (failures > 0) {
    console.error(`\n${failures} FAILURES`);
    process.exit(1);
  } else {
    console.log('\nALL PASSED');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
