'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, X, Store } from 'lucide-react';
import { cn } from '@/utils/cn';
import { type AdminRole } from '@/types/auth';
import {
  type AdminNavNode,
  activeAncestorKeys,
  ariaCurrentFor,
  collectNavHrefs,
  nodeKey,
  primaryHref,
  resolveActiveHref,
  visibleNav,
} from '@/lib/adminNav';

export interface AdminSidebarProps {
  role: AdminRole;
  collapsed: boolean;
  onToggle: () => void;
  /** Mobile drawer open state (below md). The desktop rail ignores it. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
  className?: string;
}

/** Brand header shared by the desktop rail and the mobile drawer. */
function SidebarBrand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex h-14 shrink-0 items-center border-b border-line-subtle px-4">
      {!collapsed && (
        <Link href="/management/dashboard" className="text-lg font-bold text-fg-brand">
          Nong-Kati
        </Link>
      )}
    </div>
  );
}

interface RowProps {
  node: AdminNavNode;
  /** Highlighted leaf href, or null. */
  activeHref: string | null;
  /** 'page' when the browser is on this exact page, 'location' when deeper. */
  currentToken?: 'page' | 'location' | undefined;
  onNavigate?: () => void;
}

/** A leaf. `iconOnly` is the collapsed rail, where the row carries no text. */
function NavLinkRow({
  node,
  activeHref,
  currentToken,
  onNavigate,
  indent = 0,
  iconOnly = false,
}: RowProps & { indent?: number; iconOnly?: boolean }) {
  if (!node.href) return null;
  const Icon = node.icon;
  const isActive = activeHref === node.href;

  return (
    <li>
      <Link
        href={node.href}
        {...(onNavigate ? { onClick: onNavigate } : {})}
        aria-current={isActive ? currentToken : undefined}
        // Icon-only rail: the link renders no text, so `title` alone leaves it
        // with no accessible name (WCAG 2.2 4.1.2) — a screen reader announces
        // a bare "link". The name comes from the node's own label, which is
        // already the section/item title in adminNav; nothing new is invented.
        // Only in rail mode: the expanded row already names itself with its
        // visible text, and a second name would risk double announcement.
        aria-label={iconOnly ? node.label : undefined}
        title={iconOnly ? node.label : undefined}
        className={cn(
          'flex items-center rounded-md font-medium transition-colors',
          isActive
            ? 'bg-surface-brand-subtle text-fg-brand'
            : 'text-fg-muted hover:bg-surface hover:text-fg',
          iconOnly
            ? 'justify-center px-2 py-2.5'
            : cn(
                'gap-2.5 py-2 text-sm',
                indent > 0 ? 'pr-3 text-[13px]' : 'px-3',
                indent > 0 && (Icon ? 'pl-6' : 'pl-11'),
              ),
        )}
      >
        {/* aria-hidden: the glyph is decorative — the row names itself with
            aria-label (rail) or the visible span (expanded). Without it Chrome
            exposes the svg as an unnamed `image` node inside the link. */}
        {Icon && <Icon size={iconOnly ? 20 : 16} strokeWidth={1.5} aria-hidden="true" />}
        {!iconOnly && <span className="truncate">{node.label}</span>}
      </Link>
    </li>
  );
}

interface SectionProps extends RowProps {
  keyStr: string;
  open: boolean;
  onToggle: (key: string) => void;
  pathname: string | null;
}

/** A disclosure group. Its header is a button, never a link — one action. */
function NavGroup({
  node,
  keyStr,
  pathname,
  open,
  onToggle,
  activeHref,
  onNavigate,
  depth = 0,
}: SectionProps & { depth?: number }) {
  const children = node.children ?? [];
  if (children.length === 0) return null;

  const Icon = node.icon;
  const panelId = `admin-nav-panel-${keyStr}`;

  return (
    <li>
      <button
        type="button"
        onClick={() => onToggle(keyStr)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-md py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface',
          depth === 0 ? 'px-3' : 'px-6',
        )}
      >
        {Icon && <Icon size={20} strokeWidth={1.5} />}
        <span className="flex-1 truncate text-left">{node.label}</span>
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          className={cn('shrink-0 text-fg-placeholder transition-transform', open && 'rotate-180')}
        />
      </button>
      <ul id={panelId} hidden={!open} className="mt-1 space-y-0.5">
        {children.map((child, index) => {
          const childKey = nodeKey(child, index, keyStr);
          return child.children ? (
            <NavGroup
              key={childKey}
              node={child}
              keyStr={childKey}
              open={open}
              onToggle={onToggle}
              activeHref={activeHref}
              pathname={pathname}
              {...(onNavigate ? { onNavigate } : {})}
              depth={depth + 1}
            />
          ) : (
            <NavLinkRow
              key={childKey}
              node={child}
              activeHref={activeHref}
              currentToken={ariaCurrentFor(pathname, child)}
              {...(onNavigate ? { onNavigate } : {})}
              indent={depth + 1}
            />
          );
        })}
      </ul>
    </li>
  );
}

interface SidebarNavProps {
  role: AdminRole;
  collapsed: boolean;
  /** Present = mobile drawer context → clicking a link closes the drawer. */
  onNavigate?: () => void;
}

/** Role-aware nav list shared by both presentation modes. */
function SidebarNav({ role, collapsed, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const nodes = useMemo(() => visibleNav(role), [role]);

  const activeHref = useMemo(
    () => resolveActiveHref(pathname, collectNavHrefs(nodes)),
    [pathname, nodes],
  );
  const autoKeys = useMemo(() => activeAncestorKeys(pathname, nodes), [pathname, nodes]);
  const autoKey = autoKeys.join('|');

  // Manual toggles are additive: navigating always re-opens the branch the
  // user is standing in, even if they had collapsed it earlier.
  const [open, setOpen] = useState<Set<string>>(() => new Set(autoKeys));
  useEffect(() => {
    const keys = autoKey ? autoKey.split('|') : [];
    if (keys.length === 0) return;
    setOpen((prev) => {
      if (keys.every((k) => prev.has(k))) return prev;
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
  }, [autoKey]);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Collapsed rail: icons only, so a section header has to LINK somewhere —
  // the first reachable page beneath it — and lights up whenever any page in
  // its subtree is the current route.
  if (collapsed) {
    return (
      <nav className="flex-1 overflow-y-auto py-4" aria-label="เมนูแอดมิน">
        <ul className="space-y-1 px-2">
          {nodes.map((node, index) => {
            const href = primaryHref(node);
            if (!href) return null;
            const token = ariaCurrentFor(pathname, node);
            return (
              <NavLinkRow
                key={nodeKey(node, index)}
                node={{ ...node, href }}
                activeHref={token ? href : null}
                currentToken={token}
                {...(onNavigate ? { onNavigate } : {})}
                iconOnly
              />
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav className="flex-1 overflow-y-auto py-4" aria-label="เมนูแอดมิน">
      <ul className="space-y-1 px-2">
        {nodes.map((node, index) => {
          const key = nodeKey(node, index);
          if (node.children) {
            return (
              <NavGroup
                key={key}
                node={node}
                keyStr={key}
                open={open.has(key)}
                onToggle={toggle}
                activeHref={activeHref}
                pathname={pathname}
                {...(onNavigate ? { onNavigate } : {})}
              />
            );
          }
          return (
            <NavLinkRow
              key={key}
              node={node}
              activeHref={activeHref}
              currentToken={ariaCurrentFor(pathname, node)}
              {...(onNavigate ? { onNavigate } : {})}
            />
          );
        })}
      </ul>
    </nav>
  );
}

/** Back-to-storefront link shared by both presentation modes. */
function StorefrontLink({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="shrink-0 px-2 pt-3">
      <Link
        href="/"
        {...(onNavigate ? { onClick: onNavigate } : {})}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg',
          collapsed && 'justify-center px-2',
        )}
        // Same rule as the rail rows: in icon mode the link has no text, so the
        // name must not rest on `title` alone (the weakest step of the name
        // computation, and dropped by some assistive tech).
        aria-label={collapsed ? 'กลับหน้าร้าน' : undefined}
        title={collapsed ? 'กลับหน้าร้าน' : undefined}
      >
        <Store size={20} strokeWidth={1.5} aria-hidden="true" />
        {!collapsed && <span>กลับหน้าร้าน</span>}
      </Link>
    </div>
  );
}

/** Collapse toggle — desktop rail only (the drawer has its own close button). */
function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <div className="shrink-0 border-t border-line-subtle p-2">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-center rounded-md p-2 text-fg-placeholder hover:bg-surface hover:text-fg"
        aria-label={collapsed ? 'ขยาย sidebar' : 'ย่อ sidebar'}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
    </div>
  );
}

/**
 * 05-components.md §1.8 — Admin Sidebar.
 *
 * Two presentation modes of the same role-aware nav:
 *  - md+  : always-visible rail, collapsible to icons (desktop, as before).
 *  - < md : off-canvas drawer over a backdrop (visual audit 2026-09-28: the
 *           fixed 256px rail used to pin itself over a 390px phone, leaving
 *           the page content a ~134px sliver). Drawer closes on link tap,
 *           backdrop tap, or Escape, and returns focus to the opener — the
 *           same accessible-modal pattern as FacebookSidebar.
 *
 * IA: 17 flat entries became 7 collapsible sections (see lib/adminNav.ts).
 * Every route is unchanged, so links and bookmarks survive.
 */
export function AdminSidebar({
  role,
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
  className,
}: AdminSidebarProps): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [closing, setClosing] = useState(false);
  const prevOpenRef = useRef(mobileOpen);
  const shown = mobileOpen || closing;

  // Focus management + body scroll lock while the drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      openerRef.current?.focus?.();
    };
  }, [mobileOpen]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onCloseMobile]);

  // Play the exit animation when the drawer closes, then unmount.
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = mobileOpen;
    if (!wasOpen || mobileOpen) return;
    setClosing(true);
    const t = setTimeout(() => setClosing(false), 700);
    return () => clearTimeout(t);
  }, [mobileOpen]);

  useEffect(() => {
    if (mobileOpen) setClosing(false);
  }, [mobileOpen]);

  // Close automatically when navigating via a drawer link.
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    if (mobileOpen && prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      onCloseMobile();
    }
  }, [pathname, mobileOpen, onCloseMobile]);

  return (
    <>
      {/* md+ — the classic collapsible rail, unchanged */}
      <aside
        className={cn(
          'transition-smart hidden h-full flex-col border-r border-line-subtle bg-surface-base duration-200 md:flex',
          collapsed ? 'w-16' : 'w-64',
          className,
        )}
      >
        <SidebarBrand collapsed={collapsed} />
        <StorefrontLink collapsed={collapsed} />
        <SidebarNav role={role} collapsed={collapsed} />
        <CollapseToggle collapsed={collapsed} onToggle={onToggle} />
      </aside>

      {/* < md — off-canvas drawer (the hamburger in AdminTopBar opens it).
          Reuses the storefront's drawer animations (globals.css) so exit
          plays before unmount — the same motion language, no new keyframes. */}
      {shown && (
        <>
          <div
            className={cn(
              'fixed inset-0 z-40 bg-clay-950/50 backdrop-blur-sm md:hidden',
              closing ? 'drawer-backdrop-out' : 'drawer-backdrop',
            )}
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="เมนูแอดมิน"
            tabIndex={-1}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget && e.animationName === 'drawer-slide-out') {
                setClosing(false);
              }
            }}
            className={cn(
              'fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-line-subtle bg-surface-base shadow-clay-lg outline-none md:hidden',
              closing ? 'drawer-panel-out' : 'drawer-panel',
            )}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line-subtle px-4">
              <span className="text-lg font-bold text-fg-brand">Nong-Kati</span>
              <button
                onClick={onCloseMobile}
                className="rounded p-2 text-fg-placeholder hover:bg-surface hover:text-fg"
                aria-label="ปิดเมนู"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            <StorefrontLink collapsed={false} onNavigate={onCloseMobile} />
            <SidebarNav role={role} collapsed={false} onNavigate={onCloseMobile} />
            {/* Footer keeps the rail's bottom border height so both modes
                look identical; the collapse control is desktop-only. */}
            <div className="shrink-0 border-t border-line-subtle p-2" />
          </div>
        </>
      )}
    </>
  );
}