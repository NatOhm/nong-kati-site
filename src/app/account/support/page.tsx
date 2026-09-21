/**
 * Support Page — 12-dashboard.md §11. Real DB-backed support tickets:
 * submits to POST /api/v1/account/support, shows the returned ticket
 * number, and lists the customer's previous tickets with admin replies.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Send, CheckCircle, MessageSquareText, Loader2 } from 'lucide-react';

import { cn } from '@/utils/cn';

interface MyTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  createdAt: string;
  adminReply: string | null;
}

const STATUS_TH: Record<string, string> = {
  open: 'รอดำเนินการ',
  answered: 'ตอบกลับแล้ว',
  closed: 'ปิดแล้ว',
};

export default function AccountSupportPage(): React.JSX.Element {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [mine, setMine] = useState<MyTicket[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/v1/account/codes', { method: 'HEAD' }).catch(() => undefined);
    // Load my tickets through the same session cookie.
    fetch('/api/v1/account/support', { method: 'GET' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { tickets?: MyTicket[] } | null) => {
        if (alive) setMine(d?.tickets ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (loading) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/v1/account/support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, message }),
        });
        const data = (await res.json().catch(() => ({}))) as { ticketNumber?: string; error?: string };
        if (!res.ok || !data.ticketNumber) {
          setError(
            data.error === 'RATE_LIMITED'
              ? 'ส่งข้อความบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'
              : 'ส่งไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
          );
          return;
        }
        setCreated(data.ticketNumber);
        setSubject('');
        setMessage('');
        // refresh the list
        fetch('/api/v1/account/support', { method: 'GET' })
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { tickets?: MyTicket[] } | null) => setMine(d?.tickets ?? null))
          .catch(() => undefined);
      } finally {
        setLoading(false);
      }
    },
    [subject, message, loading],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-fg">สนับสนุน</h1>

      {created && (
        <div className="rounded-md border border-jade-500/40 bg-jade-500/10 p-6 text-center">
          <CheckCircle size={32} className="text-jade-600 mx-auto mb-3" />
          <h3 className="mb-2 text-lg font-semibold text-fg">ส่งข้อความสำเร็จ</h3>
          <p className="text-sm text-fg-muted">
            หมายเลขตั๋วของคุณคือ{' '}
            <span className="font-mono font-semibold text-fg-brand">{created}</span>
          </p>
          <p className="mt-1 text-sm text-fg-placeholder">
            เราจะตอบกลับภายใน 24 ชั่วโมง ผ่านอีเมลที่คุณลงทะเบียนไว้
          </p>
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="rounded-md border border-line-subtle bg-surface p-6">
        <p className="mb-4 text-sm text-fg-placeholder">
          มีปัญหา? ส่งข้อความหาเรา เราจะตอบกลับภายใน 24 ชั่วโมง
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="ticket-subject" className="mb-1 block text-sm text-fg-muted">หัวข้อ</label>
            <input
              id="ticket-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              maxLength={200}
              className="w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-line-brand focus:outline-none"
              placeholder="ปัญหาเกี่ยวกับ..."
            />
          </div>

          <div>
            <label htmlFor="ticket-message" className="mb-1 block text-sm text-fg-muted">รายละเอียด</label>
            <textarea
              id="ticket-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              maxLength={5000}
              rows={5}
              className="w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-line-brand focus:outline-none"
              placeholder="อธิบายปัญหาของคุณ..."
            />
          </div>

          <button
            type="submit"
            disabled={loading || !subject || !message}
            className="inline-flex items-center gap-2 rounded-md bg-peach-500 px-4 py-2 text-sm font-medium text-white hover:bg-peach-400 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {loading ? 'กำลังส่ง...' : 'ส่งข้อความ'}
          </button>
        </form>
      </div>

      {mine && mine.length > 0 && (
        <div className="rounded-md border border-line-subtle bg-surface p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-fg">
            <MessageSquareText size={18} className="text-fg-brand" />
            ตั๋วของคุณ
          </h2>
          <div className="space-y-3">
            {mine.map((t) => (
              <div key={t.id} className="rounded-md border border-line-subtle p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-fg">{t.ticketNumber}</span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      t.status === 'answered' && 'bg-jade-500/15 text-jade-600',
                      t.status === 'open' && 'bg-peach-500/15 text-peach-600',
                      t.status === 'closed' && 'bg-neutral-500/15 text-fg-muted',
                    )}
                  >
                    {STATUS_TH[t.status] ?? t.status}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-fg">{t.subject}</p>
                {t.adminReply && (
                  <div className="mt-2 rounded-md bg-surface-subtle p-3 text-sm text-fg-muted">
                    <span className="font-semibold text-fg">ทีมงานตอบกลับ:</span> {t.adminReply}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contact Info */}
      <div className="rounded-md border border-line-subtle bg-surface p-6">
        <h2 className="mb-3 text-lg font-semibold text-fg">ช่องทางอื่น</h2>
        <div className="space-y-2 text-sm text-fg-muted">
          <p>
            อีเมล:{' '}
            <a href="mailto:support@nong-kati.co.th" className="text-fg-brand hover:text-fg-brand">
              support@nong-kati.co.th
            </a>
          </p>
          <p>เวลาทำการ: จันทร์-ศุกร์ 9:00-18:00</p>
        </div>
      </div>
    </div>
  );
}
