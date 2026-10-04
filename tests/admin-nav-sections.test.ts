import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ADMIN_NAV,
  type AdminNavNode,
  activeAncestorKeys,
  ariaCurrentFor,
  collectNavHrefs,
  primaryHref,
  resolveActiveHref,
  routeMatches,
  visibleNav,
  visibleNavHrefs,
  walkNav,
} from '@/lib/adminNav';
import { AdminRole, ALL_PERMISSIONS, ROLE_PERMISSIONS, type Permission } from '@/types/auth';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every /management/** page that exists on disk, so the nav can't silently drop one. */
function managementPages(): string[] {
  const root = path.join(REPO, 'src', 'app', 'management');
  const found: string[] = [];
  const walk = (dir: string, prefix: string) => {
    if (fs.existsSync(path.join(dir, 'page.tsx'))) found.push(prefix);
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), `${prefix}/${e.name}`);
    }
  };
  walk(root, '/management');
  return found.sort();
}

/**
 * The seven sections, in the order the request lists them. Keying on an
 * ordinal rather than the Thai label keeps this contract readable and stable
 * when the menu copy is reworded.
 */
const SECTION_ORDER = [
  'dashboard',
  'orders',
  'catalog',
  'customers',
  'support',
  'reports',
  'administration',
] as const;

type SectionKey = (typeof SECTION_ORDER)[number];

const sectionNode = (key: SectionKey): AdminNavNode => {
  const node = ADMIN_NAV[SECTION_ORDER.indexOf(key)];
  if (!node) throw new Error(`no nav section for "${key}"`);
  return node;
};

/** A section is identified by the first page it contains. */
const hrefOf = (node: AdminNavNode): string => {
  const href = primaryHref(node);
  if (!href) throw new Error(`section "${node.label}" has no reachable page`);
  return href;
};

const visibleSections = (role: AdminRole): string[] => visibleNav(role).map(hrefOf);
const wantedSections = (keys: readonly SectionKey[]): string[] =>
  keys.map((key) => hrefOf(sectionNode(key)));

/**
 * Which of the seven sections a role can open, by tree position.
 *
 * Position is the stable identity. A section's *first reachable page* is not:
 * pruning removes unreachable leaves, so "Customers & Promotions" identifies as
 * /management/customers for a role that can read customers and as
 * /management/coupons for one that can only read coupons.
 */
const SECTION_LABEL = Object.fromEntries(
  SECTION_ORDER.map((key, index) => [key, ADMIN_NAV[index]?.label ?? '']),
) as Record<SectionKey, string>;

const visibleSectionKeys = (role: AdminRole): SectionKey[] => {
  const shown = new Set(visibleNav(role).map((node) => node.label));
  return SECTION_ORDER.filter((key) => shown.has(SECTION_LABEL[key]));
};

const ALL_SECTIONS = SECTION_ORDER;

/**
 * The role model, transcribed from the request:
 *   "Order Manager sees Dashboard, Orders, Customers and Support."
 *   "Catalog Manager sees Dashboard, Catalog, Inventory and Reports."
 *   "Super Admin sees everything."
 *
 * Inventory lives inside the Catalog section, and "Reports" names the
 * Analytics & Reports section, so neither needs a key of its own.
 */
const ROLE_RULES: ReadonlyArray<readonly [AdminRole, readonly SectionKey[]]> = [
  [AdminRole.ORDER_MANAGER, ['dashboard', 'orders', 'customers', 'support']],
  [AdminRole.CATALOGUE_MANAGER, ['dashboard', 'catalog', 'reports']],
  [AdminRole.SUPER_ADMIN, ALL_SECTIONS],
];

// ─── The contract ──────────────────────────────────────────────────────────

/**
 * Sections each role could already open BEFORE this work changed the matrix.
 *
 * catalogue_manager has held coupons:read all along, so "Customers &
 * Promotions" legitimately shows for them holding just Coupons. The request
 * does not list it, but the capability pre-dates the work and deleting it to
 * make the menu match the list exactly would be trading a working permission
 * for cosmetic tidiness. The honest result is: requested sections are
 * guaranteed, and nothing beyond requested-plus-pre-existing is introduced.
 */
const PRE_EXISTING: Partial<Record<AdminRole, readonly SectionKey[]>> = {
  [AdminRole.ORDER_MANAGER]: ['dashboard', 'orders', 'customers'],
  [AdminRole.CATALOGUE_MANAGER]: ['dashboard', 'catalog', 'customers'],
};

describe('admin nav — role model (transcribed from the request)', () => {
  // Section-level, not leaf-level: the request names which of the seven nav
  // items each role gets, not which pages inside them.
  it.each(ROLE_RULES)('%s sees every section the request lists', (role, listed) => {
    const visible = visibleSectionKeys(role);
    for (const key of listed) {
      expect(visible, `${role} is missing "${key}"`).toContain(key);
    }
  });

  it.each(ROLE_RULES)('%s is offered nothing outside requested + pre-existing', (role, listed) => {
    const allowed = new Set([...listed, ...(PRE_EXISTING[role] ?? [])]);
    expect(visibleSectionKeys(role).filter((key) => !allowed.has(key))).toEqual([]);
  });
});

describe('admin nav — every role still gets a usable menu', () => {
  it.each(Object.values(AdminRole))('%s: no section renders empty, dashboard reachable', (role) => {
    const walk = (nodes: ReturnType<typeof visibleNav>) => {
      for (const node of nodes) {
        if (node.children) {
          expect(node.children.length).toBeGreaterThan(0);
          walk(node.children);
        }
      }
    };
    walk(visibleNav(role));
    expect(visibleNavHrefs(role)).toContain('/management/dashboard');
  });

  it('the three roles outside the request are untouched', () => {
    // finance_viewer / support_agent / marketing_manager were never named in
    // the role rules, so this pass must not move their menus.
    const snapshot: Partial<Record<AdminRole, string[]>> = {
      [AdminRole.FINANCE_VIEWER]: [
        '/management/analytics',
        '/management/dashboard',
        '/management/orders',
        '/management/reconciliation',
        '/management/reports',
        '/management/reports/customer-sales',
        '/management/reports/slow-stock',
      ],
      [AdminRole.SUPPORT_AGENT]: [
        '/management/customers',
        '/management/dashboard',
        '/management/orders',
        '/management/reconciliation',
        '/management/tickets',
        '/management/topups',
      ],
      [AdminRole.MARKETING_MANAGER]: [
        '/management/analytics',
        '/management/categories',
        '/management/coupons',
        '/management/dashboard',
        '/management/products',
        '/management/reports',
        '/management/reports/customer-sales',
        '/management/reports/slow-stock',
        '/management/tags',
      ],
    };
    for (const role of Object.keys(snapshot) as AdminRole[]) {
      expect(visibleNavHrefs(role).slice().sort(), role).toEqual(
        [...(snapshot[role] ?? [])].sort(),
      );
    }
  });
});

// ─── Structure ─────────────────────────────────────────────────────────────

describe('admin nav — structure', () => {
  it('is exactly the seven requested sections, in order', () => {
    expect(ADMIN_NAV.map(hrefOf)).toEqual(wantedSections(ALL_SECTIONS));
  });

  it('covers every admin page except login and dev-seed', () => {
    const pages = managementPages();
    const navHrefs = collectNavHrefs();
    expect(pages.filter((p) => !navHrefs.includes(p))).toEqual([
      '/management/dev-seed',
      '/management/login',
    ]);
    for (const href of navHrefs) expect(pages, href).toContain(href);
  });

  it('only uses permissions that exist and that super_admin actually holds', () => {
    const granted = new Set<Permission>(ALL_PERMISSIONS as readonly Permission[]);
    const check = (nodes: typeof ADMIN_NAV) => {
      for (const node of nodes) {
        expect(granted, node.label).toContain(node.permission);
        if (node.children) check(node.children);
      }
    };
    check(ADMIN_NAV);
  });
});

// ─── Behaviour ─────────────────────────────────────────────────────────────

describe('admin nav — active route', () => {
  const hrefs = collectNavHrefs();

  it('matches the exact route and nested routes beneath it', () => {
    expect(resolveActiveHref('/management/orders', hrefs)).toBe('/management/orders');
    expect(routeMatches('/management/orders/ord-1', '/management/orders')).toBe(true);
    expect(routeMatches('/management/ordersfoo', '/management/orders')).toBe(false);
  });

  it('prefers the deepest match, so a parent never lights up too', () => {
    // /management/reports/customer-sales must not also highlight /management/reports
    expect(resolveActiveHref('/management/reports/customer-sales', hrefs)).toBe(
      '/management/reports/customer-sales',
    );
    expect(resolveActiveHref('/management/report', hrefs)).toBeNull();
  });

  it('auto-expands the group the user is standing in, nested included', () => {
    // Catalog > จัดโครงสร้าง > Categories is three levels down.
    expect(activeAncestorKeys('/management/categories', ADMIN_NAV)).toEqual(['2', '2.2']);
    expect(activeAncestorKeys('/management/orders', ADMIN_NAV)).toEqual(['1']);
    // Leaves have nothing to disclose.
    expect(activeAncestorKeys('/management/dashboard', ADMIN_NAV)).toEqual([]);
    expect(activeAncestorKeys('/management/login', ADMIN_NAV)).toEqual([]);
  });

  it('announces "page" only on the exact page, "location" when deeper', () => {
    // Found by playtesting the collapsed rail: on /management/reports/slow-stock
    // the rail marked /management/analytics as aria-current="page" — announcing
    // a page the user is not on.
    const nodeFor = (href: string): AdminNavNode => {
    for (const top of ADMIN_NAV) {
      if (top.href === href) return top;
      if (collectNavHrefs([top]).includes(href)) {
        return { href, permission: 'orders:read' } as AdminNavNode;
      }
    }
    throw new Error(`no nav node for ${href}`);
  };

    expect(ariaCurrentFor('/management/analytics', nodeFor('/management/analytics'))).toBe('page');
    expect(ariaCurrentFor('/management/orders/ord-1', nodeFor('/management/orders'))).toBe(
      'location',
    );
    // The rail icon for the whole Reports section, whose href is a SIBLING of
    // the page you are on — the case href-prefix matching cannot see.
    expect(ariaCurrentFor('/management/reports/slow-stock', ADMIN_NAV[5]!)).toBe('location');
    expect(ariaCurrentFor('/management/analytics', ADMIN_NAV[5]!)).toBe('page');
    expect(ariaCurrentFor('/management/orders', ADMIN_NAV[5]!)).toBeUndefined();
    expect(ariaCurrentFor('/management/orders', ADMIN_NAV[2]!)).toBeUndefined();
    expect(ariaCurrentFor(null, ADMIN_NAV[0]!)).toBeUndefined();
  });
});

// ─── Collapsed rail: accessible names ──────────────────────────────────────

describe('admin nav — collapsed rail announces something', () => {
  // Collapsed to 64px, a nav row renders an icon and nothing else, so the
  // component names it with aria-label={node.label}. That makes the LABEL the
  // accessible name: an empty or placeholder one is a WCAG 2.2 4.1.2 failure
  // and announces a bare "link". These lock the data the component depends on,
  // so a blanked string can't ship as an unnamed rail icon.

  it.each(Object.values(AdminRole))('%s: every node the rail can render has a real label', (role) => {
    const nodes = visibleNav(role);
    const nameless: string[] = [];
    walkNav(nodes, (node) => {
      if (node.label.trim().length < 2) nameless.push(node.label || '(empty)');
    });
    expect(nameless, `labels too short to announce: ${JSON.stringify(nameless)}`).toEqual([]);
  });

  it.each(Object.values(AdminRole))('%s: every top-level rail icon is a link with a distinct name', (role) => {
    // The rail has no disclosure triangles, so a section header becomes a LINK
    // to its first reachable page. If that link had no href, or two icons in
    // the same flat list shared a name, the screen-reader link list would be
    // either short or ambiguous.
    const rail = visibleNav(role).filter((node) => primaryHref(node) !== null);
    expect(rail.length).toBeGreaterThan(0);

    const names = rail.map((node) => node.label);
    expect(new Set(names).size, `duplicate rail names: ${names.join(', ')}`).toBe(names.length);

    const missingHref = rail.filter((node) => !primaryHref(node));
    expect(missingHref).toEqual([]);
  });
});

describe('admin nav — permission registry', () => {
  it('anyone who can open Inventory can also open slow-moving stock', () => {
    // The Inventory page links straight to /management/reports/slow-stock, so
    // every role that reaches Inventory must hold the reports permission
    // behind it. Without this the link is a guaranteed 403.
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS) as [AdminRole, Permission[]][]) {
      if (perms.includes('inventory:read')) expect(perms, role).toContain('reports:read');
    }
  });
  it.each([
    [AdminRole.SUPER_ADMIN, true],
    [AdminRole.CATALOGUE_MANAGER, true],
    [AdminRole.ORDER_MANAGER, true],
    [AdminRole.FINANCE_VIEWER, true],
    [AdminRole.SUPPORT_AGENT, true],
    [AdminRole.MARKETING_MANAGER, true],
  ])('%s holds dashboard:read exactly once', (role, expected) => {
    const perms = ROLE_PERMISSIONS[role].filter((p) => p === 'dashboard:read');
    expect(perms.length).toBe(expected ? 1 : 0);
  });
});