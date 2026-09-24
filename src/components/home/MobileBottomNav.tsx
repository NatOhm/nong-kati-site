'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, ShoppingCart, ShieldCheck, UserCog } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useCart } from '@/hooks/useCart';
import { useCustomerSession } from '@/components/layout/useCustomerSession';
import {
  useAdminIdentity,
  ADMIN_ROLE_LABELS,
  formatLastLogin,
} from '@/components/layout/useAdminIdentity';
import { AcornIcon, SeedIcon, WheelIcon, PawIcon } from '@/components/ui/ClayIcons';

const NAV_ITEMS = [
  { icon: AcornIcon, href: '/', label: 'หน้าหลัก', clay: true },
  { icon: Search, href: '/search', label: 'ค้นหา', clay: false },
  { icon: ShoppingCart, href: '/checkout', label: 'ตะกร้า', clay: false },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { itemCount } = useCart();
  const sessionState = useCustomerSession();
  const isAuthenticated = sessionState === 'authed';
  // Admin session present → the แอดมิน button opens a chooser mirroring the
  // desktop ProfileMenu: identity + recent activity, then dashboard vs admin
  // profile (password/2FA). The management layout handles expiry/redirect
  // itself on arrival.
  const { isAdmin, identity: adminIdentity } = useAdminIdentity();
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  // Close the chooser on navigation or on a tap outside (same treatment as
  // the desktop popover).
  useEffect(() => setAdminMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!adminMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) {
        setAdminMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [adminMenuOpen]);

  // Sitewide taskbar except the admin panel (which has its own chrome).
  if (pathname?.startsWith('/management')) return null;

  const accountItem = {
    icon: PawIcon,
    href: isAdmin ? '' : isAuthenticated ? '/account/dashboard' : '/account/login',
    label: isAdmin ? 'แอดมิน' : isAuthenticated ? 'บัญชี' : 'เข้าสู่ระบบ',
    clay: true as const,
  };
  const allItems = [...NAV_ITEMS, accountItem];

  return (
    <nav className="bg-surface-base/95 fixed bottom-0 left-0 right-0 z-50 border-t border-line-subtle backdrop-blur-md lg:hidden">
      <div className="flex items-center justify-around px-2 py-1">
        {allItems.map((item) => {
          const isActive =
            item.href !== '' &&
            (pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href)));
          const Icon = item.icon;
          const isCart = item.label === 'ตะกร้า';

          // Admin: taskbar button opens the dashboard/profile chooser instead
          // of jumping straight to the panel (mirrors desktop ProfileMenu).
          if (isAdmin && item.label === 'แอดมิน') {
            return (
              <div key="account" ref={adminMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setAdminMenuOpen((o) => !o)}
                  aria-expanded={adminMenuOpen}
                  aria-haspopup="menu"
                  aria-label="เมนูผู้ดูแลระบบ"
                  className={cn(
                    'flex min-h-[44px] min-w-[60px] flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-1.5 transition-colors',
                    adminMenuOpen || isActive
                      ? 'text-fg-brand'
                      : 'text-fg-placeholder hover:text-fg-secondary',
                  )}
                >
                  <div
                    className={cn(
                      'transition-transform duration-interactive ease-spring',
                      (adminMenuOpen || isActive) && 'scale-110',
                    )}
                  >
                    <PawIcon size={24} />
                  </div>
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>

                {adminMenuOpen && (                    <div
                      role="menu"
                      aria-label="เมนูผู้ดูแลระบบ"
                      className="clay-card suggest-drop absolute bottom-full right-0 z-50 mb-2 w-64 rounded-2xl p-2"
                    >
                      {/* Identity + recent activity — same data as the desktop popover. */}
                      {adminIdentity && (
                        <div className="border-b border-line-subtle px-3 pb-2.5 pt-1.5">
                          <p className="truncate text-sm font-bold text-fg">{adminIdentity.fullName}</p>
                          <p className="truncate text-xs text-fg-secondary">
                            {adminIdentity.email} · {ADMIN_ROLE_LABELS[adminIdentity.role]}
                          </p>
                          {adminIdentity.lastLoginAt && (
                            <p className="mt-1 text-[11px] text-fg-secondary">
                              เข้าสู่ระบบล่าสุด: {formatLastLogin(adminIdentity.lastLoginAt)}
                            </p>
                          )}
                          {typeof adminIdentity.activeSessions === 'number' && (
                            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-secondary">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-jade-500" />
                              Sessions ที่ใช้งานอยู่: {adminIdentity.activeSessions}
                            </p>
                          )}
                        </div>
                      )}
                    <Link
                      href="/management/dashboard"
                      role="menuitem"
                      onClick={() => setAdminMenuOpen(false)}
                      className="flex min-h-[44px] items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-fg-brand-strong transition-colors hover:bg-surface-sunken"
                    >
                      <ShieldCheck size={16} /> เข้าหน้าแอดมิน
                    </Link>
                    <Link
                      href="/management/settings?tab=security"
                      role="menuitem"
                      onClick={() => setAdminMenuOpen(false)}
                      className="flex min-h-[44px] items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-fg-secondary transition-colors hover:bg-surface-sunken hover:text-fg"
                    >
                      <UserCog size={16} /> โปรไฟล์ผู้ดูแล (รหัสผ่าน/2FA)
                    </Link>
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-h-[44px] min-w-[60px] flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-1.5 transition-colors',
                isActive ? 'text-fg-brand' : 'text-fg-placeholder hover:text-fg-secondary',
              )}
            >
              <div
                className={cn(
                  'relative transition-transform duration-interactive ease-spring',
                  isActive && 'scale-110',
                )}
              >
                {item.clay ? (
                  <Icon size={24} />
                ) : (
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
                )}
                {isCart && itemCount > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-crimson-700 text-[10px] font-bold text-white">
                    {itemCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
