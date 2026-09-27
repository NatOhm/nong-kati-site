'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, MailWarning, RefreshCw, Send } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminJson } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

/** Serialized payment row from GET /api/v1/admin/reconciliation. */
interface PaymentRow {
  id: string;
  orderId: string;
  trigger: string;
  paymentRef: string | null;
  recoveryError: string;
  createdAt: string;
  orderStatus: string;
  resolved: boolean;
}

/** Serialized EmailOutbox row with status=failed. */
interface DeadLetterRow {
  id: string;
  idempotencyKey: string;
  templateKey: string;
  toEmail: string;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
}

/** Paid-verified order still pending_payment. */
interface WebhookGapRow {
  id: string;
  orderNumber: string;
  customerEmail: string;
  totalAmountThb: unknown;
  updatedAt: string;
}

interface QueueResponse {
  page: number;
  pageSize: number;
  total: number;
  payments: PaymentRow[];
  deadLetters: DeadLetterRow[];
  webhookGaps: WebhookGapRow[];
  counts: { paymentsOpen: number; deadLetters: number; webhookGaps: number };
}

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'รอชำระเงิน',
  payment_confirmed: 'ยืนยันการชำระ',
  completed: 'สำเร็จ',
  pending_manual_fulfilment: 'รอส่งมอบมือ',
  refunded: 'คืนเงินแล้ว',
  unknown: 'ไม่ทราบสถานะ',
};

const TRIGGER_LABELS: Record<string, string> = {
  slip_verify_recovery_failed: 'ยืนยันสลิปล้มเหลว',
  admin_verify_recovery_failed: 'ยืนยันโดยแอดมินล้มเหลว',
  admin_resume_recovery_failed: 'ส่งมอบซ้ำล้มเหลว',
  webhook_recovery_failed: 'เว็บฮุกล้มเหลว',
  unknown: 'ไม่ทราบสาเหตุ',
};

export default function AdminReconciliationPage(): React.JSX.Element {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [draining, setDraining] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminJson<QueueResponse>('/api/v1/admin/reconciliation?page=1');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดคิวงานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rerun = async (orderId: string) => {
    setBusyOrder(orderId);
    setNotice('');
    try {
      const result = await adminJson<{
        status: string;
        resumed?: boolean;
        codesDelivered?: number;
        message?: string;
      }>(`/api/v1/admin/reconciliation/${orderId}/rerun-fulfilment`, { method: 'POST' });
      if (result.status === 'completed') {
        setNotice(`ส่งมอบสำเร็จ — โค้ด ${result.codesDelivered ?? 0} ชิ้น`);
      } else {
        setNotice(result.message ?? `สถานะปัจจุบัน: ${result.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'RERUN_FAILED';
      if (msg === 'ALREADY_SETTLED' || msg === 'ALREADY_CLAIMED') {
        setNotice('ออเดอร์นี้ถูกดำเนินการแล้วจากทางอื่น — กำลังรีเฟรชคิวงาน');
      } else if (msg === 'RECONCILIATION_REQUIRED' || msg === 'RERUN_FAILED') {
        setError('ดำเนินการไม่สำเร็จ — รายการถูกบันทึกกลับเข้าคิวงานแล้ว แก้สาเหตุแล้วลองอีกครั้ง');
      } else {
        setError(`ดำเนินการไม่สำเร็จ: ${msg}`);
      }
    } finally {
      setBusyOrder(null);
      await load();
    }
  };

  const drain = async () => {
    setDraining(true);
    setNotice('');
    try {
      const result = await adminJson<{
        sent?: number;
        failed?: number;
        failedRemaining?: number;
      }>('/api/v1/internal/email-outbox/drain?limit=25', { method: 'POST' });
      setNotice(
        `ส่งเมลสำเร็จ ${result.sent ?? 0} ฉบับ ล้มเหลว ${result.failed ?? 0} ฉบับ (ค้าง ${result.failedRemaining ?? 0})`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ส่งเมลซ้ำไม่สำเร็จ');
    } finally {
      setDraining(false);
    }
  };

  const payments = data?.payments ?? [];
  const deadLetters = data?.deadLetters ?? [];
  const gaps = data?.webhookGaps ?? [];
  const openPayments = payments.filter((p) => !p.resolved);

  return (
    <AdminShell
      staffName="Founder"
      staffRole="super_admin"
      breadcrumbs={[{ label: 'Reconciliation' }]}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-fg">Reconciliation</h1>
            <p className="text-sm text-fg-placeholder">
              รายการที่ต้องการการดำเนินการจากทีมงาน — เงินเข้าแล้วแต่ส่งมอบ/ส่งเมลยังไม่เสร็จ
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-line-subtle px-4 py-2 text-sm text-fg-secondary hover:bg-surface disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} /> รีเฟรช
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-coral-500/15 px-4 py-3 text-sm text-fg-error">
            <AlertTriangle size={16} /> {error}
          </div>
        )}
        {notice && !error && (
          <div className="rounded-md bg-jade-500/15 px-4 py-3 text-sm text-jade-700 dark:text-jade-200">
            {notice}
          </div>
        )}

        {/* Summary tiles */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-line-subtle bg-surface p-4">
            <div className="text-xs text-fg-placeholder">การชำระเงินค้างยืนยัน</div>
            <div className="mt-1 text-2xl font-bold text-fg">{openPayments.length}</div>
          </div>
          <div className="rounded-md border border-line-subtle bg-surface p-4">
            <div className="text-xs text-fg-placeholder">อีเมลส่งไม่สำเร็จถาวร</div>
            <div className="mt-1 text-2xl font-bold text-fg">{deadLetters.length}</div>
          </div>
          <div className="rounded-md border border-line-subtle bg-surface p-4">
            <div className="text-xs text-fg-placeholder">เว็บฮุกค้าง (เงินเข้า-ออเดอร์ค้าง)</div>
            <div className="mt-1 text-2xl font-bold text-fg">{gaps.length}</div>
          </div>
        </div>

        {/* Payment reconciliation rows */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-fg">การชำระเงินที่ต้องดำเนินการ</h2>
          <div className="overflow-x-auto rounded-md border border-line-subtle">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle bg-surface">
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">วันที่</th>
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">ออเดอร์</th>
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">สถานะ</th>
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">สาเหตุ</th>
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">ข้อผิดพลาด</th>
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-clay-400">
                      {loading ? 'กำลังโหลด...' : 'ไม่มีรายการค้าง — ทุกการชำระเงินถูกส่งมอบแล้ว'}
                    </td>
                  </tr>
                ) : (
                  payments.map((row) => (
                    <tr key={row.id} className="border-b border-line-subtle hover:bg-surface">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-fg-placeholder">
                        {new Date(row.createdAt).toLocaleString('th-TH')}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-fg-placeholder">
                        {row.orderId.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            row.resolved
                              ? 'bg-surface text-fg-muted'
                              : 'bg-coral-500/15 text-fg-error',
                          )}
                        >
                          {STATUS_LABELS[row.orderStatus] ?? row.orderStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-fg-secondary">
                        {TRIGGER_LABELS[row.trigger] ?? row.trigger}
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-xs text-clay-400">
                        {row.recoveryError || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.resolved ? (
                          <span className="text-xs text-fg-placeholder">เสร็จสิ้นแล้ว</span>
                        ) : (
                          <button
                            onClick={() => void rerun(row.orderId)}
                            disabled={busyOrder === row.orderId}
                            className="rounded-md bg-peach-500 px-3 py-1.5 text-xs font-medium text-fg hover:bg-peach-400 disabled:opacity-50"
                          >
                            {busyOrder === row.orderId ? 'กำลังส่งมอบ...' : 'ส่งมอบอีกครั้ง'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Dead-letter emails */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
              <MailWarning size={18} /> อีเมลส่งไม่สำเร็จถาวร
            </h2>
            <button
              onClick={() => void drain()}
              disabled={draining}
              className="inline-flex items-center gap-2 rounded-md border border-line-subtle px-4 py-2 text-sm text-fg-secondary hover:bg-surface disabled:opacity-50"
            >
              <Send size={14} /> {draining ? 'กำลังส่ง...' : 'ส่งใหม่ทั้งหมด'}
            </button>
          </div>
          <div className="overflow-x-auto rounded-md border border-line-subtle">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle bg-surface">
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">ผู้รับ</th>
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">ประเภท</th>
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">พยายามแล้ว</th>
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">
                    ข้อผิดพลาดล่าสุด
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">อัปเดตล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {deadLetters.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-clay-400">
                      {loading ? 'กำลังโหลด...' : 'ไม่มีอีเมลค้างส่ง'}
                    </td>
                  </tr>
                ) : (
                  deadLetters.map((row) => (
                    <tr key={row.id} className="border-b border-line-subtle hover:bg-surface">
                      <td className="px-4 py-3 text-xs text-fg-secondary">{row.toEmail}</td>
                      <td className="px-4 py-3 font-mono text-xs text-fg-placeholder">
                        {row.templateKey}
                      </td>
                      <td className="px-4 py-3 text-xs text-fg-placeholder">{row.attempts}</td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-xs text-clay-400">
                        {row.lastError || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-fg-placeholder">
                        {new Date(row.updatedAt).toLocaleString('th-TH')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Webhook gaps: paid attempt but order still pending */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-fg">เงินเข้าแต่ออเดอร์ยังค้าง</h2>
          <div className="overflow-x-auto rounded-md border border-line-subtle">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle bg-surface">
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">เลขออเดอร์</th>
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">ลูกค้า</th>
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">ยอด (บาท)</th>
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">อัปเดตล่าสุด</th>
                  <th className="px-4 py-3 text-left font-medium text-fg-muted">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {gaps.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-clay-400">
                      {loading ? 'กำลังโหลด...' : 'ไม่มีรายการค้าง'}
                    </td>
                  </tr>
                ) : (
                  gaps.map((row) => (
                    <tr key={row.id} className="border-b border-line-subtle hover:bg-surface">
                      <td className="px-4 py-3 font-mono text-xs text-fg-placeholder">
                        {row.orderNumber}
                      </td>
                      <td className="px-4 py-3 text-xs text-fg-secondary">{row.customerEmail}</td>
                      <td className="px-4 py-3 text-xs text-fg-placeholder">
                        {Number(row.totalAmountThb).toLocaleString('th-TH')}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-fg-placeholder">
                        {new Date(row.updatedAt).toLocaleString('th-TH')}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => void rerun(row.id)}
                          disabled={busyOrder === row.id}
                          className="rounded-md bg-peach-500 px-3 py-1.5 text-xs font-medium text-fg hover:bg-peach-400 disabled:opacity-50"
                        >
                          {busyOrder === row.id ? 'กำลังส่งมอบ...' : 'ส่งมอบอีกครั้ง'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
