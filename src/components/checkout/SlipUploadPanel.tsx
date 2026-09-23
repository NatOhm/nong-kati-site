'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, FileImage, Loader2, ShieldCheck, Upload, XCircle } from 'lucide-react';

import { cn } from '@/utils/cn';

/**
 * SlipUploadPanel — automatic slip verification UI (SlipOK).
 * Shown under the PromptPay QR: customer uploads the transfer slip, the
 * backend verifies it against the bank (exact amount + unused ref) and
 * auto-confirms the order. The existing payment-status polling then redirects
 * to the confirmation page — no extra wiring needed here.
 *
 * The panel is inert unless the server offers the feature (GET
 * /api/v1/payments/slip-verify → { enabled }): with no NK_SLIP_OK_KEY the
 * parent hides it entirely and the manual admin-confirm fallback applies.
 */

export function SlipUploadPanel({ orderId }: { orderId: string }): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function pick(f: File | null): void {
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      setResult({ ok: false, message: 'รองรับเฉพาะไฟล์ภาพ JPG/PNG/WebP' });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setResult({ ok: false, message: 'ไฟล์ใหญ่เกิน 5MB — บีบอัดก่อนอัปโหลด' });
      return;
    }
    setResult(null);
    setFile(f);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  }

  async function verify(): Promise<void> {
    if (!file || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.set('orderId', orderId);
      form.set('slip', file);
      const res = await fetch('/api/v1/payments/slip-verify', {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      const body = (await res.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        error?: string;
      };
      if (res.ok && body.status === 'confirmed') {
        setResult({ ok: true, message: body.message ?? 'ตรวจสลิปผ่าน — ส่งโค้ดแล้ว' });
        // The payment poller sees the succeeded attempt and redirects; nudge it along.
      } else if (body.status === 'pending_manual_fulfilment') {
        setResult({ ok: true, message: body.message ?? 'ชำระเงินถูกตรวจแล้ว — รอแอดมินส่งโค้ด' });
      } else {
        setResult({ ok: false, message: body.message ?? body.error ?? 'ตรวจสลิปไม่สำเร็จ' });
      }
    } catch {
      setResult({ ok: false, message: 'เครือข่ายขัดข้อง — ลองอีกครั้ง หรือรอแอดมินยืนยัน' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-line-brand bg-peach-50/60 p-4">
      <div className="flex items-start gap-2">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-fg-brand" />
        <div className="text-sm">
          <p className="font-semibold text-fg">โอนแล้ว? อัปโหลดสลิปเพื่อยืนยันอัตโนมัติ</p>
          <p className="mt-0.5 text-xs text-fg-muted">
            ระบบตรวจกับธนาคารจริง: ยอดต้องตรง, 1 สลิปใช้ได้ 1 ออเดอร์ — ใช้เวลาไม่กี่วินาที
          </p>
        </div>
      </div>

      {result ? (
        <div
          className={cn(
            'mt-3 flex items-start gap-2 rounded-md px-3 py-2.5 text-sm',
            result.ok
              ? 'border border-jade-500/40 bg-jade-900/5 text-jade-700'
              : 'border border-coral-300 bg-coral-50 text-coral-700',
          )}
          role="status"
        >
          {result.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
          <span>{result.message}</span>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 rounded-md border border-line-brand bg-surface px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:bg-peach-50"
            >
              <Upload size={15} />
              {file ? 'เลือกสลิปใหม่' : 'เลือกไฟล์สลิป'}
            </button>
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img
                src={previewUrl}
                alt="สลิปที่เลือก"
                className="h-12 w-12 rounded border border-line-subtle object-cover"
              />
            )}
            {file && (
              <button
                type="button"
                onClick={() => void verify()}
                disabled={busy}
                className="ml-auto flex items-center gap-2 rounded-md bg-peach-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-peach-400 disabled:opacity-60"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <FileImage size={15} />}
                {busy ? 'กำลังตรวจสลิป...' : 'ตรวจสลิปอัตโนมัติ'}
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </>
      )}
    </div>
  );
}
