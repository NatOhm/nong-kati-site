'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, RefreshCw, Loader2 } from 'lucide-react';

import { adminFetch } from '@/lib/adminSession';
import { cn } from '@/utils/cn';
import { safeJson } from '@/lib/json';

import { SettingsSaver, Section } from '../shared';
import { INPUT_CLASS } from './ChangePassword';

// ─── Notification Settings ────────────────────────────────
export function NotificationSettings({
  registerSaver,
}: {
  registerSaver: (fn: SettingsSaver | null) => void;
}): React.JSX.Element {
  const [discordConfigured, setDiscordConfigured] = useState(false);
  const [threshold, setThreshold] = useState('5');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One-click webhook probe (client ask 2026-10-16): send ONE test embed and
  // report what actually happened — configured/accepted/reachable.
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/v1/admin/settings/notifications')
      .then(async (r) => (r.ok ? r.json() : {}))
      .then((data: { discordConfigured?: boolean; lowStockThreshold?: number }) => {
        if (cancelled) return;
        setDiscordConfigured(data.discordConfigured === true);
        setThreshold(String(data.lowStockThreshold ?? 5));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await adminFetch('/api/v1/admin/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lowStockThreshold: Number(threshold) || 0,
        }),
      });
      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(
          data.error === 'INVALID_THRESHOLD'
              ? 'ค่าเตือนสต๊อกต้องเป็นตัวเลข 0-1000'
              : 'บันทึกไม่สำเร็จ',
        );
      }
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }, [threshold]);

  useEffect(() => {
    registerSaver(save);
    return () => registerSaver(null);
  }, [save, registerSaver]);

  async function runDiscordTest(): Promise<void> {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminFetch('/api/v1/admin/settings/discord-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await safeJson<{
        ok?: boolean;
        error?: string;
        status?: number;
      }>(res);
      if (!res.ok) {
        setTestResult({ ok: false, message: 'ทดสอบไม่สำเร็จ — ลองใหม่อีกครั้ง' });
        return;
      }
      if (data.ok) {
        setTestResult({
          ok: true,
          message: 'ส่งสำเร็จ — เปิดห้อง Discord เพื่อดูข้อความทดสอบได้เลย',
        });
      } else if (data.error === 'WEBHOOK_NOT_CONFIGURED') {
        setTestResult({
          ok: false,
          message:
            'ยังไม่ได้ตั้งค่า webhook — เพิ่ม NK_DISCORD_WEBHOOK_URL ใน environment ของแอป แล้ว Restart App ก่อนทดสอบ',
        });
      } else if (data.error === 'WEBHOOK_UNREACHABLE') {
        setTestResult({
          ok: false,
          message: 'ติดต่อ Discord ไม่สำเร็จ — ตรวจสอบการเชื่อมต่อเน็ตเวิร์กของเซิร์ฟเวอร์',
        });
      } else {
        setTestResult({
          ok: false,
          message: `Discord ปฏิเสธข้อความ${data.status ? ` (HTTP ${data.status})` : ''} — ตรวจสอบว่า webhook ยังไม่ถูกลบ`,
        });
      }
    } catch {
      setTestResult({ ok: false, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ' });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Section
      title="การแจ้งเตือน"
      subtitle="แจ้งเตือนออเดอร์ใหม่ การชำระเงิน และสต๊อกใกล้หมด ผ่าน Discord (ตามเวลาจริง)"
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-fg-muted">กำลังโหลด...</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line-subtle bg-surface px-3 py-2">
            <p className="text-sm text-fg-secondary">
              Discord: {discordConfigured ? 'ตั้งค่า webhook ใน environment แล้ว' : 'ยังไม่เปิดใช้งาน — รอการตั้งค่า webhook ใน environment'}
            </p>
            <button
              type="button"
              onClick={() => void runDiscordTest()}
              disabled={testing}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:border-peach-400 disabled:opacity-50"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {testing ? 'กำลังส่ง…' : 'ส่งข้อความทดสอบ'}
            </button>
          </div>
          {testResult && (
            <p
              className={cn(
                'rounded-md border px-3 py-2 text-sm',
                testResult.ok
                  ? 'border-jade-500/40 bg-jade-500/10 text-jade-700'
                  : 'border-error bg-error text-fg-error',
              )}
            >
              {testResult.message}
            </p>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-fg">
              เตือนเมื่อสต๊อกเหลือไม่เกิน (ชิ้น)
            </label>
            <input
              type="number"
              min="0"
              max="1000"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value.replace(/[^0-9]/g, ''))}
              className={cn(INPUT_CLASS, 'max-w-32')}
            />
          </div>
          {error && (
            <div className="border-error bg-error rounded-md border px-4 py-3 text-sm text-fg-error">
              {error}
            </div>
          )}
          {saved && (
            <div className="rounded-md border border-jade-500/40 bg-jade-500/10 px-4 py-3 text-sm text-jade-700">
              บันทึกเรียบร้อย — การแจ้งเตือนจะส่งเข้า Discord ทันทีที่มีออเดอร์/สต๊อกต่ำ
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
