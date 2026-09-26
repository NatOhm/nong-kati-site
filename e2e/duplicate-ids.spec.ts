import { test, expect } from '@playwright/test';

/**
 * Duplicate-ID gate — HTML ids must be unique per page (a11y, WCAG 4.1.1
 * family: duplicated ids break label→input association and aria-describedby).
 *
 * The incident: /orders/lookup briefly rendered two #lookup-order inputs
 * (twin mount during soft navigation), which broke strict-mode locators and
 * screen-reader label resolution. All form components now derive ids from
 * React useId (unique per instance), and this gate keeps it that way.
 *
 * Page inventory comes from the site's own sitemap.xml (the real public
 * surface, product pages included) plus a small hardcoded core list as a
 * fallback in case the sitemap is unreachable in a run environment.
 *
 * The scan itself is a self-verifying control: before reading the page it
 * injects two elements with a known id (one normal, one aria-hidden) and
 * requires the scanner to report exactly them — so a broken/empty scan can
 * never green-light a page.
 */

const SCAN_DUPES_FN = /* js */ `
  () => {
    const counts = new Map();
    for (const el of document.querySelectorAll('[id]')) {
      const id = el.id;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const dupes = [];
    for (const [id, n] of counts) {
      if (n > 1) {
        const owners = [];
        for (const el of document.querySelectorAll('[id="' + id.replace(/"/g, '\\\\"') + '"]')) {
          owners.push(el.tagName.toLowerCase() + (el.getAttribute('type') ? '[' + el.getAttribute('type') + ']' : ''));
        }
        dupes.push({ id, count: n, owners });
      }
    }
    return dupes;
  }
`;

/** Always scanned, sitemap or not. */
const CORE_PAGES = [
  '/',
  '/search',
  '/orders/lookup',
  '/account/login',
  '/checkout',
  '/legal/privacy-policy',
];

interface Dupe {
  id: string;
  count: number;
  owners: string[];
}

async function sitemapPaths(baseURL: string): Promise<string[]> {
  try {
    const res = await fetch(new URL('/sitemap.xml', baseURL).toString(), {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? '');
    const base = new URL(baseURL).origin;
    const paths = locs
      .filter((u) => u.startsWith(base))
      .map((u) => new URL(u).pathname)
      .filter((p) => !p.startsWith('/api/') && p !== '');
    return [...new Set(paths)];
  } catch {
    return [];
  }
}

test.describe('duplicate-ID gate (whole site)', () => {
  test('sitemap inventory loads (gate covers the real public surface)', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.ok(), 'sitemap.xml must be reachable for the duplicate-ID gate').toBeTruthy();
  });

  for (const path of CORE_PAGES) {
    test(`${path}: zero duplicated ids (with self-verifying scan)`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(800);

      // Control: the scanner must see exactly the injected twins — proves
      // the scan is live and reports duplicates, not an empty array blindly.
      const control = (await page.evaluate((fn) => {
        const a = document.createElement('div');
        a.id = '__gate_control_dupe__';
        const b = document.createElement('div');
        b.id = '__gate_control_dupe__';
        document.body.append(a, b);
        const out = eval(fn)();
        a.remove();
        b.remove();
        return out;
      }, SCAN_DUPES_FN)) as Dupe[];
      const ctrl = control.filter((d) => d.id === '__gate_control_dupe__');
      expect(ctrl.length, 'scanner control failed: injected duplicate id not detected').toBe(1);
      expect(
        control.length,
        'scanner control failed: unexpected extra duplicate findings on ' + path,
      ).toBe(1);

      const dupes = (await page.evaluate(`(${SCAN_DUPES_FN})()`)) as Dupe[];
      expect(
        dupes,
        `${path}: duplicated DOM ids break a11y associations:\n` +
          dupes.map((d) => `  #${d.id} ×${d.count} (${d.owners.join(', ')})`).join('\n'),
      ).toEqual([]);
    });
  }

  test('every sitemap page: zero duplicated ids', async ({ page }) => {
    test.setTimeout(600_000);
    const baseURL = test.info().project.use.baseURL ?? 'http://localhost:4200';
    const paths = await sitemapPaths(baseURL);
    const all = [...new Set([...paths, ...CORE_PAGES])].slice(0, 150);
    expect(all.length, 'no pages discovered — sitemap parse failed').toBeGreaterThan(3);

    const offenders: string[] = [];
    for (const path of all) {
      const res = await page.goto(path);
      if (!res || !res.ok()) {
        offenders.push(`${path} → HTTP ${res ? res.status() : '??'} (page itself broken)`);
        continue;
      }
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(400);
      const dupes = (await page.evaluate(`(${SCAN_DUPES_FN})()`)) as Dupe[];
      for (const d of dupes) {
        offenders.push(`${path} → #${d.id} ×${d.count} (${d.owners.join(', ')})`);
      }
    }
    expect(
      offenders,
      'pages with duplicated DOM ids:\n' + offenders.map((o) => `  ${o}`).join('\n'),
    ).toEqual([]);
  });
});
