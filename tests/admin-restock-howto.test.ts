/**
 * The "เติมสต๊อกบัญชี" staff how-to must describe the code, not a memory of it.
 *
 * `docs/admin-restock-howto-th.md` is the first Thai how-to written for one
 * feature rather than for the whole admin. The risk is specific: it reads like
 * documentation while describing behaviour nobody re-checks. Three of its
 * claims were already wrong before this gate existed, in the older manual §3:
 *
 *   - the button was called "จัดการสต๊อก (ไอคอนรูปกุญแจ)". The tooltip the staff
 *     actually see is "เติมสต๊อกบัญชี" and the icon is a package with a plus.
 *   - the separator chips (Comma / Semicolon / Tab) were described as usable
 *     for `user,pass` data. The dialog disables them in short format, and the
 *     route never reads `separator` at all after parsing the body -- long-format
 *     blocks are delivered to the customer verbatim.
 *   - no permission was named, so nobody knew why Order Manager got a 403.
 *
 * R5 is the one that earns its keep. If someone implements separator splitting
 * (the route's own doc-comment still describes that older design), this gate
 * goes red and the how-to gets corrected instead of quietly lying again.
 *
 * Pure static scan: no browser, no network, no database.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROLE_PERMISSIONS } from '@/types/auth';

const ROOT = path.join(__dirname, '..');
const read = (...p: string[]): string => readFileSync(path.join(ROOT, ...p), 'utf8');

const HOWTO = read('docs', 'admin-restock-howto-th.md');
const MANUAL = read('docs', 'admin-manual-th.md');
const ROUTE = read('src', 'app', 'api', 'v1', 'admin', 'stock', 'bulk', 'route.ts');
const DIALOG = read('src', 'app', 'management', 'products', 'BulkStockDialog.tsx');
const PRODUCTS = read('src', 'app', 'management', 'products', 'page.tsx');
const INVENTORY = read('src', 'app', 'management', 'inventory', 'page.tsx');

/** The doc must actually carry these phrases, or an assertion below is vacuous. */
const REQUIRED = [
  'เติมสต๊อกบัญชี',
  'จัดการข้อมูลบัญชี',
  'บรรทัดว่าง 2 บรรทัด',
  'products:write',
  'NO_VARIANTS',
  'แยกข้อมูล',
];
for (const phrase of REQUIRED) {
  it(`how-to still states "${phrase}" (guards the gates below from passing on nothing)`, () => {
    expect(HOWTO).toContain(phrase);
  });
}

describe('เติมสต๊อกบัญชี — entry points and trigger', () => {
  it('the trigger really is labelled เติมสต๊อกบัญชี in the products table', () => {
    expect(PRODUCTS).toContain('title="เติมสต๊อกบัญชี"');
    expect(HOWTO).toContain('เติมสต๊อกบัญชี');
  });

  it('both pages the how-to names really open the same dialog', () => {
    expect(PRODUCTS).toContain('<BulkStockDialog');
    expect(INVENTORY).toContain('<BulkStockDialog');
    expect(HOWTO).toContain('/management/products');
    expect(HOWTO).toContain('/management/inventory');
  });

  it('the dialog title the how-to quotes is the title in the code', () => {
    expect(DIALOG).toContain('จัดการข้อมูลบัญชี - {productName}');
  });
});

describe('เติมสต๊อกบัญชี — permissions', () => {
  it('the route gates on products:write and the how-to names that permission', () => {
    expect(ROUTE).toContain("checkPermission(token, 'products:write')");
    expect(HOWTO).toContain('products:write');
  });

  it('the how-to role table matches ROLE_PERMISSIONS exactly, role for role', () => {
    const label = (role: string): string =>
      role
        .split('_')
        .map((w) => w[0]!.toUpperCase() + w.slice(1))
        .join(' ');

    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      const can = perms.includes('products:write');
      expect(HOWTO, `no table row for ${role}`).toContain(`| ${label(role)} | `);
      expect(HOWTO, `${label(role)} should read "${can ? 'ได้' : 'ไม่ได้'}"`).toContain(
        `| ${label(role)} | ${can ? 'ได้' : 'ไม่ได้'} |`,
      );
    }
  });
});

describe('เติมสต๊อกบัญชี — data formats', () => {
  it('short format is one record per line in both client and route', () => {
    expect(DIALOG).toContain("format === 'short'");
    expect(ROUTE).toContain('one record per line');
  });

  it('long format splits on 2+ blank lines, and the how-to says exactly that', () => {
    expect(ROUTE).toContain('blankRun >= 2');
    expect(HOWTO).toContain('บรรทัดว่าง 2 บรรทัด');
  });

  it('the chips are the three the how-to lists', () => {
    for (const chip of ['Comma (,)', 'Semicolon (;)', 'Tab']) {
      expect(DIALOG).toContain(chip);
      expect(HOWTO).toContain(chip);
    }
  });

  it('the chips are disabled outside long format, as the how-to claims', () => {
    expect(DIALOG).toContain("disabled={format === 'short'}");
  });
});

describe('เติมสต๊อกบัญชี — the separator claim', () => {
  /**
   * R5. `separator` is validated in the body then never used: the long-format
   * branch pushes the whole block as-is. If this ever changes, the how-to's
   * warning ("ยังไม่มีผล") becomes a lie and this gate must fail so the doc is
   * corrected in the same commit.
   */
  it('the route still ignores the separator, so the how-to warning stays true', () => {
    // Everything from the last body field onward is the real parser. `separator`
    // is read out of the request above this point and then never consulted, so
    // its total absence here is the claim.
    const parser = ROUTE.slice(ROUTE.indexOf("const apply = b['apply'] === true;"));
    expect(parser.length).toBeGreaterThan(1000);
    expect(parser).not.toMatch(/\bseparator\b/);
    expect(HOWTO).toContain('ยังไม่มีผล');
  });

  it('the route header comment is known-stale and says the old separator design', () => {
    // Kept as an explicit assertion because it is the trap: the route's own
    // doc-comment still advertises the design that was never implemented.
    expect(ROUTE).toContain('fields joined by `separator`');
  });
});

describe('เติมสต๊อกบัญชี — what saving does', () => {
  it('dedupe is real and the how-to promises it is safe to re-paste', () => {
    expect(ROUTE).toContain('duplicates');
    expect(ROUTE).toContain('hashCode');
    expect(HOWTO).toContain('ข้ามโค้ดที่ซ้ำ');
  });

  it('the stock move the how-to describes is the one the route writes', () => {
    expect(ROUTE).toContain("reason: 'restock'");
    expect(ROUTE).toContain("refType: 'upload'");
    expect(ROUTE).toContain('stockAfter');
    expect(HOWTO).toContain('เติมสต๊อก');
  });

  it('only active variants are counted, and NO_VARIANTS is what the staff sees', () => {
    expect(ROUTE).toContain('where: { isActive: true }');
    expect(ROUTE).toContain('NO_VARIANTS');
    expect(HOWTO).toContain('NO_VARIANTS');
  });

  it('codes are encrypted before they are stored', () => {
    expect(ROUTE).toContain('encryptCode');
    expect(HOWTO).toContain('เข้ารหัส');
  });
});

describe('เติมสต๊อกบัญชี — multi-variant distribution', () => {
  it('unpinned records round-robin and a label pins one', () => {
    expect(ROUTE).toContain('order[cursor % order.length]');
    expect(ROUTE).toContain('v.label === pinLabel');
    expect(HOWTO).toContain('วนรอบ');
  });
});

describe('เติมสต๊อกบัญชี — the reference-prefix trap', () => {
  it('the route drops a whole line that starts with a reference prefix', () => {
    expect(ROUTE).toContain('REF_RE');
    for (const prefix of ['ID:', 'Ref:', 'Order:', 'Inv:']) {
      expect(HOWTO).toContain(prefix);
    }
  });
});

describe('เติมสต๊อกบัญชี — manual cross-link', () => {
  it('manual §3 points at the how-to and the link resolves on disk', () => {
    expect(MANUAL).toContain('admin-restock-howto-th.md');
    expect(() => read('docs', 'admin-restock-howto-th.md')).not.toThrow();
  });

  it('manual §3 no longer claims the separator splits short-format data', () => {
    const s3 = MANUAL.match(/^## 3\. .*?$(.*?)^## 4\./ms)?.[1] ?? '';
    expect(s3).not.toMatch(/Comma \/ Semicolon \/ Tab \(ถ้าข้อมูลเป็น/);
    expect(s3).toContain('ยังไม่มีผล');
  });
});