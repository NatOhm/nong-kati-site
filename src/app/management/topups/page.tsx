'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Wallet, Clock, Loader2, CheckCircle, XCircle, Receipt } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminFetch, adminJson } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

/**
 * Admin Top-up History — real TopUpLog rows with customer join + summary
 * (client list: "Top-up history" in main navigation).
 */

interface TopupRow {
  id: string;
  createdAt: string;
  customerEmail: string;
  customerName: string | null;
  amount: number;
  method: string;
  methodLabel: string;
  reference: string | null;
  status: string;
}

interface TopupResponse {
  logs: TopupRow[];
  summary: { completedTotal: number; completedCount: number; pendingCount: number };
}

const STATUS_TH: Record<string, string> = {
  completed: 'สำเร็จ',
  pending: 'รอดำเนินการ',
  failed: 'ไม่สำเร็จ',
};

export default function AdminTopupsPage(): React.JSX.Element {
  const [data, setData] = useState<TopupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  // Money in vs wallet debits — the mixed table read as "top-ups" while it
  // listed −฿1 purchase rows (client feedback 2026-11-13).
  const [typeFilter, setTypeFilter] = useState<'all' | 'credit' | 'spend'>('credit');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [reviewErr, setReviewErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await adminJson<TopupResponse>(
        `/api/v1/admin/topups?status=${encodeURIComponent(statusFilter)}&type=${typeFilter}`,
      );
      setData(d);
    } catch {
      setErr('โหลดประวัติเติมเงินไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  /** Approve = credit the wallet; reject = close without crediting. */
  const review = async (id: string, action: 'approve' | 'reject'): Promise<void> => {
    if (reviewingId) return;
    if (action === 'reject' && !window.confirm('ปฏิเสธคำขอเติมเงินนี้? เครดิตจะไม่ถูกเพิ่ม')) {
      return;
    }
    setReviewingId(id);
    setReviewMsg(null);
    setReviewErr(null);
    try {
      await adminJson<{ success: boolean }>(`/api/v1/admin/topups/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      setReviewMsg(
        action === 'approve' ? 'อนุมัติแล้ว — เพิ่มเครดิตเข้ากระเป๋าลูกค้า' : 'ปฏิเสธคำขอแล้ว',
      );
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setReviewErr(
        msg.includes('ALREADY_REVIEWED')
          ? 'รายการนี้ถูกตรวจสอบไปแล้ว'
          : msg.includes('TOPUP_NOT_FOUND')
            ? 'ไม่พบรายการนี้'
            : msg.includes('FORBIDDEN') || msg.includes('INSUFFICIENT_PERMISSIONS')
              ? 'ไม่มีสิทธิ์อนุมัติ — ต้องมีสิทธิ์จัดการลูกค้า'
              : 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่',
      );
    } finally {
      setReviewingId(null);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminShell
      staffRole="super_admin"
      breadcrumbs={[{ label: 'ประวัติเติมเงิน' }]}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fg">ประวัติเติมเงิน</h1>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-subtle bg-surface px-3 py-1.5 text-sm text-fg-secondary transition-colors hover:bg-surface-elevated"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> รีเฟรช
          </button>
        </div>

        {data && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line-subtle bg-surface p-4">
              <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                <Wallet size={13} />{' '}
                {typeFilter === 'spend' ? 'ยอดใช้เครดิตสำเร็จรวม' : 'ยอดเติมสำเร็จรวม'}
              </p>
              <p className="mt-1 text-2xl font-bold text-fg">
                ฿{data.summary.completedTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-xl border border-line-subtle bg-surface p-4">
              <p className="text-xs text-fg-muted">รายการสำเร็จ</p>
              <p className="mt-1 text-2xl font-bold text-fg">{data.summary.completedCount}</p>
            </div>
            <div className="rounded-xl border border-line-subtle bg-surface p-4">
              <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                <Clock size={13} /> รอดำเนินการ
              </p>
              <p className="mt-1 text-2xl font-bold text-fg">{data.summary.pendingCount}</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-line-subtle bg-surface px-3 py-2 text-sm text-fg-secondary focus:ring-2 focus:ring-peach-500"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="completed">สำเร็จ</option>
            <option value="pending">รอดำเนินการ</option>
            <option value="failed">ไม่สำเร็จ</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | 'credit' | 'spend')}
            className="rounded-lg border border-line-subtle bg-surface px-3 py-2 text-sm text-fg-secondary focus:ring-2 focus:ring-peach-500"
          >
            <option value="credit">รายการเติมเงิน (เงินเข้า)</option>
            <option value="spend">การใช้เครดิต (เงินออก)</option>
            <option value="all">ทั้งเงินเข้าและเงินออก</option>
          </select>
        </div>

        {reviewMsg && (
          <div className="rounded-lg border border-jade-500/40 bg-jade-500/10 px-4 py-3 text-sm text-jade-700">
            {reviewMsg}
          </div>
        )}
        {reviewErr && (
          <div className="border-error bg-error rounded-lg border px-4 py-3 text-sm text-fg-error">
            {reviewErr}
          </div>
        )}

        {err && (
          <div className="border-error bg-error rounded-lg border px-4 py-3 text-sm text-fg-error">
            {err}
            <button onClick={() => void load()} className="ml-2 font-semibold underline">
              ลองอีกครั้ง
            </button>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-line-subtle bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line-subtle bg-surface-elevated text-left">
                <th className="px-4 py-3 font-medium text-fg-secondary">วันที่</th>
                <th className="px-4 py-3 font-medium text-fg-secondary">ลูกค้า</th>
                <th className="px-4 py-3 text-right font-medium text-fg-secondary">จำนวนเงิน</th>
                <th className="px-4 py-3 font-medium text-fg-secondary">ช่องทาง</th>
                <th className="px-4 py-3 font-medium text-fg-secondary">อ้างอิง</th>
                <th className="px-4 py-3 text-center font-medium text-fg-secondary">สถานะ</th>
                <th className="px-4 py-3 text-center font-medium text-fg-secondary">ตรวจสอบ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-fg-placeholder">
                    <Loader2 size={22} className="mx-auto mb-2 animate-spin" /> กำลังโหลด…
                  </td>
                </tr>
              ) : !data || data.logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-fg-placeholder">
                    ยังไม่มีรายการเติมเงิน
                  </td>
                </tr>
              ) : (
                data.logs.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-line-subtle last:border-0 hover:bg-surface-elevated"
                  >
                    <td className="px-4 py-3 text-fg-secondary">
                      {new Date(t.createdAt).toLocaleDateString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-fg">{t.customerName ?? '—'}</p>
                      <p className="text-xs text-fg-placeholder">{t.customerEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-fg">
                      ฿{t.amount.toLocaleString('th-TH')}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">{t.methodLabel}</td>
                    <td className="max-w-[220px] px-4 py-3 text-xs text-fg-placeholder">
                      <ReferenceCell reference={t.reference} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                          t.status === 'completed'
                            ? 'bg-jade-500/15 text-jade-700'
                            : t.status === 'pending'
                              ? 'bg-peach-500/15 text-peach-700'
                              : 'bg-coral-500/15 text-fg-error',
                        )}
                      >
                        {STATUS_TH[t.status] ?? t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {t.status === 'pending' ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void review(t.id, 'approve')}
                            disabled={reviewingId === t.id}
                            className="inline-flex items-center gap-1 rounded-md border border-jade-500/50 bg-jade-500/15 px-2.5 py-1 text-xs font-semibold text-jade-700 disabled:opacity-50"
                          >
                            <CheckCircle size={13} /> อนุมัติ
                          </button>
                          <button
                            type="button"
                            onClick={() => void review(t.id, 'reject')}
                            disabled={reviewingId === t.id}
                            className="inline-flex items-center gap-1 rounded-md border border-line-subtle px-2.5 py-1 text-xs font-semibold text-fg-secondary disabled:opacity-50"
                          >
                            <XCircle size={13} /> ปฏิเสธ
                          </button>
                        </div>
                      ) : (
                        <span className="block text-center text-xs text-fg-placeholder">—</span>
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

/**
 * Slip evidence on a bank-transfer top-up. The image lives in the private
 * `slip:` namespace, so it is fetched with the admin's session (adminFetch)
 * and shown from a blob URL — never a public link.
 */
function SlipEvidence({ path }: { path: string }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (objectUrlRef.current) {
      setSrc(objectUrlRef.current);
      return;
    }
    let cancelled = false;
    adminFetch(path)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error('SLIP_FETCH_FAILED'))))
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, path]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-line-subtle px-2 py-1 text-xs font-medium text-fg-secondary hover:bg-surface-elevated"
      >
        <Receipt size={12} /> {open ? 'ซ่อนสลิป' : 'ดูสลิป'}
      </button>
      {open && (
        <div className="mt-2">
          {failed ? (
            <p className="text-xs text-fg-error">โหลดสลิปไม่สำเร็จ</p>
          ) : src ? (
            <a href={src} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob URL from adminFetch */}
              <img
                src={src}
                alt="สลิปโอนเงินของลูกค้า"
                className="h-28 w-28 rounded-lg border border-line-subtle object-cover"
              />
            </a>
          ) : (
            <Loader2 size={16} className="animate-spin text-fg-placeholder" />
          )}
        </div>
      )}
    </div>
  );
}

/** Reference column: a slip path becomes evidence, anything else stays text. */
function ReferenceCell({ reference }: { reference: string | null }): React.JSX.Element {
  if (!reference) return <span className="text-fg-placeholder">—</span>;
  const [head, ...rest] = reference.split('|');
  const note = rest.join('|');
  const isSlip = Boolean(head?.startsWith('/api/v1/payments/slip-download/'));
  return (
    <div className="space-y-1">
      {isSlip && head ? <SlipEvidence path={head} /> : null}
      {!isSlip && <span className="break-all font-mono">{reference}</span>}
      {note && <p className="break-words text-fg-muted">{note}</p>}
    </div>
  );
}
