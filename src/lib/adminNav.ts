/**
 * Admin navigation model — single source of truth for the sidebar.
 *
 * IA review: a flat 17-item rail made staff scroll to find routine pages and
 * scattered related work (orders / top-ups / reconciliation) across the list.
 * Regrouped into 7 named sections.
 *
 * Every href is UNCHANGED. This is a presentation-layer regrouping only, so
 * existing bookmarks, deep links, the docs manual and the capture script all
 * keep working — no redirects, no retired routes.
 *
 * Free of JSX so the tree can be unit-tested directly, the same way
 * useComboboxKeyboard keeps its key resolution pure.
 */

import {
  BarChart3,
  FileText,
  Hash,
  type LucideIcon,
  LayoutDashboard,
  LifeBuoy,
  Package,
  RotateCcw,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Tags,
  Ticket,
  Users,
  Wallet,
} from 'lucide-react';

import { type AdminRole, type Permission } from '@/types/auth';
import { roleHasPermission } from './rbac';

export interface AdminNavNode {
  label: string;
  /** Present on leaves; absent on pure section headers. */
  href?: string;
  /** Sections render an icon; leaves are indented text. */
  icon?: LucideIcon;
  permission: Permission;
  children?: AdminNavNode[];
}

/**
 * 7 sections. Note the two entries that used to be unreachable from the menu:
 * /management/analytics and /management/pdpa both existed as pages but had no
 * nav item at all.
 *
 * Dev Seed is deliberately absent — it is a dev-only tool and now 404s in
 * production (src/app/management/dev-seed/layout.tsx).
 */
export const ADMIN_NAV: AdminNavNode[] = [
  {
    label: 'แดชบอร์ด',
    href: '/management/dashboard',
    icon: LayoutDashboard,
    // Narrow on purpose — see the dashboard:read note in types/auth.ts. Using
    // reports:read here is what hid the menu entry from the three roles that
    // actually work in the admin all day.
    permission: 'dashboard:read',
  },
  {
    label: 'คำสั่งซื้อและการชำระเงิน',
    icon: ShoppingCart,
    permission: 'orders:read',
    children: [
      { label: 'คำสั่งซื้อ', href: '/management/orders', permission: 'orders:read' },
      { label: 'ประวัติเติมเงิน', href: '/management/topups', permission: 'topups:read', icon: Wallet },
      {
        label: 'กระทบยอด (Reconciliation)',
        href: '/management/reconciliation',
        permission: 'orders:read',
        icon: RotateCcw,
      },
    ],
  },
  {
    label: 'แคตตาล็อกและคลังสินค้า',
    icon: Package,
    permission: 'products:read',
    children: [
      { label: 'สินค้า', href: '/management/products', permission: 'products:read' },
      { label: 'คลังสินค้า', href: '/management/inventory', permission: 'inventory:read' },
      {
        label: 'จัดโครงสร้าง',
        permission: 'categories:read',
        children: [
          {
            label: 'หมวดหมู่',
            href: '/management/categories',
            permission: 'categories:read',
            icon: Tags,
          },
          { label: 'แท็ก', href: '/management/tags', permission: 'products:read', icon: Hash },
        ],
      },
    ],
  },
  {
    label: 'ลูกค้าและโปรโมชั่น',
    icon: Users,
    permission: 'customers:read',
    children: [
      { label: 'ลูกค้า', href: '/management/customers', permission: 'customers:read' },
      { label: 'คูปองส่วนลด', href: '/management/coupons', permission: 'coupons:read', icon: Ticket },
    ],
  },
  {
    label: 'ฝ่ายสนับสนุน',
    icon: LifeBuoy,
    permission: 'tickets:read',
    children: [{ label: 'ตั๋วสนับสนุน', href: '/management/tickets', permission: 'tickets:read' }],
  },
  {
    label: 'วิเคราะห์และรายงาน',
    icon: BarChart3,
    permission: 'reports:read',
    children: [
      {
        label: 'Analytics',
        href: '/management/analytics',
        permission: 'reports:read',
        icon: BarChart3,
      },
      { label: 'รายงาน', href: '/management/reports', permission: 'reports:read', icon: FileText },
      {
        label: 'ยอดซื้อรายคน',
        href: '/management/reports/customer-sales',
        permission: 'reports:read',
        icon: Users,
      },
      {
        label: 'สินค้าค้างสต๊อก',
        href: '/management/reports/slow-stock',
        permission: 'reports:read',
        icon: Package,
      },
    ],
  },
  {
    label: 'การดูแลระบบ',
    icon: Shield,
    permission: 'staff:read',
    children: [
      { label: 'พนักงาน', href: '/management/staff', permission: 'staff:read', icon: ShieldCheck },
      { label: 'Audit Log', href: '/management/audit', permission: 'audit:read', icon: FileText },
      { label: 'คำขอ PDPA', href: '/management/pdpa', permission: 'pdpa:read', icon: ShieldCheck },
      { label: 'ตั้งค่า', href: '/management/settings', permission: 'settings:read', icon: Settings },
    ],
  },
];

/** True when `pathname` is the route itself or nested beneath it. */
export function routeMatches(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The single nav entry to highlight for `pathname`.
 *
 * Longest match wins, so /management/reports/customer-sales highlights
 * "ยอดซื้อรายคน" and NOT its parent "รายงาน" — a plain startsWith() lit both.
 */
export function resolveActiveHref(pathname: string | null, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (!routeMatches(pathname, href)) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}

/** Depth-first walk over every node in a tree. */
export function walkNav(nodes: AdminNavNode[], visit: (node: AdminNavNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if (node.children) walkNav(node.children, visit);
  }
}

/** Every href in the tree, in document order. */
export function collectNavHrefs(nodes: AdminNavNode[] = ADMIN_NAV): string[] {
  const hrefs: string[] = [];
  walkNav(nodes, (node) => {
    if (node.href) hrefs.push(node.href);
  });
  return hrefs;
}

/**
 * The tree pruned to what `role` may actually open.
 *
 * A section renders when ANY child is reachable, not when the section's own
 * permission is held: gating "Customers & Promotions" on customers:read would
 * have hidden Coupons from the catalogue manager, who manages coupons but has
 * no customer access at all. A section that ends up with no reachable child
 * disappears entirely.
 */
export function visibleNav(role: AdminRole, nodes: AdminNavNode[] = ADMIN_NAV): AdminNavNode[] {
  const out: AdminNavNode[] = [];
  for (const node of nodes) {
    if (node.children) {
      const children = visibleNav(role, node.children);
      if (children.length === 0) continue;
      out.push({ ...node, children });
    } else {
      if (!roleHasPermission(role, node.permission)) continue;
      out.push({ ...node });
    }
  }
  return out;
}

/** Hrefs the given role can reach — the input to resolveActiveHref. */
export function visibleNavHrefs(role: AdminRole): string[] {
  return collectNavHrefs(visibleNav(role));
}

/**
 * Where a section header points when it acts as a link rather than a toggle:
 * its own href, else the first reachable leaf beneath it. Used by the
 * collapsed icon rail, where there is no room for disclosure triangles.
 */
export function primaryHref(node: AdminNavNode): string | null {
  if (node.href) return node.href;
  for (const child of node.children ?? []) {
    const found = primaryHref(child);
    if (found) return found;
  }
  return null;
}

/**
 * What a nav entry should announce via aria-current.
 *
 * A link is only the current PAGE when the browser is on that exact page.
 * Otherwise, if the current page sits anywhere inside the entry's subtree, it
 * is the current LOCATION. That covers both an order detail under
 * /management/orders and a collapsed rail icon that stands in for a whole
 * section — its href is the section's landing page, which is a SIBLING of the
 * page you are on, so href-prefix matching alone would miss it and announce
 * "page" for somewhere you are not.
 */
export function ariaCurrentFor(
  pathname: string | null,
  node: AdminNavNode,
): 'page' | 'location' | undefined {
  const href = node.href ?? primaryHref(node);
  if (!href || !pathname) return undefined;
  if (pathname === href) return 'page';
  return subtreeHasMatch(pathname, node) ? 'location' : undefined;
}

/** Stable per-node key from its position in the tree ("2", "2.2", …). */
export function nodeKey(node: AdminNavNode, index: number, prefix = ''): string {
  return prefix ? `${prefix}.${index}` : String(index);
}

/** True when `pathname` falls anywhere inside this node's subtree. */
function subtreeHasMatch(pathname: string | null, node: AdminNavNode): boolean {
  if (node.href) return routeMatches(pathname, node.href);
  return (node.children ?? []).some((child) => subtreeHasMatch(pathname, child));
}

/**
 * Keys of every GROUP on the active route's path, outermost first, so the
 * sidebar can auto-expand exactly the branch the user is standing in. Leaves
 * are excluded — a leaf has nothing to disclose.
 */
export function activeAncestorKeys(
  pathname: string | null,
  nodes: AdminNavNode[] = ADMIN_NAV,
  prefix = '',
): string[] {
  const keys: string[] = [];
  nodes.forEach((node, index) => {
    if (!node.children) return;
    const key = nodeKey(node, index, prefix);
    if (!subtreeHasMatch(pathname, node)) return;
    keys.push(key, ...activeAncestorKeys(pathname, node.children, key));
  });
  return keys;
}