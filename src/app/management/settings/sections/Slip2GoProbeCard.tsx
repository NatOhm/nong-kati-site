'use client';

import { useState } from 'react';
import { Key, RefreshCw, Loader2 } from 'lucide-react';

import { adminFetch } from '@/lib/adminSession';
import { cn } from '@/utils/cn';
import { safeJson } from '@/lib/json';

/**
 * One-click Slip2Go account-info probe — the no-purchase connectivity check
 * adapted from the merchant dashboard's REST API example (that example
 * ships with syntax errors and an ambiguous auth scheme; the server route
 * corrects both and reports which scheme worked). Shows quota only; spends
 * no verification credit and touches no order.
 */
export function Slip2GoProbeCard(): React.JSX.Element {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    lines?: string[];
  } | null>(null);

  async function runProbe(): Promise<void> {
    setChecking(true);
    setResult(null);
    try {
      const res = await adminFetch('/api/v1/admin/settings/slip-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await safeJson<{
        ok?: boolean;
        code?: string;
        detail?: string;
        authScheme?: 'raw' | 'bearer';
        account?: {
          shopName?: string | null;
          package?: string | null;
          packageExpiredDate?: string | null;
          tokenRemaining?: number | null;
          tokenLimit?: number | null;
          creditRemaining?: number | null;
        };
      }>(res);
      if (!res.ok) {
        setResult({ ok: false, message: 'ตรวจสอบไม่สำเร็จ — ลองใหม่อีกครั้ง' });
        return;
      }
      if (data.ok && data.account) {
        const a = data.account;
        const lines: string[] = [];
        if (a.shopName) lines.push(`ร้าน: ${a.shopName}`);
        if (a.package) {
          lines.push(
            `แพ็กเกจ: ${a.package}${a.packageExpiredDate ? ` — หมดอายุ ${a.packageExpiredDate}` : ''}`,
          );
        }
        if (typeof a.tokenRemaining === 'number') {
          lines.push(
            `โทเคน API เหลือ: ${a.tokenRemaining}${typeof a.tokenLimit === 'number' ? `/${a.tokenLimit}` : ''}`,
          );
        }
        if (typeof a.creditRemaining === 'number') {
          lines.push(`เครดิตคงเหลือ: ${a.creditRemaining}`);
        }
        setResult({
          ok: true,
          message:
            'เชื่อมต่อสำเร็จ' +
            (data.authScheme ? ` (auth: ${data.authScheme})` : '') +
            ' — ยืนยันเฉพาะการเชื่อมต่อและเครดิตที่เหลือเท่านั้น ไม่ได้พิสูจน์การตรวจสลิปจริง',
          lines,
        });
      } else if (data.code === 'NOT_CONFIGURED') {
        setResult({
          ok: false,
          message:
            'ยังไม่ได้ตั้งค่า NK_SLIP2GO_SECRET ใน environment ของเซิร์ฟเวอร์ — การตรวจสลิปอัตโนมัติจะยังใช้ไม่ได้',
        });
      } else if (data.code === 'AUTH_FAILED') {
        setResult({
          ok: false,
          message:
            'Secret Key ไม่ผ่านทั้งสองแบบ (raw และ Bearer) — สร้างคีย์ใหม่ใน Slip2Go dashboard แล้วอัปเดต NK_SLIP2GO_SECRET',
        });
      } else {
        setResult({
          ok: false,
          message: `ติดต่อ Slip2Go ไม่สำเร็จ${data.detail ? ` (${data.detail})` : ''} — ลองใหม่อีกครั้ง`,
        });
      }
    } catch {
      setResult({ ok: false, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ' });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="rounded-lg border border-line-subtle bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-jade-500/15 text-jade-700">
            <RefreshCw size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-fg">Slip2Go — ตรวจสลิปอัตโนมัติ</p>
            <p className="text-xs text-fg-placeholder">
              ตรวจสอบการเชื่อมต่อ API และเครดิตที่เหลือ (อ่านอย่างเดียว ไม่เสียเครดิต ไม่แตะออเดอร์)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void runProbe()}
          disabled={checking}
          className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:border-peach-400 disabled:opacity-50"
        >
          {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {checking ? 'กำลังตรวจสอบ…' : 'ตรวจสอบการเชื่อมต่อ'}
        </button>
      </div>
      {result && (
        <div className="mt-3 space-y-2">
          <p
            className={cn(
              'rounded-md border px-3 py-2 text-sm',
              result.ok
                ? 'border-jade-500/40 bg-jade-500/10 text-jade-700'
                : 'border-error bg-error text-fg-error',
            )}
          >
            {result.message}
          </p>
          {result.lines && result.lines.length > 0 && (
            <ul className="space-y-1 rounded-md border border-line-subtle bg-surface px-3 py-2 text-xs text-fg-secondary">
              {result.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
