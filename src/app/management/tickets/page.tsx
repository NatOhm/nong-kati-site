/**
 * Admin Support Tickets — real DB-backed ticket queue (tickets:read /
 * tickets:write). List with status filter + search, detail drawer with the
 * customer's message, reply / close / reopen actions.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw,
  Search,
  LifeBuoy,
  Loader2,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminJson } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

interface TicketListItem {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  customerEmail: string;
  customerName: string | null;
  createdAt: string;
  answeredAt: string | null;
}

interface TicketDetail extends TicketListItem {
  message: string;
  adminReply: string | null;
  answeredByName: string | null;
  closedAt: string | null;
}

const STATUS_TH: Record<string, string> = {
  open: 'รอดำเนินการ',
  answered: 'ตอบกลับแล้ว',
  closed: 'ปิดแล้ว',
};

function statusChip(status: string): React.JSX.Element {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'open' && 'bg-peach-500/15 text-peach-600',
        status === 'answered' && 'bg-jade-500/15 text-jade-600',
        status === 'closed' && 'bg-neutral-500/15 text-fg-muted',
      )}
    >
      {STATUS_TH[status] ?? status}
    </span>
  );
}

export default function AdminTicketsPage(): React.JSX.Element {
  const [items, setItems] = useState<TicketListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (q.trim()) params.set('q', q.trim());
      const data = await adminJson<{ items: TicketListItem[]; total: number; openCount: number }>(
        `/api/v1/admin/tickets?${params.toString()}`,
      );
      setItems(data.items);
      setTotal(data.total);
      setOpenCount(data.openCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [status, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setActionMsg(null);
    setActionErr(null);
    setReply('');
    try {
      const data = await adminJson<{ ticket: TicketDetail }>(`/api/v1/admin/tickets/${id}`);
      setSelected(data.ticket);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'โหลดตั๋วไม่สำเร็จ');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const act = useCallback(
    async (action: 'reply' | 'close' | 'reopen') => {
      if (!selected) return;
      setActionBusy(true);
      setActionMsg(null);
      setActionErr(null);
      try {
        await adminJson(`/api/v1/admin/tickets/${selected.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action === 'reply' ? { action, reply } : { action }),
        });
        setActionMsg(
          action === 'reply' ? 'ตอบกลับแล้ว' : action === 'close' ? 'ปิดตั๋วแล้ว' : 'เปิดตั๋วใหม่แล้ว',
        );
        setReply('');
        const data = await adminJson<{ ticket: TicketDetail }>(`/api/v1/admin/tickets/${selected.id}`);
        setSelected(data.ticket);
        void load();
      } catch (e) {
        setActionErr(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ');
      } finally {
        setActionBusy(false);
      }
    },
    [selected, reply, load],
  );

  return (
    <AdminShell
      staffName="Founder"
      staffRole="super_admin"
      breadcrumbs={[{ label: 'ตั๋วสนับสนุน' }]}
    >
      <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-fg">ตั๋วสนับสนุน</h1>
        <p className={cn('text-sm', openCount > 0 ? 'text-peach-600 font-medium' : 'text-fg-muted')}>
          {openCount > 0 ? `${openCount} ตั๋วรอดำเนินการ` : 'ไม่มีตั๋วรอดำเนินการ'}
        </p>
      </div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {[
            { v: '', label: 'ทั้งหมด' },
            { v: 'open', label: 'รอดำเนินการ' },
            { v: 'answered', label: 'ตอบกลับแล้ว' },
            { v: 'closed', label: 'ปิดแล้ว' },
          ].map((f) => (
            <button
              key={f.v}
              type="button"
              onClick={() => setStatus(f.v)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm',
                status === f.v ? 'bg-surface-brand text-fg font-semibold' : 'text-fg-muted hover:bg-surface-subtle',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-2.5 text-fg-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา เลขตั๋ว / หัวข้อ / อีเมล"
            className="w-56 rounded-md border border-line-subtle bg-surface py-1.5 pl-8 pr-3 text-sm text-fg placeholder:text-fg-muted focus:border-line-brand focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-line-subtle p-2 text-fg-muted hover:bg-surface-subtle"
          aria-label="รีเฟรช"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-600">
          {error}{' '}
          <button type="button" onClick={() => void load()} className="underline">
            ลองใหม่
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-fg-muted" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-line-subtle bg-surface p-10 text-center">
          <LifeBuoy size={28} className="mx-auto mb-2 text-fg-muted" />
          <p className="text-sm text-fg-muted">ไม่มีตั๋วในหมวดนี้</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-line-subtle bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-subtle text-left text-xs text-fg-muted">
                <th className="px-4 py-3">เลขตั๋ว</th>
                <th className="px-4 py-3">หัวข้อ</th>
                <th className="px-4 py-3">ผู้ส่ง</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3">ส่งเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => void openDetail(t.id)}
                  className="cursor-pointer border-b border-line-subtle last:border-0 hover:bg-surface-subtle"
                >
                  <td className="px-4 py-3 font-mono text-xs">{t.ticketNumber}</td>
                  <td className="max-w-[240px] truncate px-4 py-3 font-medium text-fg">{t.subject}</td>
                  <td className="px-4 py-3 text-fg-muted">
                    {t.customerName ? `${t.customerName} · ` : ''}
                    {t.customerEmail}
                  </td>
                  <td className="px-4 py-3">{statusChip(t.status)}</td>
                  <td className="px-4 py-3 text-xs text-fg-muted">
                    {new Date(t.createdAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && items.length > 0 && (
        <p className="mt-2 text-xs text-fg-muted">ทั้งหมด {total} ตั๋ว · กดที่แถวเพื่อดูรายละเอียด</p>
      )}

      {/* Detail drawer */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setSelected(null)}>
          <div
            className="h-full w-full max-w-lg overflow-y-auto bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading || !selected ? (
              <div className="flex justify-center py-16">
                <Loader2 className="animate-spin text-fg-muted" />
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelected(null)}
                        className="rounded-md p-1 text-fg-muted hover:bg-surface-subtle"
                        aria-label="กลับ"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span className="font-mono text-sm font-bold text-fg">{selected.ticketNumber}</span>
                      {statusChip(selected.status)}
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-fg">{selected.subject}</h2>
                    <p className="text-xs text-fg-muted">
                      {selected.customerName ? `${selected.customerName} · ` : ''}
                      {selected.customerEmail} · {new Date(selected.createdAt).toLocaleString('th-TH')}
                    </p>
                  </div>
                </div>

                <div className="rounded-md border border-line-subtle bg-surface-subtle p-4 text-sm text-fg">
                  {selected.message}
                </div>

                {selected.adminReply && (
                  <div className="mt-3 rounded-md border border-jade-500/40 bg-jade-500/10 p-4 text-sm text-fg">
                    <div className="mb-1 flex items-center gap-1 text-xs text-jade-600">
                      <CheckCircle2 size={12} />
                      ตอบกลับโดย {selected.answeredByName ?? 'แอดมิน'} ·{' '}
                      {selected.answeredAt ? new Date(selected.answeredAt).toLocaleString('th-TH') : ''}
                    </div>
                    {selected.adminReply}
                  </div>
                )}

                {selected.status !== 'closed' && (
                  <div className="mt-5 space-y-3">
                    <label htmlFor="admin-reply" className="block text-sm font-medium text-fg">
                      ตอบกลับ
                    </label>
                    <textarea
                      id="admin-reply"
                      rows={4}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="พิมพ์คำตอบถึงลูกค้า..."
                      className="w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-line-brand focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={actionBusy || !reply.trim()}
                        onClick={() => void act('reply')}
                        className="inline-flex items-center gap-1.5 rounded-md bg-peach-500 px-4 py-2 text-sm font-medium text-white hover:bg-peach-400 disabled:opacity-50"
                      >
                        {actionBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        ส่งคำตอบ
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void act('close')}
                        className="inline-flex items-center gap-1.5 rounded-md border border-line-subtle px-4 py-2 text-sm text-fg hover:bg-surface-subtle disabled:opacity-50"
                      >
                        <XCircle size={14} />
                        ปิดตั๋ว
                      </button>
                    </div>
                  </div>
                )}
                {selected.status === 'closed' && (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void act('reopen')}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-line-subtle px-4 py-2 text-sm text-fg hover:bg-surface-subtle disabled:opacity-50"
                  >
                    <RotateCcw size={14} />
                    เปิดตั๋วใหม่
                  </button>
                )}

                {actionMsg && <p className="mt-3 text-sm text-jade-600">{actionMsg}</p>}
                {actionErr && <p className="mt-3 text-sm text-red-600">{actionErr}</p>}
              </>
            )}
          </div>
        </div>
      )}
      </div>
    </AdminShell>
  );
}
