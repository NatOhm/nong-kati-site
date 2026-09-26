'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Settings,
  History,
  LogOut,
  Wallet,
  ChevronDown,
  ShieldCheck,
  LogIn,
  UserCog,
} from 'lucide-react';

import { cn } from '@/utils/cn';
import { formatThb } from '@/utils/format';
import {
  useAdminIdentity,
  ADMIN_ROLE_LABELS,
  formatLastLogin,
  type AdminIdentity,
} from '@/components/layout/useAdminIdentity';
import {
  useCustomerProfile,
  type CustomerProfile,
} from '@/components/layout/CustomerProfileProvider';

/**
 * Profile popover — client ask: กดโปรไฟล์แล้วเห็นชื่อผู้ใช้, เครดิต/ยอดเงิน,
 * ปุ่มเติมเงิน, ตั้งค่าโปรไฟล์, ประวัติการเดินเงิน, ออกจากระบบ.
 * Guests get a plain เข้าสู่ระบบ link; the wallet shows ฿0 until the
 * top-up flow exists (never a fake number).
 */
export function ProfileMenu(): React.JSX.Element {
  const { state: sessionState, profile } = useCustomerProfile();
  const [open, setOpen] = useState(false);
  const [wallet, setWallet] = useState<{ balanceThb: number } | null>(null);
  // Admins get an entry into /management (client ask: admin account must be
  // able to reach its profile/panel from the storefront). Shared hook also
  // powers the mobile taskbar chooser.
  const { isAdmin: admin, identity: adminIdentity } = useAdminIdentity();
  const rootRef = useRef<HTMLDivElement>(null);

  // Identity comes free from the shared profile context (no /me refetch);
  // only the wallet balance is fetched, when the session proves authed.
  useEffect(() => {
    if (sessionState !== 'authed') return;
    fetch('/api/v1/wallet', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWallet(d ?? { balanceThb: 0 }))
      .catch(() => setWallet({ balanceThb: 0 }));
  }, [sessionState]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Guests without an admin session keep the plain login link. Guests WITH an
  // admin session fall through to the popover so they can reach /management.
  if (sessionState !== 'authed' && !admin) {
    return (
      <Link
        href="/account/login"
        aria-label="เข้าสู่ระบบ"
        title="เข้าสู่ระบบ"
        className="clay-btn transition-smart hidden h-10 w-10 items-center justify-center rounded-full text-fg-muted duration-interactive ease-ease-out hover:-translate-y-0.5 hover:text-fg-brand active:translate-y-0 active:scale-95 active:shadow-clay-press md:flex"
      >
        <UserIcon />
      </Link>
    );
  }

  return (
    <div ref={rootRef} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="บัญชีของฉัน"
        className={cn(
          'clay-btn transition-smart flex h-10 items-center gap-1 rounded-full px-2.5 text-fg-muted duration-interactive ease-ease-out hover:-translate-y-0.5 hover:text-fg-brand active:translate-y-0 active:scale-95 active:shadow-clay-press',
          open && 'text-fg-brand',
        )}
      >
        <UserIcon />
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="เมนูบัญชี"
          className="clay-card suggest-drop absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl p-2"
        >
          {/* Identity — customer when signed in; admin identity when admin */}
          <div className="border-b border-line-subtle px-3 pb-3 pt-2">
            <p className="truncate text-sm font-bold text-fg">
              {profile?.fullName ??
                (sessionState === 'authed' ? 'สมาชิก' : (adminIdentity?.fullName ?? 'ผู้ดูแลระบบ'))}
            </p>
            <p className="truncate text-xs text-fg-secondary">
              {profile?.email ??
                (sessionState === 'authed'
                  ? '—'
                  : adminIdentity
                    ? `${adminIdentity.email} · ${ADMIN_ROLE_LABELS[adminIdentity.role]}`
                    : 'บัญชีแอดมิน')}
            </p>
            {/* Recent admin activity — real data from /me (client ask). */}
            {!profile && adminIdentity?.lastLoginAt && (
              <p className="mt-1 text-[11px] text-fg-secondary">
                เข้าสู่ระบบล่าสุด: {formatLastLogin(adminIdentity.lastLoginAt)}
              </p>
            )}
            {!profile && typeof adminIdentity?.activeSessions === 'number' && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-secondary">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-jade-500" />
                Sessions ที่ใช้งานอยู่: {adminIdentity.activeSessions}
              </p>
            )}
          </div>

          {/* Wallet — customer sessions only */}
          {sessionState === 'authed' && (
            <div className="px-3 py-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-fg-muted">เครดิตคงเหลือ</span>
                <span className="text-lg font-bold text-fg-brand">
                  {formatThb(wallet?.balanceThb ?? 0)}
                </span>
              </div>
              <Link
                href="/account/wallet"
                className="transition-smart mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-surface-brand text-sm font-semibold text-fg-inverse shadow-clay-brand duration-interactive ease-ease-out hover:scale-[1.02] active:scale-[0.96]"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <Wallet size={15} />
                เติมเงิน
              </Link>
            </div>
          )}

          {/* Menu */}
          <div className="border-t border-line-subtle pt-1">
            {sessionState === 'authed' && (
              <>
                <Link
                  href="/account/settings"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-fg-secondary transition-colors hover:bg-surface-sunken hover:text-fg"
                >
                  <Settings size={15} /> ตั้งค่าโปรไฟล์
                </Link>
                <Link
                  href="/account/wallet"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-fg-secondary transition-colors hover:bg-surface-sunken hover:text-fg"
                >
                  <History size={15} /> ประวัติการเดินเงิน
                </Link>
              </>
            )}
            {admin && (
              <>
                <Link
                  href="/management/dashboard"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-fg-brand-strong transition-colors hover:bg-surface-sunken"
                >
                  <ShieldCheck size={15} /> เข้าหน้าแอดมิน
                </Link>
                <Link
                  href="/management/settings?tab=security"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-fg-secondary transition-colors hover:bg-surface-sunken hover:text-fg"
                >
                  <UserCog size={15} /> โปรไฟล์ผู้ดูแล (รหัสผ่าน/2FA)
                </Link>
              </>
            )}
            {sessionState !== 'authed' && admin && (
              <Link
                href="/account/login"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-fg-secondary transition-colors hover:bg-surface-sunken hover:text-fg"
              >
                <LogIn size={15} /> เข้าสู่ระบบลูกค้า
              </Link>
            )}
            {sessionState === 'authed' && (
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  setOpen(false);
                  await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
                  window.location.href = '/';
                }}
                className="hover:bg-error0/10 flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-fg-error transition-colors"
              >
                <LogOut size={15} /> ออกจากระบบ
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UserIcon(): React.JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
