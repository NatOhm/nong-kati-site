'use client';

import { useState, useEffect } from 'react';
import { Banknote, Save, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';

import { adminFetch } from '@/lib/adminSession';
import { safeJson } from '@/lib/json';

import { useSettingsSaver, type RegisterSaver, Section, ToggleSwitch } from '../shared';

// ─── VAT Settings ────────────────────────────────────────

export function VatSettings({
  registerSaver,
}: {
  registerSaver: RegisterSaver;
}): React.JSX.Element {
  const [enabled, setEnabled] = useState(false);
  const [rate, setRate] = useState('7');
  // ใบกำกับภาษี request surface (client ask: the owner cannot issue them yet,
  // so it has to be switchable off instead of always offered at checkout).
  const [taxInvoiceEnabled, setTaxInvoiceEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/v1/admin/settings/vat')
      .then(async (r) => {
        if (!r.ok) throw new Error((await safeJson<{ error?: string }>(r)).error ?? `HTTP ${r.status}`);
        return r.json() as Promise<{ enabled: boolean; rate: number }>;
      })
      .then((data) => {
        if (cancelled) return;
        setEnabled(data.enabled);
        setRate(String(data.rate));
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    adminFetch('/api/v1/admin/settings/tax-invoice')
      .then((r) => (r.ok ? (r.json() as Promise<{ enabled: boolean }>) : null))
      .then((data) => {
        if (!cancelled && data) setTaxInvoiceEnabled(data.enabled);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const valuesRef = useSettingsSaver(
    registerSaver,
    { enabled, rate, taxInvoiceEnabled },
    saveToApi,
  );

  async function saveToApi(): Promise<void> {
    const { enabled: e, rate: r, taxInvoiceEnabled: ti } = valuesRef.current;
    const res = await adminFetch('/api/v1/admin/settings/vat', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: e, rate: Number(r) }),
    });
    if (!res.ok) {
      const data = await safeJson<{ error?: string }>(res);
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }

    // Separate switch, separate row: turning VAT off must never quietly
    // re-open ใบกำกับภาษี (or the reverse).
    const tiRes = await adminFetch('/api/v1/admin/settings/tax-invoice', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: ti }),
    });
    if (!tiRes.ok) {
      const data = await safeJson<{ error?: string }>(tiRes);
      throw new Error(data.error ?? `HTTP ${tiRes.status}`);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveToApi();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="ภาษีมูลค่าเพิ่ม (VAT)"
      subtitle="設定ภาษีมูลค่าเพิ่มสำหรับร้านค้า — ราคาที่แสดงรวม VAT แล้วเมื่อเปิดใช้งาน"
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-fg-placeholder">กำลังโหลด…</p>
      ) : (
        <>
          <div className="rounded-lg border border-line-subtle bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/15 text-blue-700">
                  <Banknote size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-fg">คิดภาษีมูลค่าเพิ่ม 7%</p>
                  <p className="text-xs text-fg-placeholder">
                    เปิดใช้งานเพื่อแสดง VAT ในราคาสินค้าและสรุปคำสั่งซื้อ
                  </p>
                </div>
              </div>
              <ToggleSwitch enabled={enabled} onChange={setEnabled} />
            </div>

            {enabled && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-fg-muted">
                    อัตราภาษี (%)
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    max="30"
                    step="0.1"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="w-32 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg text-center focus:ring-2 focus:ring-peach-500"
                  />
                  <p className="mt-1 text-xs text-fg-placeholder">
                    ค่าเริ่มต้นคือ 7% — ปรับได้ตั้งแต่ 0.1% ถึง 30%
                  </p>
                </div>

                {/* Live preview */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-placeholder">
                    ตัวอย่างการแสดงผล
                  </p>
                  <div className="rounded-lg border border-line-subtle bg-surface p-4">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-fg">ราคาสินค้า (รวม VAT)</span>
                      <span className="font-semibold text-fg-brand">฿107.00</span>
                    </div>
                    {enabled && (
                      <div className="border-t border-line pt-2">
                        <div className="flex items-center justify-between text-xs text-fg-muted">
                          <span>มูลค่าเพิ่ม 7%</span>
                          <span>฿7.00</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-700">
                  <p>⚠️ <strong>หมายเหตุสำคัญ:</strong></p>
                  <ul className="mt-1 list-disc list-inside space-y-0.5">
                    <li>ราคาสินค้าแสดงตามราคาที่ตั้งไว้ในระบบ (รวม VAT แล้ว)</li>
                    <li>เมื่อเปิดใช้ VAT ระบบจะแสดงยอด VAT แยกเป็นข้อมูลประกอบ</li>
                    <li>ไม่มีการคิด VAT ซ้ำที่ขั้นตอนชำระเงิน</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* ใบกำกับภาษี on/off — independent of VAT itself. */}
          <div className="rounded-lg border border-line-subtle bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-peach-500/15 text-peach-700">
                  <FileText size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-fg">รับคำขอใบกำกับภาษี</p>
                  <p className="text-xs text-fg-placeholder">
                    ปิดไว้เมื่อยังออกใบกำกับภาษีไม่ได้ — ช่องขอใบกำกับภาษีที่หน้าชำระเงินและเมนู
                    ใบกำกับภาษีของลูกค้าจะถูกซ่อน
                  </p>
                </div>
              </div>
              <ToggleSwitch enabled={taxInvoiceEnabled} onChange={setTaxInvoiceEnabled} />
            </div>
            <p className="mt-3 rounded-md bg-surface-elevated px-3 py-2 text-xs text-fg-muted">
              {taxInvoiceEnabled
                ? 'สถานะปัจจุบัน: เปิด — ลูกค้าขอใบกำกับภาษีตอนชำระเงินได้'
                : 'สถานะปัจจุบัน: ปิด — ไม่มีคำขอใบกำกับภาษีใหม่ และหน้าลูกค้าไม่แสดงเมนูนี้'}
            </p>
          </div>

          {error && (
            <div className="border-error bg-error flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-fg-error">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-2 rounded-lg bg-peach-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-peach-400 disabled:opacity-50"
            >
              {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
              {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกแล้ว!' : 'บันทึกการตั้งค่า VAT'}
            </button>
          </div>
        </>
      )}
    </Section>
  );
}
