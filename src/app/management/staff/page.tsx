'use client';

import { useState } from 'react';
import { Plus, Shield, UserMinus, UserCheck, XCircle, Copy } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { cn } from '@/utils/cn';
import {
  adminListStaff,
  adminCreateStaff,
  adminChangeStaffRole,
  adminDeactivateStaff,
  type AdminStaffListItem,
} from '@/api/adminStaff';
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

export default function AdminStaffPage(): React.JSX.Element {
  const [staff, setStaff] = useState<AdminStaffListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  // Create form state
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('order_manager');

  const handleLoadStaff = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const result = await adminListStaff();
      setStaff(result);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStaff = async () => {
    const result = await adminCreateStaff(
      { email: newEmail, fullName: newFullName, role: newRole },
      'staff-001',
      'founder@nong-kati.co.th',
    );

    if ('error' in result) {
      setActionMessage(
        result.error === 'EMAIL_ALREADY_EXISTS' ? 'อีเมลนี้มีอยู่แล้ว' : 'เกิดข้อผิดพลาด',
      );
    } else {
      setTempPassword(result.tempPassword);
      setActionMessage(`สร้างพนักงานสำเร็จ — รหัสผ่านชั่วคราว: ${result.tempPassword}`);
      setShowCreateForm(false);
      setNewEmail('');
      setNewFullName('');
      setNewRole('order_manager');
      handleLoadStaff();
    }
  };

  const handleChangeRole = async (staffId: string, newRole: AdminRole) => {
    const result = await adminChangeStaffRole(
      staffId,
      newRole,
      'staff-001',
      'founder@nong-kati.co.th',
    );
    if (result.success) {
      setActionMessage('เปลี่ยนบทบาทสำเร็จ');
      handleLoadStaff();
    }
  };

  const handleDeactivate = async (staffId: string) => {
    const result = await adminDeactivateStaff(
      staffId,
      true,
      'staff-001',
      'founder@nong-kati.co.th',
    );
    if (result.success) {
      setActionMessage('ปิดใช้งานพนักงานสำเร็จ');
      handleLoadStaff();
    } else {
      setActionMessage(
        result.error === 'LAST_SUPER_ADMIN'
          ? 'ไม่สามารถปิดใช้งาน Super Admin คนสุดท้ายได้'
          : 'เกิดข้อผิดพลาด',
      );
    }
  };

  const handleActivate = async (staffId: string) => {
    const result = await adminDeactivateStaff(
      staffId,
      false,
      'staff-001',
      'founder@nong-kati.co.th',
    );
    if (result.success) {
      setActionMessage('เปิดใช้งานพนักงานสำเร็จ');
      handleLoadStaff();
    }
  };

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'พนักงาน' }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-clay-900">พนักงาน</h1>
          <div className="flex gap-3">
            <button
              onClick={handleLoadStaff}
              disabled={loading}
              className="rounded-md border border-clay-200 px-4 py-2 text-sm text-clay-700 hover:bg-clay-100"
            >
              {loading ? 'กำลังโหลด...' : 'โหลดรายชื่อ'}
            </button>
            <button
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center gap-2 rounded-md bg-peach-500 px-4 py-2 text-sm font-medium text-clay-900 hover:bg-peach-400"
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
                className="ml-2 inline-flex items-center gap-1 text-peach-600 hover:text-peach-700"
              >
                <Copy size={12} /> คัดลอก
              </button>
            )}
          </div>
        )}

        {/* Create Staff Form */}
        {showCreateForm && (
          <div className="rounded-md border border-clay-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-clay-900">เพิ่มพนักงานใหม่</h2>
              <button
                onClick={() => setShowCreateForm(false)}
                className="text-clay-500 hover:text-clay-900"
              >
                <XCircle size={20} />
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm text-clay-600">อีเมล</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full rounded-md border border-clay-200 bg-clay-100 px-3 py-2 text-sm text-clay-900 focus:border-peach-300 focus:outline-none"
                  placeholder="staff@nong-kati.co.th"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-clay-600">ชื่อ</label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full rounded-md border border-clay-200 bg-clay-100 px-3 py-2 text-sm text-clay-900 focus:border-peach-300 focus:outline-none"
                  placeholder="ชื่อ-นามสกุล"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-clay-600">บทบาท</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as AdminRole)}
                  className="w-full rounded-md border border-clay-200 bg-clay-100 px-3 py-2 text-sm text-clay-900 focus:border-peach-300 focus:outline-none"
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
                className="rounded-md bg-peach-500 px-4 py-2 text-sm font-medium text-clay-900 hover:bg-peach-400 disabled:opacity-50"
              >
                สร้าง
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="rounded-md border border-clay-200 px-4 py-2 text-sm text-clay-600 hover:bg-clay-100"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}

        {/* Staff Table */}
        <div className="overflow-x-auto rounded-md border border-clay-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-clay-200 bg-clay-100">
                <th className="px-4 py-3 text-left font-medium text-clay-600">อีเมล</th>
                <th className="px-4 py-3 text-left font-medium text-clay-600">ชื่อ</th>
                <th className="px-4 py-3 text-center font-medium text-clay-600">บทบาท</th>
                <th className="px-4 py-3 text-center font-medium text-clay-600">สถานะ</th>
                <th className="px-4 py-3 text-center font-medium text-clay-600">2FA</th>
                <th className="px-4 py-3 text-center font-medium text-clay-600">
                  เข้าสู่ระบบล่าสุด
                </th>
                <th className="px-4 py-3 text-right font-medium text-clay-600">จัดการ</th>
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
                  <tr key={member.id} className="border-b border-clay-200 hover:bg-white">
                    <td className="px-4 py-3 text-clay-700">{member.email}</td>
                    <td className="px-4 py-3 text-clay-700">{member.fullName}</td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={member.role}
                        onChange={(e) => handleChangeRole(member.id, e.target.value as AdminRole)}
                        className="rounded border border-clay-200 bg-clay-100 px-2 py-1 text-xs text-clay-700 focus:border-peach-300 focus:outline-none"
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
                    <td className="px-4 py-3 text-center text-xs text-clay-500">
                      {member.totpConfirmed ? '✓' : '✗'}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-clay-500">
                      {member.lastLoginAt ? member.lastLoginAt.toLocaleDateString('th-TH') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {member.status === 'active' ? (
                        <button
                          onClick={() => handleDeactivate(member.id)}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-coral-600 hover:bg-coral-50"
                        >
                          <UserMinus size={12} /> ปิดใช้งาน
                        </button>
                      ) : (
                        <button
                          onClick={() => handleActivate(member.id)}
                          className="text-jade-600 inline-flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-jade-900/20"
                        >
                          <UserCheck size={12} /> เปิดใช้งาน
                        </button>
                      )}
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
