'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Package, Tag } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Navbar bell — popover listing recent notifications.
 * Sample data for now; replace SAMPLE_NOTIFICATIONS with an API call
 * once a notification backend exists (future milestone).
 */
interface NotificationItem {
  id: string;
  icon: 'order' | 'promo';
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const SAMPLE_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n1',
    icon: 'order',
    title: 'คำสั่งซื้อ #NK-1024 สำเร็จ',
    body: 'รหัสสินค้าของคุณถูกส่งไปที่อีเมลแล้ว',
    time: '5 นาทีที่แล้ว',
    read: false,
  },
  {
    id: 'n2',
    icon: 'promo',
    title: 'โปรโมชั่นใหม่!',
    body: 'ลด 20% สำหรับ Spotify Premium ทุกแพ็กเกจ',
    time: '2 ชั่วโมงที่แล้ว',
    read: false,
  },
  {
    id: 'n3',
    icon: 'order',
    title: 'คำสั่งซื้อ #NK-1019 กำลังดำเนินการ',
    body: 'ได้รับชำระเงินเรียบร้อย กำลังจัดส่งรหัสสินค้า',
    time: 'เมื่อวาน',
    read: true,
  },
];

export function NotificationsDropdown(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(SAMPLE_NOTIFICATIONS);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Close on outside click + Escape while open
  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const markAllRead = () => setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`การแจ้งเตือน (${unreadCount} ยังไม่ได้อ่าน)`}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-300 transition-colors hover:bg-ink-800 hover:text-amber-300"
      >
        <Bell size={20} strokeWidth={1.5} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="รายการแจ้งเตือน"
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-ink-700 bg-ink-850 shadow-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-ink-100">การแจ้งเตือน</h2>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
              >
                <CheckCheck size={14} />
                อ่านทั้งหมด
              </button>
            )}
          </div>

          {/* Items */}
          <ul className="max-h-80 overflow-y-auto overscroll-contain">
            {notifications.map((n) => {
              const Icon = n.icon === 'order' ? Package : Tag;
              return (
                <li
                  key={n.id}
                  className={cn(
                    'flex gap-3 border-b border-ink-800 px-4 py-3 last:border-b-0',
                    !n.read && 'bg-ink-800/40',
                  )}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-800 text-amber-400">
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-100">{n.title}</p>
                    <p className="text-xs text-ink-400">{n.body}</p>
                    <p className="text-ink-500 mt-0.5 text-[11px]">{n.time}</p>
                  </div>
                  {!n.read && (
                    <span className="ml-auto mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                  )}
                </li>
              );
            })}
          </ul>

          {/* Footer */}
          <Link
            href="/account/orders"
            onClick={() => setOpen(false)}
            className="block border-t border-ink-700 py-2.5 text-center text-sm text-amber-400 hover:bg-ink-800 hover:text-amber-300"
          >
            ดูคำสั่งซื้อทั้งหมด
          </Link>
        </div>
      )}
    </div>
  );
}
