'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Tag } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Navbar bell — real data from /api/v1/notifications.
 * Items are the live active coupons (promos); the unread badge is backed by
 * per-customer NotificationRead rows. No sample data — an empty list renders
 * an explicit "no notifications" state.
 */
interface NotificationItem {
  id: string;
  code: string;
  title: string;
  body: string;
  expiresAt: string | null;
  read: boolean;
}

/** Human-friendly Thai relative time for the expiry hint. */
function expiryHint(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return `หมดอายุอีก ${days} วัน`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return `หมดอายุอีก ${hours} ชั่วโมง`;
  return 'ใกล้หมดอายุ — รีบใช้!';
}

export function NotificationsDropdown(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback((): Promise<NotificationItem[] | null> => {
    return fetch('/api/v1/notifications', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ items: NotificationItem[] }>) : null))
      .then((d) => d?.items ?? null)
      .catch(() => null);
  }, []);

  // Initial load + refresh whenever the popover opens (admin edits show up
  // without a page reload).
  useEffect(() => {
    void load().then(setItems);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    void load().then(setItems);
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open, load]);

  const unreadCount = items?.filter((n) => !n.read).length ?? 0;

  const markAllRead = useCallback(() => {
    void fetch('/api/v1/notifications', { method: 'POST', credentials: 'include' })
      .then(() => load())
      .then((fresh) => setItems(fresh))
      .catch(() => {});
  }, [load]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`การแจ้งเตือน (${unreadCount} ยังไม่ได้อ่าน)`}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-clay-200 hover:text-fg-brand"
      >
        <Bell size={20} strokeWidth={1.5} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-crimson-700 px-0.5 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="รายการแจ้งเตือน"
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-line-subtle bg-surface-elevated shadow-clay-lg"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line-subtle px-4 py-2.5">
            <h2 className="text-sm font-semibold text-fg">การแจ้งเตือน</h2>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-fg-brand hover:text-fg-brand"
              >
                <CheckCheck size={14} />
                อ่านทั้งหมด
              </button>
            )}
          </div>

          {/* Items / empty / error */}
          {items === null ? (
            <p className="px-4 py-8 text-center text-sm text-fg-placeholder">
              โหลดการแจ้งเตือนไม่สำเร็จ
            </p>
          ) : items.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Tag size={28} className="mx-auto mb-2 text-fg-placeholder" />
              <p className="text-sm text-fg-placeholder">ยังไม่มีการแจ้งเตือน</p>
              <p className="mt-1 text-xs text-fg-placeholder">
                โปรโมชั่นและข่าวสารจะแสดงที่นี่
              </p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto overscroll-contain">
              {items.map((n) => {
                const hint = expiryHint(n.expiresAt);
                return (
                  <li
                    key={n.id}
                    className={cn(
                      'flex gap-3 border-b border-line-subtle px-4 py-3 last:border-b-0',
                      !n.read && 'bg-peach-50',
                    )}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-fg-brand">
                      <Tag size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">{n.title}</p>
                      <p className="text-xs text-fg-placeholder">{n.body}</p>
                      {hint && (
                        <p className="mt-0.5 text-[11px] font-medium text-coral-600">{hint}</p>
                      )}
                    </div>
                    {!n.read && (
                      <span className="ml-auto mt-1 h-2 w-2 shrink-0 rounded-full bg-peach-500" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Footer */}
          <Link
            href="/account/orders"
            onClick={() => setOpen(false)}
            className="block border-t border-line-subtle py-2.5 text-center text-sm text-fg-brand hover:bg-clay-200 hover:text-fg-brand"
          >
            ดูคำสั่งซื้อทั้งหมด
          </Link>
        </div>
      )}
    </div>
  );
}
