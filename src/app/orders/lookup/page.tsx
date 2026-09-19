'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { PageShell } from '@/components/layout/PageShell';
import { OrderLookupForm } from '@/components/order/OrderLookupForm';

interface LookupResponse {
  success?: boolean;
  order?: { confirmationUuid: string };
  error?: { code: string };
}

/**
 * Order Lookup page — per UF-03.
 * Guest order retrieval by email + order number.
 */
export default function OrderLookupPage(): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResponse | null>(null);

  const handleSubmit = useCallback(async (email: string, orderNumber: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Server route wraps the Prisma-backed lookupOrder — the lookup logic
      // must never run in the browser (it pulls in db + email deps).
      const res = await fetch('/api/v1/orders/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, orderNumber }),
      });
      const data: LookupResponse = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.order) {
        // Redirect to order detail
        window.location.href = `/orders/${data.order.confirmationUuid}`;
      } else if (res.status === 404) {
        setError('ไม่พบคำสั่งซื้อ — กรุณาตรวจสอบอีเมลและรหัสคำสั่งซื้อ');
      } else {
        setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      }
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <PageShell maxWidth="prose">
      <div className="py-8">
        {/* Back link */}
        <Link
          href="/"
          className="mb-6 inline-flex min-h-[36px] items-center gap-2 text-sm text-fg-placeholder hover:text-fg-brand"
        >
          <ArrowLeft size={16} />
          กลับ
        </Link>

        {/* Header */}
        <h1 className="mb-2 font-display text-2xl font-bold text-fg">ค้นหาคำสั่งซื้อ</h1>
        <p className="mb-8 text-fg-placeholder">ค้นหาคำสั่งซื้อของคุณด้วยอีเมลและรหัสคำสั่งซื้อ</p>

        {/* Form */}
        <div className="rounded-md border border-line-subtle bg-white p-6">
          <OrderLookupForm onSubmit={handleSubmit} loading={loading} error={error ?? undefined} />
        </div>

        {/* Help text */}
        <div className="mt-8 rounded-md border border-line-subtle bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-fg-secondary">ไม่พบคำสั่งซื้อ?</h2>
          <ul className="space-y-2 text-sm text-fg-placeholder">
            <li>• ตรวจสอบอีเมลที่ใช้สั่งซื้อ</li>
            <li>• รหัสคำสั่งซื้ออยู่ในอีเมลยืนยัน (เช่น NK-2026-XXXXXX)</li>
            <li>• ติดต่อเราหากยังมีปัญหา</li>
          </ul>
        </div>
      </div>
    </PageShell>
  );
}
