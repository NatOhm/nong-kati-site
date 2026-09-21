'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Settings, History, LogOut, Wallet, ChevronDown } from 'lucide-react';

import { cn } from '@/utils/cn';
import { formatThb } from '@/utils/format';
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

  if (sessionState !== 'authed') {
    return (
      <Link
        href="/account/login"
        aria-label="เข้าสู่ระบบ"
        title="เข้าสู่ระบบ"
        className="clay-btn hidden h-10 w-10 items-center justify-center rounded-full text-fg-muted transition-all duration-interactive ease-ease-out hover:-translate-y-0.5 hover:text-fg-brand active:translate-y-0 active:scale-95 active:shadow-clay-press md:flex"
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
          'clay-btn flex h-10 items-center gap-1 rounded-full px-2.5 text-fg-muted transition-all duration-interactive ease-ease-out hover:-translate-y-0.5 hover:text-fg-brand active:translate-y-0 active:scale-95 active:shadow-clay-press',
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
          {/* Identity */}
          <div className="border-b border-line-subtle px-3 pb-3 pt-2">
        <p className="truncate text-sm font-bold text-fg">{(profile as CustomerProfile | null)?.fullName ?? 'สมาชิก'}</p>
        <p className="truncate text-xs text-fg-muted">{(profile as CustomerProfile | null)?.email}</p>
          </div>

          {/* Wallet */}
          <div className="px-3 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-fg-muted">เครดิตคงเหลือ</span>
              <span className="text-lg font-bold text-fg-brand">
                {formatThb(wallet?.balanceThb ?? 0)}
              </span>
            </div>
            <Link
              href="/account/wallet"
              className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-surface-brand text-sm font-semibold text-fg-inverse shadow-clay-brand transition-all duration-interactive ease-ease-out hover:scale-[1.02] active:scale-[0.96]"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <Wallet size={15} />
              เติมเงิน
            </Link>
          </div>

          {/* Menu */}
          <div className="border-t border-line-subtle pt-1">
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
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
                window.location.href = '/';
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-coral-600 transition-colors hover:bg-coral-500/10"
            >
              <LogOut size={15} /> ออกจากระบบ
            </button>
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
