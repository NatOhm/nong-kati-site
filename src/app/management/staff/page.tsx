'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Shield,
  UserMinus,
  UserCheck,
  XCircle,
  Copy,
  KeyRound,
  LockOpen,
} from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminJson } from '@/lib/adminSession';
import { cn } from '@/utils/cn';
import type { AdminStaffListItem } from '@/api/adminStaff';
import type { AdminRole } from '@/types/auth';

const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  catalogue_manager: 'Catalogue Manager',
  order_manager: 'Order Manager',
  finance_viewer: 'Finance Viewer',
  support_agent: 'Support Agent',
  marketing_manager: 'Marketing Manager',
};

const ALL_ROLES: AdminRole[] = [
  'super_admin',
  'catalogue_manager',
  'order_manager',
  'finance_viewer',
  'support_agent',
  'marketing_manager',
];

/**
 * Wire shape: JSON timestamps arrive as ISO strings, not Date objects.
 * (Review finding #6 — calling .toLocaleDateString() on the raw string
 * crashed the whole table whenever any staff member had ever logged in.)
 */
type StaffResponseItem = Omit<AdminStaffListItem, 'lastLoginAt' | 'createdAt'> & {
  lastLoginAt: string | null;
  createdAt: string;
};

export default function AdminStaffPage(): React.JSX.Element {
  const [staff, setStaff] = useState<StaffResponseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [selfId, setSelfId] = useState<string>('');

  // Create form state
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('order_manager');

  const handleLoadStaff = useCallback(async () => {
    setLoading(true);
    // Review finding #9: clearing actionMessage here erased the just-created
    // temp password on the refresh that immediately follows create/reset.
    // Mutation handlers clear it explicitly before starting a new operation.
    try {
      const me = await adminJson<{ id: string }>('/api/v1/auth/admin/me');
      setSelfId(me.id);
      const data = await adminJson<{ items: StaffResponseItem[] }>('/api/v1/admin/staff');
      setStaff(data.items);
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : 'โหลดรายชื่อไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void handleLoadStaff();
  }, [handleLoadStaff]);

  const handleCreateStaff = async () => {
    try {
      const result = await adminJson<{ data: StaffResponseItem; tempPassword: string }>(
        '/api/v1/admin/staff',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: newEmail, fullName: newFullName, role: newRole }),
        },
      );
      setTempPassword(result.tempPassword);
      setActionMessage(
        `สร้างพนักงานสำเร็จ — รหัสผ่านชั่วคราว (แสดงครั้งเดียว): ${result.tempPassword}`,
      );
      setShowCreateForm(false);
      setNewEmail('');
      setNewFullName('');
      setNewRole('order_manager');
      void handleLoadStaff();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'ERROR';
      setActionMessage(
        msg === 'EMAIL_ALREADY_EXISTS' ? 'อีเมลนี้มีอยู่แล้ว' : `เกิดข้อผิดพลาด: ${msg}`,
      );
    }
  };

  const handleError = (e: unknown, friendly: string) => {
    const msg = e instanceof Error ? e.message : 'ERROR';
    setActionMessage(
      msg === 'LAST_SUPER_ADMIN'
        ? 'ไม่สามารถดำเนินการกับ Super Admin คนสุดท้ายได้'
        : msg === 'CANNOT_MODIFY_SELF'
          ? 'ไม่สามารถดำเนินการกับบัญชีตัวเองได้'
          : (`เกิดข้อผิดพลาด: ${msg}` ?? friendly),
    );
  };

  const handleChangeRole = async (staffId: string, newRole: AdminRole) => {
    try {
      await adminJson(`/api/v1/admin/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'role', role: newRole }),
      });
      setActionMessage('เปลี่ยนบทบาทสำเร็จ — เซสชันเดิมของผู้ใช้ถูกเพิกถอน');
      void handleLoadStaff();
    } catch (e) {
      handleError(e, 'เปลี่ยนบทบาทไม่สำเร็จ');
    }
  };

  const handleDeactivate = async (staffId: string) => {
    try {
      await adminJson(`/api/v1/admin/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate', deactivate: true }),
      });
      setActionMessage('ปิดใช้งานพนักงานสำเร็จ — เซสชันทั้งหมดถูกเพิกถอน');
      void handleLoadStaff();
    } catch (e) {
      handleError(e, 'ปิดใช้งานไม่สำเร็จ');
    }
  };

  const handleActivate = async (staffId: string) => {
    try {
      await adminJson(`/api/v1/admin/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate', deactivate: false }),
      });
      setActionMessage('เปิดใช้งานพนักงานสำเร็จ');
      void handleLoadStaff();
    } catch (e) {
      handleError(e, 'เปิดใช้งานไม่สำเร็จ');
    }
  };

  const handleResetPassword = async (staffId: string) => {
    try {
      const result = await adminJson<{ tempPassword: string }>(`/api/v1/admin/staff/${staffId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-password' }),
      });
      setTempPassword(result.tempPassword);
      setActionMessage(
        `รีเซ็ตรหัสผ่านสำเร็จ — รหัสชั่วคราว (แสดงครั้งเดียว): ${result.tempPassword}`,
      );
      void handleLoadStaff();
    } catch (e) {
      handleError(e, 'รีเซ็ตรหัสผ่านไม่สำเร็จ');
    }
  };

  const handleUnlock = async (staffId: string) => {
    try {
      await adminJson(`/api/v1/admin/staff/${staffId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlock' }),
      });
      setActionMessage('ปลดล็อกบัญชีสำเร็จ');
      void handleLoadStaff();
    } catch (e) {
      handleError(e, 'ปลดล็อกไม่สำเร็จ');
    }
  };

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'พนักงาน' }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fg">พนักงาน</h1>
          <div className="flex gap-3">
            <button
              onClick={handleLoadStaff}
              disabled={loading}
              className="rounded-md border border-line-subtle px-4 py-2 text-sm text-fg-secondary hover:bg-surface"
            >
              {loading ? 'กำลังโหลด...' : 'โหลดรายชื่อ'}
            </button>
            <button
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center gap-2 rounded-md bg-peach-500 px-4 py-2 text-sm font-medium text-fg hover:bg-peach-400"
            >
              <Plus size={16} /> เพิ่มพนักงาน
            </button>
          </div>
        </div>

        {actionMessage && (
          <div className="rounded-md border border-jade-500/40 bg-jade-500/10 px-4 py-3 text-sm text-jade-700">
            {actionMessage}
            {tempPassword && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(tempPassword);
                  setActionMessage('คัดลอกรหัสผ่านแล้ว');
                }}
                className="ml-2 inline-flex items-center gap-1 text-fg-brand hover:text-fg-brand"
              >
                <Copy size={12} /> คัดลอก
              </button>
            )}
          </div>
        )}

        {/* Create Staff Form */}
        {showCreateForm && (
          <div className="rounded-md border border-line-subtle bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-fg">เพิ่มพนักงานใหม่</h2>
              <button
                onClick={() => setShowCreateForm(false)}
                className="text-fg-placeholder hover:text-fg"
              >
                <XCircle size={20} />
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm text-fg-muted">อีเมล</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm text-fg focus:border-line-brand"
                  placeholder="staff@nong-kati.co.th"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-fg-muted">ชื่อ</label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm text-fg focus:border-line-brand"
                  placeholder="ชื่อ-นามสกุล"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-fg-muted">บทบาท</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as AdminRole)}
                  className="w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm text-fg focus:border-line-brand"
                >
                  {ALL_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleCreateStaff}
                disabled={!newEmail || !newFullName}
                className="rounded-md bg-peach-500 px-4 py-2 text-sm font-medium text-fg hover:bg-peach-400 disabled:opacity-50"
              >
                สร้าง
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="rounded-md border border-line-subtle px-4 py-2 text-sm text-fg-muted hover:bg-surface"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}

        {/* Staff Table */}
        <div className="overflow-x-auto rounded-md border border-line-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-subtle bg-surface">
                <th className="px-4 py-3 text-left font-medium text-fg-muted">อีเมล</th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">ชื่อ</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">บทบาท</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">สถานะ</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">2FA</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">
                  เข้าสู่ระบบล่าสุด
                </th>
                <th className="px-4 py-3 text-right font-medium text-fg-muted">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-clay-400">
                    {loading ? 'กำลังโหลด...' : 'กด "โหลดรายชื่อ" เพื่อแสดงข้อมูล'}
                  </td>
                </tr>
              ) : (
                staff.map((member) => (
                  <tr key={member.id} className="border-b border-line-subtle hover:bg-surface">
                    <td className="px-4 py-3 text-fg-secondary">{member.email}</td>
                    <td className="px-4 py-3 text-fg-secondary">{member.fullName}</td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={member.role}
                        disabled={member.id === selfId}
                        title={member.id === selfId ? 'บัญชีของคุณเอง' : undefined}
                        onChange={(e) => handleChangeRole(member.id, e.target.value as AdminRole)}
                        className="rounded border border-line-subtle bg-surface px-2 py-1 text-xs text-fg-secondary focus:border-line-brand disabled:opacity-50"
                      >
                        {ALL_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          member.status === 'active'
                            ? 'text-jade-600 bg-jade-500/15'
                            : 'bg-coral-500/15 text-coral-700',
                        )}
                      >
                        {member.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-fg-placeholder">
                      {member.totpConfirmed ? '✓' : '✗'}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-fg-placeholder">
                      {member.lastLoginAt
                        ? new Date(member.lastLoginAt).toLocaleDateString('th-TH')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {member.status === 'locked' && (
                          <button
                            onClick={() => handleUnlock(member.id)}
                            className="text-topaz-600 hover:bg-topaz-50 inline-flex items-center gap-1 rounded px-2 py-1 text-xs"
                          >
                            <LockOpen size={12} /> ปลดล็อก
                          </button>
                        )}
                        {member.id !== selfId && (
                          <button
                            onClick={() => handleResetPassword(member.id)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-fg-secondary hover:bg-surface"
                          >
                            <KeyRound size={12} /> รีเซ็ตรหัสผ่าน
                          </button>
                        )}
                        {member.status === 'active' ? (
                          member.id !== selfId && (
                            <button
                              onClick={() => handleDeactivate(member.id)}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-coral-600 hover:bg-coral-50"
                            >
                              <UserMinus size={12} /> ปิดใช้งาน
                            </button>
                          )
                        ) : (
                          <button
                            onClick={() => handleActivate(member.id)}
                            className="text-jade-600 inline-flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-jade-900/20"
                          >
                            <UserCheck size={12} /> เปิดใช้งาน
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
