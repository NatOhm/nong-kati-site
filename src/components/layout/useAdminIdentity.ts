'use client';

import { useEffect, useState } from 'react';

import { getAdminToken, hasAdminSession } from '@/lib/adminSession';
import { type AdminRole } from '@/types/auth';

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  catalogue_manager: 'ผู้จัดการสินค้า',
  order_manager: 'ผู้จัดการคำสั่งซื้อ',
  finance_viewer: 'ผู้ดูการเงิน',
  support_agent: 'ฝ่ายสนับสนุน',
  marketing_manager: 'ผู้จัดการการตลาด',
};

export interface AdminIdentity {
  fullName: string;
  email: string;
  role: AdminRole;
  lastLoginAt?: string | null;
  activeSessions?: number | null;
}

/** Thai relative-ish time for the popover activity line. */
export function formatLastLogin(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชม. ${mins % 60} นาทีที่แล้ว`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Shared admin-identity fetch for the storefront popovers (desktop
 * ProfileMenu + mobile taskbar chooser). Tokens-only check — the management
 * layout handles expiry/redirect on arrival. Identity fetch failures keep
 * the generic label — non-blocking.
 */
export function useAdminIdentity(): { isAdmin: boolean; identity: AdminIdentity | null } {
  const [isAdmin, setIsAdmin] = useState(false);
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);

  useEffect(() => {
    if (!hasAdminSession()) return;
    setIsAdmin(true);
    const token = getAdminToken();
    if (!token) return;
    fetch('/api/v1/auth/admin/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? (r.json() as Promise<AdminIdentity>) : null))
      .then((d) => {
        if (d?.email) setIdentity(d);
      })
      .catch(() => {});
  }, []);

  return { isAdmin, identity };
}
