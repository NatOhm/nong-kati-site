'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { PageShell } from '@/components/layout/PageShell';
import { OrderLookupForm } from '@/components/order/OrderLookupForm';
import { getTopLevelCategories } from '@/lib/data';
import { lookupOrder, type OrderLookupResult } from '@/api/orderLookup';

/**
 * Order Lookup page — per UF-03.
 * Guest order retrieval by email + order number.
 */
export default function OrderLookupPage(): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrderLookupResult | null>(null);

  const categories = getTopLevelCategories();

  const handleSubmit = useCallback(async (email: string, orderNumber: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const lookupResult = lookupOrder(email, orderNumber);
      if (lookupResult.success && lookupResult.order) {
        // Redirect to order detail
        window.location.href = `/orders/${lookupResult.order.confirmationUuid}`;
      } else {
        setError('ไม่พบคำสั่งซื้อ — กรุณาตรวจสอบอีเมลและรหัสคำสั่งซื้อ');
      }
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <>
      <Navbar
        categories={categories.map((c) => ({
          ...c,
          children: c.children.map((ch) => ({ id: ch.id, name: ch.name, slug: ch.slug })),
        }))}
      />

      <main>
        <PageShell maxWidth="prose">
          <div className="py-8">
            {/* Back link */}
            <Link
              href="/"
              className="mb-6 inline-flex items-center gap-2 text-sm text-ink-400 hover:text-amber-300"
            >
              <ArrowLeft size={16} />
              กลับ
            </Link>

            {/* Header */}
            <h1 className="mb-2 font-display text-2xl font-bold text-ink-100">
              ค้นหาคำสั่งซื้อ
            </h1>
            <p className="mb-8 text-ink-400">
              ค้นหาคำสั่งซื้อของคุณด้วยอีเมลและรหัสคำสั่งซื้อ
            </p>

            {/* Form */}
            <div className="rounded-md border border-ink-700 bg-ink-850 p-6">
              <OrderLookupForm
                onSubmit={handleSubmit}
                loading={loading}
                error={error ?? undefined}
              />
            </div>

            {/* Help text */}
            <div className="mt-8 rounded-md border border-ink-700 bg-ink-850 p-6">
              <h2 className="mb-3 text-sm font-semibold text-ink-200">
                ไม่พบคำสั่งซื้อ?
              </h2>
              <ul className="space-y-2 text-sm text-ink-400">
                <li>• ตรวจสอบอีเมลที่ใช้สั่งซื้อ</li>
                <li>• รหัสคำสั่งซื้ออยู่ในอีเมลยืนยัน (เช่น NK-2026-XXXXXX)</li>
                <li>• ติดต่อเราหากยังมีปัญหา</li>
              </ul>
            </div>
          </div>
        </PageShell>
      </main>

      <Footer />
    </>
  );
}
