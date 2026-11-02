'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, FileImage, Loader2, ShieldCheck, Upload, XCircle } from 'lucide-react';

import { cn } from '@/utils/cn';
import { safeJson } from '@/lib/json';
import { CodeBlock } from '@/components/order/CodeBlock';
import type { CustomerCode } from '@/lib/delivery/customerCodes';

/** What the customer bought, delivered on the same verify response. */
interface SlipTicket {
  status: 'confirmed' | 'pending_manual_fulfilment';
  codes: CustomerCode[];
  confirmationUuid: string | null;
}

/**
 * SlipUploadPanel — customer slip upload under the PromptPay QR.
 * Behavior in one panel:
 * 1. If auto-verification is on (slipVerifyEnabled), the slip first goes to
 *    the bank provider — pass = the order confirms instantly (onConfirmed
 *    fires so the page can show the paid state); any failure (wrong amount,
 *    duplicate, provider outage) keeps the provider's reason in the message
 *    and the slip ALREADY sits in the admin queue (the route stores it
 *    server-side), so the manual fallback needs no second upload.
 * 2. If auto-verification is off (no provider key) or the verify request
 *    itself failed, the slip is uploaded directly to the admin:
 *    stored on the order and visible in the admin order detail — the admin
 *    clicks ยืนยันการชำระเงิน as before.
 */

export function SlipUploadPanel({
  orderId,
  slipUploadToken,
  slipVerifyEnabled,
  onConfirmed,
}: {
  orderId: string;
  /** Capability token minted with the order — required by the upload API. */
  slipUploadToken: string | null;
  slipVerifyEnabled: boolean;
  /** Auto verification passed → the page can flip to its paid state. */
  onConfirmed?: (status: 'confirmed' | 'pending_manual_fulfilment') => void;
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  // Set once the bank has verified the slip: the panel stops asking for a
  // file and shows the product + code the customer just paid for.
  const [ticket, setTicket] = useState<SlipTicket | null>(null);

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

  function buildForm(): FormData {
    const form = new FormData();
    form.set('orderId', orderId);
    if (slipUploadToken) {
      form.set('token', slipUploadToken);
    }
    form.set('slip', file!);
    return form;
  }

  async function sendToAdmin(): Promise<boolean> {
    const res = await fetch('/api/v1/payments/slip-upload', {
      method: 'POST',
      body: buildForm(),
      credentials: 'include',
    });
    const body = await safeJson<{ message?: string; error?: string }>(res);
    if (res.ok) {
      setResult({
        ok: true,
        message: body.message ?? 'ได้รับสลิปแล้ว — แอดมินจะตรวจและยืนยันให้เร็วที่สุด',
      });
      return true;
    }
    // Never surface a machine code (`NO_PENDING_ATTEMPT` and friends) as the
    // customer's sentence — the client's screenshot was exactly that.
    setResult({
      ok: false,
      message: body.message ?? 'ส่งสลิปไม่สำเร็จ — ลองอีกครั้ง หรือติดต่อร้านทางแชท',
    });
    return false;
  }

  async function submit(): Promise<void> {
    if (!file || busy) return;
    setBusy(true);
    setResult(null);
    try {
      if (slipVerifyEnabled) {
        // 1) Instant bank verification. The route stores the slip BEFORE it
        //    calls the provider, so no matter what comes back the admin can
        //    already review this exact image.
        let verifyMessage: string | null = null;
        try {
          const res = await fetch('/api/v1/payments/slip-verify', {
            method: 'POST',
            body: buildForm(),
            credentials: 'include',
          });
          const body = await safeJson<{
            status?: string;
            message?: string;
            error?: string;
            slipStored?: boolean;
            confirmationUuid?: string | null;
            codes?: CustomerCode[];
          }>(res);
          if (
            res.ok &&
            (body.status === 'confirmed' || body.status === 'pending_manual_fulfilment')
          ) {
            setResult({ ok: true, message: body.message ?? 'ตรวจสลิปผ่าน — ส่งโค้ดแล้ว' });
            setTicket({
              status: body.status as 'confirmed' | 'pending_manual_fulfilment',
              codes: Array.isArray(body.codes) ? body.codes : [],
              confirmationUuid: body.confirmationUuid ?? null,
            });
            onConfirmed?.(body.status as 'confirmed' | 'pending_manual_fulfilment');
            return;
          }
          if (res.ok) {
            // Unexpected success shape — still hand it to the admin below.
            verifyMessage = body.message ?? null;
          } else {
            // Keep the provider's reason: "why did it not auto-confirm?"
            // (message only — a raw error code is not a sentence)
            verifyMessage = body.message ?? null;
          }
          if (body.slipStored) {
            setResult({
              ok: false,
              message: `${verifyMessage ?? 'ระบบตรวจสลิปยังไม่ยืนยันอัตโนมัติ'} — สลิปถูกส่งให้แอดมินตรวจแล้ว แอดมินจะยืนยันให้เร็วที่สุด`,
            });
            return;
          }
        } catch {
          // Network/parse failure below → fall through to the manual upload.
          verifyMessage = 'ระบบตรวจสลิปขัดข้องชั่วคราว';
        }
        // 2) The server never stored it (verify call failed outright) →
        //    upload the same file so the admin fallback still has evidence.
        const uploaded = await sendToAdmin();
        if (uploaded) {
          setResult({
            ok: false,
            message: `${verifyMessage ?? 'ระบบตรวจสลิปยังไม่ยืนยันอัตโนมัติ'} — สลิปถูกส่งให้แอดมินตรวจแล้ว แอดมินจะยืนยันให้เร็วที่สุด`,
          });
        }
      } else {
        await sendToAdmin();
      }
    } catch {
      setResult({ ok: false, message: 'เครือข่ายขัดข้อง — ลองอีกครั้ง หรือรอแอดมินยืนยัน' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-line-brand bg-surface-brand-subtle p-4">
      <div className="flex items-start gap-2">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-fg-brand" />
        <div className="text-sm">
          <p className="font-semibold text-fg">
            {slipVerifyEnabled
              ? 'โอนแล้ว? อัปโหลดสลิปเพื่อยืนยันอัตโนมัติ'
              : 'โอนแล้ว? ส่งสลิปเพื่อให้แอดมินตรวจยืนยัน'}
          </p>
          <p className="mt-0.5 text-xs text-fg">
            {slipVerifyEnabled
              ? 'ระบบตรวจกับธนาคารจริง: ยอดต้องตรง, 1 สลิปใช้ได้ 1 ออเดอร์ — ใช้เวลาไม่กี่วินาที ถ้าระบบตรวจไม่ผ่าน สลิปจะถูกส่งให้แอดมินตรวจต่อทันที'
              : 'แอดมินจะเห็นสลิปของคุณในหน้าจัดการคำสั่งซื้อ และกดยืนยันให้โค้ดส่งอัตโนมัติ'}
          </p>
        </div>
      </div>

      {/* Paid: the product the customer just bought, on this page. */}
      {ticket && ticket.codes.length > 0 && (
        <div className="mt-3 space-y-3">
          {ticket.codes.map((delivered, idx) => (
            <CodeBlock
              key={`${delivered.code}-${idx}`}
              code={delivered.code}
              productName={delivered.productName}
              denomination={delivered.denomination}
            />
          ))}
        </div>
      )}

      {ticket?.confirmationUuid && (
        <Link
          href={`/checkout/confirmation/${ticket.confirmationUuid}`}
          className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-md border border-line-brand bg-surface px-4 py-2 text-sm font-medium text-fg-brand hover:bg-surface-brand-subtle"
        >
          ดูรายละเอียดคำสั่งซื้อ / โค้ดของฉัน
        </Link>
      )}

      {result ? (
        <div
          className={cn(
            'mt-3 flex items-start gap-2 rounded-md px-3 py-2.5 text-sm',
            result.ok
              ? 'border border-jade-500/40 bg-jade-500/15 text-jade-700 dark:text-jade-200'
              : 'border border-coral-300 bg-coral-50 text-fg-error',
          )}
          role="status"
        >
          {result.ok ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : (
            <XCircle size={16} className="mt-0.5 shrink-0" />
          )}
          <span>{result.message}</span>
        </div>
      ) : ticket ? null : (
        <>
          {/* Wraps on a phone: the select button, thumbnail and submit used to
              share one 390px row and squeeze the submit label. */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex min-h-[44px] items-center gap-2 rounded-md border border-line-brand bg-surface px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-brand-subtle"
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
                onClick={() => void submit()}
                disabled={busy}
                className="ml-auto flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-peach-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-peach-400 disabled:opacity-60 sm:w-auto"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <FileImage size={15} />}
                {busy ? 'กำลังส่งสลิป...' : slipVerifyEnabled ? 'ตรวจสลิป' : 'ส่งสลิปให้แอดมิน'}
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
