'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wallet, TrendingDown, TrendingUp, Receipt, Banknote, Loader2, X } from 'lucide-react';

import { useCustomerProfile } from '@/components/layout/CustomerProfileProvider';
import { HamsterLoader } from '@/components/loading/HamsterLoader';
import { formatThb } from '@/utils/format';
import { cn } from '@/utils/cn';
import { WALLET_METHOD_LABEL } from '@/lib/walletCredit';

/**
 * กระเป๋าเงิน — เครดิตคงเหลือ, เติมเงินในเดือนนี้, ค่าใช้จ่ายเดือนนี้,
 * ประวัติการเดินเงิน และฟอร์มขอเติมเงินผ่านการโอนเข้าบัญชีร้าน
 * (client ask 2026-11-13: "ปรับเพิ่มเรื่องการเติมเงินผ่าน บช").
 *
 * เติมเงินเป็นคำขอ: ลูกค้าโอนเองและแนบสลิป ระบบสร้างรายการ "รอตรวจสอบ"
 * แล้วแอดมินกดอนุมัติที่ ประวัติเติมเงิน — ไม่มีการเพิ่มเครดิตอัตโนมัติจาก
 * ฝั่งลูกค้า เพื่อไม่ให้ยอดเงินถูกสร้างขึ้นโดยไม่มีเงินเข้าจริง.
 */

interface SpendRow {
  id: string;
  orderNumber: string;
  confirmationUuid: string;
  amountThb: number;
  itemCount: number;
  createdAt: string;
}

interface LedgerRow {
  id: string;
  amountThb: number;
  method: string;
  status: string;
  hasSlip?: boolean;
  createdAt: string;
}

interface WalletData {
  balanceThb: number;
  topupThisMonthThb: number;
  spendThisMonthThb: number;
  topups: LedgerRow[];
  spendHistory?: SpendRow[];
}

interface ManualInfo {
  enabled: boolean;
  accountName: string | null;
  accountNumber: string | null;
  accountType: 'promptpay' | 'bank';
  bankName: string | null;
  qrImageUrl?: string | null;
}

const PRESETS = [100, 300, 500, 1000];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  completed: { label: 'สำเร็จ', className: 'bg-jade-500/15 text-jade-700' },
  pending: { label: 'รอตรวจสอบ', className: 'bg-topaz-400/20 text-peach-800' },
  failed: { label: 'ไม่สำเร็จ', className: 'bg-coral-500/15 text-fg-error' },
};

function ledgerLabel(method: string): string {
  return WALLET_METHOD_LABEL[method] ?? method;
}

export default function WalletPage(): React.JSX.Element {
  const { state: sessionState } = useCustomerProfile();
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [manual, setManual] = useState<ManualInfo | null>(null);

  // Top-up request form
  const [formOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState('100');
  const [note, setNote] = useState('');
  const [slip, setSlip] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetch('/api/v1/wallet', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WalletData | null) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (sessionState !== 'authed') return;
    void load();
  }, [sessionState, load]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/payments/manual-info')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ManualInfo | null) => {
        if (!cancelled) setManual(d && d.enabled ? d : null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const submitTopup = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      setFormErr(null);
      setFormMsg(null);
      try {
        const body = new FormData();
        body.set('amountThb', amount.trim());
        if (note.trim()) body.set('note', note.trim());
        if (slip) body.set('slip', slip);

        const res = await fetch('/api/v1/wallet/topups', {
          method: 'POST',
          credentials: 'include',
          body,
        });
        const payload = (await res.json().catch(() => null)) as {
          success?: boolean;
          message?: string;
          error?: string;
        } | null;

        if (!res.ok || !payload?.success) {
          const code = payload?.error ?? '';
          setFormErr(
            code === 'AMOUNT_TOO_SMALL'
              ? 'ยอดเติมขั้นต่ำ 20 บาท'
              : code === 'AMOUNT_TOO_LARGE'
                ? 'ยอดเติมสูงสุด 100,000 บาทต่อครั้ง'
                : code === 'TOO_MANY_PENDING'
                  ? 'มีคำขอที่รอตรวจสอบครบ 3 รายการแล้ว — รอแอดมินอนุมัติก่อน'
                  : code === 'FILE_TOO_LARGE'
                    ? 'ไฟล์สลิปต้องไม่เกิน 5MB'
                    : code === 'UNSUPPORTED_TYPE' || code === 'CONTENT_MISMATCH'
                      ? 'รองรับเฉพาะรูป JPG / PNG / WEBP'
                      : code === 'UNAUTHENTICATED'
                        ? 'กรุณาเข้าสู่ระบบก่อนเติมเงิน'
                        : 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่',
          );
          return;
        }

        setFormMsg(payload.message ?? 'ส่งคำขอเติมเงินแล้ว — รอแอดมินตรวจสอบ');
        setSlip(null);
        setNote('');
        setFormOpen(false);
        await load();
      } catch {
        setFormErr('ส่งคำขอไม่สำเร็จ กรุณาลองใหม่');
      } finally {
        setBusy(false);
      }
    },
    [amount, note, slip, busy, load],
  );

  if (sessionState === 'loading' || loading) return <HamsterLoader />;

  const stats = [
    {
      icon: <Wallet size={18} className="text-fg-brand" />,
      label: 'เครดิตคงเหลือ',
      value: formatThb(data?.balanceThb ?? 0),
    },
    {
      icon: <TrendingUp size={18} className="text-fg-success" />,
      label: 'เติมเงินในเดือนนี้',
      value: formatThb(data?.topupThisMonthThb ?? 0),
    },
    {
      icon: <TrendingDown size={18} className="text-coral-500" />,
      label: 'ค่าใช้จ่ายในเดือนนี้',
      value: formatThb(data?.spendThisMonthThb ?? 0),
    },
  ];

  const ledger = data?.topups ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-fg">กระเป๋าเงิน</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="clay-card flex items-center gap-3 p-4">
            {s.icon}
            <div>
              <p className="text-xs text-fg-muted">{s.label}</p>
              <p className="text-lg font-bold text-fg">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Top-up request — bank transfer + slip, approved by an admin */}
      <div className="clay-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-fg">เติมเงินผ่านบัญชีธนาคาร</h2>
            <p className="mt-0.5 text-xs text-fg-muted">
              โอนเข้าบัญชีร้าน แล้วแนบสลิป — แอดมินตรวจสอบและเพิ่มเครดิตให้ภายใน 2 ชั่วโมง
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFormOpen((v) => !v);
              setFormErr(null);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-brand px-4 text-sm font-semibold text-fg-inverse transition-opacity hover:opacity-90"
          >
            {formOpen ? <X size={15} /> : <Receipt size={15} />}
            {formOpen ? 'ปิดแบบฟอร์ม' : 'เติมเงิน'}
          </button>
        </div>

        {formMsg && (
          <p
            role="status"
            className="mt-3 rounded-xl border border-jade-500/40 bg-jade-500/10 px-4 py-3 text-sm text-jade-700 dark:text-jade-200"
          >
            {formMsg}
          </p>
        )}

        {formOpen && (
          <form onSubmit={submitTopup} className="mt-4 space-y-4">
            {manual ? (
              <div className="rounded-xl border border-line-brand bg-surface-brand-subtle p-4">
                <div className="flex items-start gap-3">
                  <Banknote size={20} className="mt-0.5 shrink-0 text-fg-brand" />
                  <div className="text-sm">
                    <p className="font-semibold text-fg">
                      {manual.accountType === 'bank' ? 'โอนเงินผ่านธนาคาร' : 'โอนเงินผ่านพร้อมเพย์'}
                    </p>
                    <dl className="mt-2 space-y-1 rounded-md bg-surface p-3">
                      <div className="flex gap-2">
                        <dt className="text-fg-secondary">ชื่อบัญชี:</dt>
                        <dd className="font-medium text-fg">{manual.accountName ?? '—'}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-fg-secondary">
                          {manual.accountType === 'bank' ? 'เลขบัญชี:' : 'พร้อมเพย์:'}
                        </dt>
                        <dd className="font-mono font-medium text-fg">
                          {manual.accountNumber ?? '—'}
                        </dd>
                      </div>
                      {manual.accountType === 'bank' && manual.bankName && (
                        <div className="flex gap-2">
                          <dt className="text-fg-secondary">ธนาคาร:</dt>
                          <dd className="font-medium text-fg">{manual.bankName}</dd>
                        </div>
                      )}
                    </dl>
                    <p className="mt-2 text-xs text-fg-muted">
                      โอนให้ตรงยอดที่กรอกด้านล่าง แล้วแนบสลิปมากับคำขอนี้
                    </p>
                  </div>
                  {manual.qrImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- admin-upload/data-URL source
                    <img
                      src={manual.qrImageUrl}
                      alt="QR บัญชีร้าน"
                      className="hidden h-28 w-28 shrink-0 rounded-lg border border-line-subtle bg-surface object-contain p-1 sm:block"
                    />
                  )}
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-topaz-400/50 bg-topaz-400/10 px-4 py-3 text-sm text-fg-secondary">
                ร้านยังไม่ได้ตั้งค่าบัญชีรับโอน — ติดต่อทีมงานทาง LINE เพื่อขอข้อมูลบัญชี
                แล้วกลับมาแนบสลิปที่นี่ได้
              </p>
            )}

            <div>
              <label htmlFor="topup-amount" className="mb-1.5 block text-sm font-medium text-fg">
                ยอดที่โอน (บาท)
              </label>
              <div className="mb-2 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAmount(String(p))}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                      amount === String(p)
                        ? 'border-peach-500 bg-peach-100 text-peach-800'
                        : 'border-line bg-surface text-fg-secondary hover:border-peach-400',
                    )}
                  >
                    {formatThb(p)}
                  </button>
                ))}
              </div>
              <input
                id="topup-amount"
                type="number"
                inputMode="decimal"
                min={20}
                max={100000}
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-fg focus:border-clay-400"
              />
              <p className="mt-1 text-xs text-fg-muted">ขั้นต่ำ 20 บาท · สูงสุด 100,000 บาทต่อครั้ง</p>
            </div>

            <div>
              <label htmlFor="topup-slip" className="mb-1.5 block text-sm font-medium text-fg">
                สลิปโอนเงิน (แนะนำ)
              </label>
              <input
                id="topup-slip"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setSlip(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-fg-secondary file:mr-3 file:rounded-full file:border-0 file:bg-surface-brand-subtle file:px-4 file:py-2 file:text-sm file:font-semibold file:text-fg-brand"
              />
              {slip && <p className="mt-1 text-xs text-fg-muted">แนบแล้ว: {slip.name}</p>}
            </div>

            <div>
              <label htmlFor="topup-note" className="mb-1.5 block text-sm font-medium text-fg">
                หมายเหตุ (ไม่บังคับ)
              </label>
              <input
                id="topup-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น ชื่อบัญชีผู้โอน / เวลาโอน"
                className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-fg focus:border-clay-400"
              />
            </div>

            {formErr && (
              <p role="alert" className="rounded-xl border border-error bg-error px-4 py-3 text-sm text-fg-error">
                {formErr}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-peach-500 px-5 py-3 text-sm font-semibold text-white shadow-clay-sm transition-colors hover:bg-peach-400 disabled:opacity-60"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {busy ? 'กำลังส่งคำขอ...' : 'ส่งคำขอเติมเงิน'}
            </button>
          </form>
        )}
      </div>

      <div className="clay-card p-5">
        <h2 className="text-base font-bold text-fg">ประวัติการเดินเงิน</h2>

        {ledger.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">
            ยังไม่มีรายการเดินเงิน — เมื่อเติมเงินหรือใช้เครดิตแล้วจะแสดงที่นี่
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {ledger.map((t) => {
              const badge = STATUS_BADGE[t.status] ?? {
                label: t.status,
                className: 'bg-surface text-fg-muted',
              };
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border border-line-subtle px-4 py-3"
                >
                  <div>
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        t.amountThb < 0 ? 'text-fg-error' : 'text-fg',
                      )}
                    >
                      {t.amountThb < 0 ? '' : '+'}
                      {formatThb(t.amountThb)}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {new Date(t.createdAt).toLocaleDateString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {' · '}
                      {ledgerLabel(t.method)}
                      {t.hasSlip ? ' · แนบสลิปแล้ว' : ''}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-medium',
                      badge.className,
                    )}
                  >
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Spending history — from completed ORDERS, so bank-transfer and slip
          purchases appear here too (they never wrote a wallet ledger row). */}
      <div className="clay-card p-5">
        <h2 className="text-base font-bold text-fg">ประวัติการใช้จ่าย</h2>
        {!data || (data.spendHistory ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">
            ยังไม่มีการใช้จ่าย — คำสั่งซื้อที่ชำระสำเร็จจะแสดงที่นี่
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {(data.spendHistory ?? []).map((s) => (
              <li key={s.id}>
                <a
                  href={`/orders/${s.confirmationUuid || s.id}`}
                  className="flex items-center justify-between rounded-xl border border-line-subtle px-4 py-3 transition-colors hover:bg-surface"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">{s.orderNumber}</p>
                    <p className="text-xs text-fg-muted">
                      {new Date(s.createdAt).toLocaleDateString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {' · '}
                      {s.itemCount} ชิ้น
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-fg-error">
                    -{formatThb(s.amountThb)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
