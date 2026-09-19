'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Store,
  CreditCard,
  Mail,
  Shield,
  Bell,
  Megaphone,
  Palette,
  Save,
  Eye,
  EyeOff,
  Key,
  Smartphone,
  Lock,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Plus,
  ArrowUp,
  ArrowDown,
  Loader2,
} from 'lucide-react';
import { AdminShell } from '@/components/layout/AdminShell';
import { adminFetch, clearAdminSession } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

/** A tab's save implementation, registered with the page so the header
 *  button can trigger the active tab's real save. */
type SettingsSaver = () => Promise<void>;

type SettingsTab =
  | 'announcement'
  | 'banner'
  | 'appearance'
  | 'store'
  | 'payment'
  | 'email'
  | 'security'
  | 'notifications';

const TABS: { id: SettingsTab; label: string; icon: typeof Store }[] = [
  { id: 'announcement', label: 'แถบประกาศ', icon: Megaphone },
  { id: 'banner', label: 'แบนเนอร์หน้าแรก', icon: ImageIcon },
  { id: 'appearance', label: 'ธีมและแอนิเมชัน', icon: Palette },
  { id: 'store', label: 'ร้านค้า', icon: Store },
  { id: 'payment', label: 'การชำระเงิน', icon: CreditCard },
  { id: 'email', label: 'อีเมล', icon: Mail },
  { id: 'security', label: 'ความปลอดภัย', icon: Shield },
  { id: 'notifications', label: 'การแจ้งเตือน', icon: Bell },
];

export default function AdminSettingsPage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<SettingsTab>('store');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // The active tab registers its real save here; null when the tab has no
  // backend (payment/email/security/notifications are placeholders).
  const saverRef = useRef<SettingsSaver | null>(null);
  const [canSave, setCanSave] = useState(false);

  // Deep link support (e.g. forced password change after first login).
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab && TABS.some((t) => t.id === tab)) setActiveTab(tab as SettingsTab);
  }, []);

  const registerSaver = useCallback((fn: SettingsSaver | null) => {
    saverRef.current = fn;
    setCanSave(fn !== null);
  }, []);

  async function handleSave() {
    const save = saverRef.current;
    if (!save || saveState === 'saving') return;
    setSaveState('saving');
    try {
      await save();
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 2500);
    }
  }

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'ตั้งค่า' }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-fg">ตั้งค่า</h1>
            <p className="mt-1 text-sm text-fg-placeholder">
              จัดการการตั้งค่าร้านค้า ระบบชำระเงิน และความปลอดภัย
            </p>
          </div>
          <button
            onClick={() => void handleSave()}
            disabled={!canSave || saveState === 'saving'}
            title={canSave ? undefined : 'ส่วนนี้ยังไม่รองรับการบันทึก'}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-fg transition-colors',
              canSave
                ? 'bg-peach-500 hover:bg-peach-400'
                : 'cursor-not-allowed bg-surface text-fg-placeholder',
            )}
          >
            {saveState === 'saved' ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {saveState === 'saving' && 'กำลังบันทึก…'}
            {saveState === 'saved' && 'บันทึกแล้ว!'}
            {saveState === 'error' && 'บันทึกไม่สำเร็จ'}
            {saveState === 'idle' && 'บันทึกการตั้งค่า'}
          </button>
        </div>

        <div className="flex gap-6">
          {/* Tab Navigation */}
          <div className="w-48 flex-shrink-0">
            <nav className="space-y-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                      activeTab === tab.id
                        ? 'border-line-brand/30 border bg-peach-100 text-fg-brand'
                        : 'border border-transparent text-fg-placeholder hover:bg-surface hover:text-fg',
                    )}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="flex-1">
            {activeTab === 'announcement' && <AnnouncementSettings registerSaver={registerSaver} />}
            {activeTab === 'banner' && <BannerSettings />}
            {activeTab === 'appearance' && <AppearanceSettings registerSaver={registerSaver} />}
            {activeTab === 'store' && <StoreSettings registerSaver={registerSaver} />}
            {activeTab === 'payment' && <PaymentSettings />}
            {activeTab === 'email' && <EmailSettings />}
            {activeTab === 'security' && <SecuritySettings />}
            {activeTab === 'notifications' && (
              <NotificationSettings registerSaver={registerSaver} />
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

// ─── Announcement Bar Settings ────────────────────────
interface AnnouncementContent {
  message: string;
  href: string | null;
  enabled: boolean;
}

function AnnouncementSettings({
  registerSaver,
}: {
  registerSaver: (fn: SettingsSaver | null) => void;
}): React.JSX.Element {
  const [message, setMessage] = useState('');
  const [href, setHref] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/v1/admin/announcement')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json() as Promise<AnnouncementContent>;
      })
      .then((data) => {
        if (cancelled) return;
        setMessage(data.message);
        setHref(data.href ?? '');
        setEnabled(data.enabled);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Latest values for the header-registered saver (stable closure, fresh data).
  const valuesRef = useRef({ message, href, enabled });
  valuesRef.current = { message, href, enabled };

  async function saveToApi(): Promise<void> {
    const { message: m, href: h, enabled: en } = valuesRef.current;
    const res = await adminFetch('/api/v1/admin/announcement', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: m.trim(), href: h.trim() || null, enabled: en }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
  }

  // Header save button drives this tab's real save.
  useEffect(() => {
    registerSaver(saveToApi);
    return () => registerSaver(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerSaver]);

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
      title="แถบประกาศหน้าเว็บ"
      subtitle="ข้อความที่แสดงในแถบด้านบนสุดของหน้าร้าน — บันทึกแล้วจะแสดงทุกหน้าทันที"
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-fg-placeholder">กำลังโหลด…</p>
      ) : (
        <>
          <Field label="ข้อความประกาศ">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="เช่น 🎉 โปรโมชั่นพิเศษ! HBO Max 7 วัน ลดเหลือ ฿25"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
            />
          </Field>
          <Field label="ลิงก์ (ไม่บังคับ) — เช่น /product/hbo-max-7-4k-4">
            <input
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="/product/..."
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
            />
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-line-subtle bg-surface px-4 py-3">
            <div>
              <p className="text-sm font-medium text-fg-secondary">แสดงแถบประกาศ</p>
              <p className="text-xs text-clay-400">ปิดเพื่อซ่อนแถบทั้งหมดชั่วคราว</p>
            </div>
            <ToggleSwitch enabled={enabled} onChange={setEnabled} />
          </div>

          {/* Live preview */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-placeholder">
              ตัวอย่าง
            </p>
            <div className="rounded-lg bg-gradient-to-r from-peach-400 via-peach-300 to-peach-400 px-4 py-2 text-center">
              <p className="text-sm font-medium text-fg">
                {message || <span className="opacity-60">(ข้อความว่าง)</span>}
                {href && (
                  <>
                    {' — '}
                    <span className="font-bold underline">กดซื้อเลย!</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-coral-300 bg-coral-50 px-4 py-3 text-sm text-coral-700">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-2 rounded-lg bg-peach-500 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-peach-400 disabled:opacity-50"
            >
              {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
              {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกแล้ว!' : 'บันทึกประกาศ'}
            </button>
          </div>
        </>
      )}
    </Section>
  );
}

// ─── Appearance (theme + animation speed) ────────────────

const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: 'บัตเตอร์สก็อต (เดิม)', hex: '#F97316' },
  { name: 'แฮมสเตอร์ทอง', hex: '#D97706' },
  { name: 'กุหลาบน้ำนม', hex: '#F43F5E' },
  { name: 'เจดแก้ว', hex: '#10B981' },
  { name: 'ฟ้าน้ำนม', hex: '#0EA5E9' },
  { name: 'ม่วงมินต์', hex: '#8B5CF6' },
];

const SPEED_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: 'slow', label: 'ช้า', desc: 'ขยับนุ่มนวล ชมได้เพลิน ๆ' },
  { value: 'normal', label: 'ปกติ', desc: '550ms — ค่าที่ออกแบบไว้' },
  { value: 'fast', label: 'เร็ว', desc: 'สั้นกระชับ ตอบสนองไว' },
  { value: 'off', label: 'ปิดแอนิเมชัน', desc: 'ทุกอย่างปรากฏทันที' },
];

function AppearanceSettings({
  registerSaver,
}: {
  registerSaver: (fn: SettingsSaver | null) => void;
}): React.JSX.Element {
  const [accent, setAccent] = useState('#F97316');
  const [speed, setSpeed] = useState('normal');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/v1/admin/settings/appearance')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json() as Promise<{ accent?: string | null; speed?: string }>;
      })
      .then((data) => {
        if (cancelled) return;
        if (data.accent) setAccent(data.accent);
        if (data.speed) setSpeed(data.speed);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Latest values for the header-registered saver.
  const valuesRef = useRef({ accent, speed });
  valuesRef.current = { accent, speed };

  async function saveToApi(): Promise<void> {
    const { accent: a, speed: s } = valuesRef.current;
    const res = await adminFetch('/api/v1/admin/settings/appearance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accent: a, speed: s }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
  }

  // Header save button drives this tab's real save.
  useEffect(() => {
    registerSaver(saveToApi);
    return () => registerSaver(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerSaver]);

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
      title="ธีมและแอนิเมชัน"
      subtitle="เปลี่ยนสีหลักของเว็บและความเร็วแอนิเมชัน — บันทึกแล้วมีผลทันทีกับทุกหน้า"
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-fg-placeholder">กำลังโหลด…</p>
      ) : (
        <>
          <Field label="สีหลัก (Accent)">
            <div className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.hex}
                  onClick={() => setAccent(p.hex)}
                  title={p.name}
                  className={cn(
                    'h-10 w-10 rounded-full border-2 transition-transform hover:scale-110',
                    accent.toLowerCase() === p.hex.toLowerCase()
                      ? 'border-fg shadow-md ring-2 ring-peach-300 ring-offset-2'
                      : 'border-line-subtle',
                  )}
                  style={{ backgroundColor: p.hex }}
                  aria-label={p.name}
                  aria-pressed={accent.toLowerCase() === p.hex.toLowerCase()}
                />
              ))}
              <label
                className={cn(
                  'flex h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs text-fg-secondary hover:bg-surface',
                  !ACCENT_PRESETS.some((p) => p.hex.toLowerCase() === accent.toLowerCase())
                    ? 'border-fg ring-2 ring-peach-300 ring-offset-2'
                    : 'border-line-subtle',
                )}
              >
                <span
                  className="h-5 w-5 rounded-full border border-line-subtle"
                  style={{ backgroundColor: accent }}
                />
                กำหนดเอง
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="sr-only"
                />
              </label>
            </div>
          </Field>

          <Field label="ความเร็วแอนิเมชัน">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {SPEED_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSpeed(opt.value)}
                  className={cn(
                    'rounded-lg border px-3 py-3 text-left transition-all',
                    speed === opt.value
                      ? 'border-peach-500 bg-peach-50 ring-1 ring-peach-500'
                      : 'border-line-subtle hover:bg-surface',
                  )}
                  aria-pressed={speed === opt.value}
                >
                  <p className="text-sm font-semibold text-fg">{opt.label}</p>
                  <p className="text-[10px] text-fg-placeholder">{opt.desc}</p>
                </button>
              ))}
            </div>
          </Field>

          {/* Live preview */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-placeholder">
              ตัวอย่าง
            </p>
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line-subtle bg-surface p-4">
              <button
                className="rounded-full px-5 py-2 text-sm font-semibold text-white shadow-clay-brand transition-transform hover:scale-[1.03] active:scale-95"
                style={{ backgroundColor: accent }}
              >
                ปุ่มซื้อสินค้า
              </button>
              <div className="h-4 w-32 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: '72%', backgroundColor: accent }}
                />
              </div>
              <span className="text-sm font-bold" style={{ color: accent }}>
                ฿25 ลดเหลือ ฿19
              </span>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-coral-300 bg-coral-50 px-4 py-3 text-sm text-coral-700">
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
              {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกแล้ว!' : 'บันทึกธีม'}
            </button>
          </div>
        </>
      )}
    </Section>
  );
}

// ─── Store Settings ───────────────────────────────────────

interface StoreInfoForm {
  name: string;
  description: string;
  email: string;
  phone: string;
  line: string;
  facebook: string;
}

function StoreSettings({
  registerSaver,
}: {
  registerSaver: (fn: SettingsSaver | null) => void;
}): React.JSX.Element {
  const [form, setForm] = useState<StoreInfoForm>({
    name: '',
    description: '',
    email: '',
    phone: '',
    line: '',
    facebook: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/v1/admin/settings/store-info')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json() as Promise<Partial<StoreInfoForm>>;
      })
      .then((data) => {
        if (cancelled) return;
        setForm((f) => ({
          ...f,
          name: data.name ?? f.name,
          description: data.description ?? f.description,
          email: data.email ?? f.email,
          phone: data.phone ?? f.phone,
          line: data.line ?? f.line,
          facebook: data.facebook ?? f.facebook,
        }));
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function set(field: keyof StoreInfoForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Latest values for the header-registered saver.
  const formRef = useRef(form);
  formRef.current = form;

  async function saveToApi(): Promise<void> {
    const res = await adminFetch('/api/v1/admin/settings/store-info', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formRef.current),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
  }

  // Header save button drives this tab's real save.
  useEffect(() => {
    registerSaver(saveToApi);
    return () => registerSaver(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerSaver]);

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
      title="การตั้งค่าร้านค้า"
      subtitle="ข้อมูลที่แสดงในฟุตเตอร์และหน้าติดต่อ — เว้นว่างเพื่อใช้ค่าเริ่มต้น"
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-fg-placeholder">กำลังโหลด…</p>
      ) : (
        <>
          <Field label="ชื่อร้านค้า">
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Nong-Kati"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
            />
          </Field>
          <Field label="คำอธิบายร้านค้า">
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              placeholder="ซื้อบัตรเกม Netflix Steam และอื่นๆ ได้ที่ Nong-Kati ส่งโค้ดทันที"
              className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="อีเมลติดต่อ">
              <input
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="support@nong-kati.co.th"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
              />
            </Field>
            <Field label="เบอร์โทรศัพท์">
              <input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="02-123-4567"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="LINE ID">
              <input
                value={form.line}
                onChange={(e) => set('line', e.target.value)}
                placeholder="@nongkati"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
              />
            </Field>
            <Field label="Facebook Page">
              <input
                value={form.facebook}
                onChange={(e) => set('facebook', e.target.value)}
                placeholder="https://facebook.com/..."
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
              />
            </Field>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-coral-300 bg-coral-50 px-4 py-3 text-sm text-coral-700">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-peach-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-peach-400 disabled:opacity-50"
            >
              {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
              {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกแล้ว!' : 'บันทึกข้อมูลร้าน'}
            </button>
          </div>
        </>
      )}
    </Section>
  );
}

// ─── Payment Settings ─────────────────────────────────────
function PaymentSettings(): React.JSX.Element {
  const [promptpayEnabled, setPromptpayEnabled] = useState(true);
  const [promptpayId, setPromptpayId] = useState('0123456789012');
  const [cardEnabled, setCardEnabled] = useState(true);
  const [omisePublicKey, setOmisePublicKey] = useState('pkey_test_xxxxx');
  const [omiseSecretKey] = useState('••••••••••••••••');
  const [showSecret, setShowSecret] = useState(false);

  return (
    <Section title="การชำระเงิน" subtitle="ตั้งค่าช่องทางการชำระเงินและ Payment Gateway">
      {/* PromptPay */}
      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-jade-500/15 text-jade-700">
              <Smartphone size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-fg">PromptPay</p>
              <p className="text-xs text-fg-placeholder">สแกน QR Code ชำระเงินผ่านแอปธนาคาร</p>
            </div>
          </div>
          <ToggleSwitch enabled={promptpayEnabled} onChange={setPromptpayEnabled} />
        </div>
        {promptpayEnabled && (
          <div className="mt-4 space-y-3">
            <Field label="PromptPay ID (เลขบัตรประชาชน / กรมสรรพากร)">
              <input
                value={promptpayId}
                onChange={(e) => setPromptpayId(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
              />
            </Field>
            <div className="rounded-md bg-surface p-3 text-xs text-fg-placeholder">
              <p>ใช้ PromptPay ID ของร้านค้าในการสร้าง QR Code</p>
              <p className="mt-1">
                ทดสอบ: ใช้ <code className="text-fg-brand">0123456789012</code>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Credit Card */}
      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sapphire-400/15 text-sapphire-700">
              <CreditCard size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-fg">บัตรเครดิต / เดบิต (Omise)</p>
              <p className="text-xs text-fg-placeholder">
                Visa, Mastercard, JCB ผ่าน Omise Gateway
              </p>
            </div>
          </div>
          <ToggleSwitch enabled={cardEnabled} onChange={setCardEnabled} />
        </div>
        {cardEnabled && (
          <div className="mt-4 space-y-3">
            <Field label="Omise Public Key">
              <div className="flex gap-2">
                <input
                  value={omisePublicKey}
                  onChange={(e) => setOmisePublicKey(e.target.value)}
                  className="flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
                />
                <CopyButton text={omisePublicKey} />
              </div>
            </Field>
            <Field label="Omise Secret Key">
              <div className="flex gap-2">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={showSecret ? 'sk_test_xxxxxxxxxxxxxxxx' : omiseSecretKey}
                  readOnly
                  className="flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
                />
                <button
                  onClick={() => setShowSecret(!showSecret)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-fg-placeholder hover:bg-surface hover:text-fg"
                >
                  {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <div className="rounded-md bg-surface p-3 text-xs text-fg-placeholder">
              <p>
                🧪 <strong className="text-fg-secondary">โหมดทดสอบ:</strong> ใช้ keys ที่ขึ้นต้นด้วย{' '}
                <code className="text-fg-brand">pkey_test_</code> /{' '}
                <code className="text-fg-brand">sk_test_</code>
              </p>
              <p className="mt-1">
                🔑 <strong className="text-fg-secondary">โหมดจริง:</strong> เปลี่ยนเป็น{' '}
                <code className="text-fg-brand">pkey_live_</code> /{' '}
                <code className="text-fg-brand">sk_live_</code>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Test Mode Badge */}
      <div className="border-line-brand/30 flex items-center gap-3 rounded-lg border bg-peach-50 p-4">
        <AlertTriangle size={20} className="flex-shrink-0 text-fg-brand" />
        <div>
          <p className="text-sm font-medium text-fg-brand">โหมดทดสอบเปิดใช้งานอยู่</p>
          <p className="text-xs text-fg-placeholder">
            ระบบจะไม่เรียกเก็บเงินจริง เหมาะสำหรับการทดสอบก่อนเปิดใช้งานจริง
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <SaveButton />
      </div>
    </Section>
  );
}

// ─── Email Settings ───────────────────────────────────────
function EmailSettings(): React.JSX.Element {
  const [smtpHost, setSmtpHost] = useState('smtp.resend.com');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('resend');
  const [fromName, setFromName] = useState('Nong-Kati');
  const [fromEmail, setFromEmail] = useState('noreply@nong-kati.co.th');

  return (
    <Section title="การตั้งค่าอีเมล" subtitle="ตั้งค่า SMTP และรูปแบบอีเมลที่ส่งให้ลูกค้า">
      <div className="grid grid-cols-2 gap-4">
        <Field label="SMTP Host">
          <input
            value={smtpHost}
            onChange={(e) => setSmtpHost(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
          />
        </Field>
        <Field label="SMTP Port">
          <input
            value={smtpPort}
            onChange={(e) => setSmtpPort(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
          />
        </Field>
      </div>
      <Field label="SMTP Username">
        <input
          value={smtpUser}
          onChange={(e) => setSmtpUser(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="ชื่อผู้ส่ง (From Name)">
          <input
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
          />
        </Field>
        <Field label="อีเมลผู้ส่ง (From Email)">
          <input
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
          />
        </Field>
      </div>

      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-fg-secondary">เทมเพลตอีเมล</h3>
        <div className="space-y-2">
          {[
            { name: 'ยืนยันคำสั่งซื้อ', desc: 'ส่งเมื่อลูกค้าชำระเงินสำเร็จ', active: true },
            { name: 'ส่งโค้ดสินค้า', desc: 'ส่งโค้ดหลังจากทำรายการสำเร็จ', active: true },
            { name: 'แจ้งเตือนสต็อกต่ำ', desc: 'ส่งเมื่อสินค้าใกล้หมด', active: true },
            { name: 'ใบแจ้งหนี้ / ใบเสร็จ', desc: 'ส่งใบเสร็จรับเงิน', active: false },
          ].map((tpl) => (
            <div
              key={tpl.name}
              className="flex items-center justify-between rounded-md bg-surface px-3 py-2"
            >
              <div>
                <p className="text-xs font-medium text-fg-secondary">{tpl.name}</p>
                <p className="text-[10px] text-clay-400">{tpl.desc}</p>
              </div>
              <span
                className={cn(
                  'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium',
                  tpl.active ? 'bg-jade-500/15 text-jade-700' : 'bg-surface text-clay-400',
                )}
              >
                {tpl.active ? 'เปิดใช้งาน' : 'ปิด'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <SaveButton />
      </div>
    </Section>
  );
}

// ─── Security Settings ────────────────────────────────────
function SecuritySettings(): React.JSX.Element {
  return (
    <Section title="ความปลอดภัย" subtitle="จัดการ 2FA, Sessions, และ Password Policy">
      {/* Change Password */}
      <ChangePassword />

      {/* 2FA */}
      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-jade-500/15 text-jade-700">
            <Lock size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-fg">การยืนยันตัวตนสองชั้น (2FA)</p>
            <p className="text-xs text-fg-placeholder">บังคับใช้ TOTP สำหรับพนักงานทุกคน</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-jade-500/15 px-2.5 py-1 text-xs font-medium text-jade-700">
            <CheckCircle2 size={12} />
            เปิดใช้งาน
          </span>
        </div>
      </div>

      {/* Password Policy */}
      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-secondary">
          <Key size={14} />
          นโยบายรหัสผ่าน
        </h3>
        <div className="space-y-3">
          <Field label="ความยาวรหัสผ่านขั้นต่ำ">
            <input
              type="number"
              defaultValue={12}
              min={8}
              max={64}
              className="w-24 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            {['ตัวเลข', 'ตัวพิมพ์ใหญ่', 'ตัวพิมพ์เล็ก', 'อักขระพิเศษ'].map((rule) => (
              <label key={rule} className="flex items-center gap-2 text-xs text-fg-muted">
                <input
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 rounded border-line bg-surface accent-peach-500"
                />
                {rule}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-secondary">
          <Shield size={14} />
          Sessions ที่ใช้งานอยู่
        </h3>
        <div className="space-y-2">
          {[
            { device: 'Chrome · Windows 11', ip: '1.2.3.4', lastActive: 'ตอนนี้', current: true },
            {
              device: 'Safari · iPhone 15',
              ip: '5.6.7.8',
              lastActive: '2 ชม. ที่แล้ว',
              current: false,
            },
          ].map((session) => (
            <div
              key={session.ip}
              className="flex items-center justify-between rounded-md bg-surface px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'h-2 w-2 rounded-full',
                    session.current ? 'bg-jade-500' : 'bg-clay-300',
                  )}
                />
                <div>
                  <p className="text-xs font-medium text-fg-secondary">{session.device}</p>
                  <p className="text-[10px] text-clay-400">
                    IP: {session.ip} · {session.lastActive}
                  </p>
                </div>
              </div>
              {!session.current && (
                <button
                  className="rounded p-1.5 text-clay-400 hover:bg-surface hover:text-coral-600"
                  aria-label="ยกเลิก session"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Login Attempt Limits */}
      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-fg-secondary">ล็อกอินล้มเหลว</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="ล็อกบัญชีหลังจาก (ครั้ง)">
            <input
              type="number"
              defaultValue={5}
              min={3}
              max={10}
              className="w-24 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
            />
          </Field>
          <Field label="ล็อกอิน (นาที)">
            <input
              type="number"
              defaultValue={30}
              min={5}
              max={1440}
              className="w-24 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500"
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-end">
        <SaveButton />
      </div>
    </Section>
  );
}

// ─── Notification Settings ────────────────────────────────
function NotificationSettings({
  registerSaver,
}: {
  registerSaver: (fn: SettingsSaver | null) => void;
}): React.JSX.Element {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [threshold, setThreshold] = useState('5');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/v1/admin/settings/notifications')
      .then(async (r) => (r.ok ? r.json() : {}))
      .then((data: { discordWebhookUrl?: string | null; lowStockThreshold?: number }) => {
        if (cancelled) return;
        setWebhookUrl(data.discordWebhookUrl ?? '');
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
          discordWebhookUrl: webhookUrl.trim() === '' ? null : webhookUrl.trim(),
          lowStockThreshold: Number(threshold) || 0,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          data.error === 'INVALID_WEBHOOK_URL'
            ? 'ลิงก์ Discord Webhook ไม่ถูกต้อง'
            : data.error === 'INVALID_THRESHOLD'
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
  }, [webhookUrl, threshold]);

  useEffect(() => {
    registerSaver(save);
    return () => registerSaver(null);
  }, [save, registerSaver]);

  return (
    <Section
      title="การแจ้งเตือน"
      subtitle="แจ้งเตือนออเดอร์ใหม่ การชำระเงิน และสต๊อกใกล้หมด ผ่าน Discord (ตามเวลาจริง)"
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-fg-muted">กำลังโหลด...</p>
      ) : (
        <div className="space-y-5">
          <div>
            <label className={cn('mb-1 block text-sm font-medium text-fg')}>
              Discord Webhook URL
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              className={INPUT_CLASS}
            />
            <p className="mt-1 text-xs text-clay-400">
              สร้างได้จาก Discord → เซิร์ฟเวอร์ของคุณ → ช่องแชท → แก้ไขช่อง → Integration → Webhooks
              → New Webhook → Copy Webhook URL เว้นว่างไว้ = ปิดการแจ้งเตือน
            </p>
          </div>
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
            <div className="rounded-md border border-coral-300 bg-coral-50 px-4 py-3 text-sm text-coral-700">
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

// ─── Change Password ────────────────────────────

const INPUT_CLASS =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:outline-none focus:ring-2 focus:ring-peach-500';

/**
 * Self-service password change for the signed-in admin. On success the API
 * revokes EVERY session (including this one), so the UI clears storage and
 * sends the admin to the login page — they re-enter with the new password.
 */
function ChangePassword(): React.JSX.Element {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 12) {
      setError('รหัสผ่านใหม่ต้องมีอย่างน้อย 12 ตัวอักษร');
      return;
    }
    if (next !== confirm) {
      setError('รหัสผ่านใหม่ที่กรอกทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setSaving(true);
    adminFetch('/api/v1/auth/admin/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
        };
        if (!res.ok || !data.success) {
          setError(
            data.error === 'CURRENT_PASSWORD_INCORRECT'
              ? 'รหัสผ่านปัจจุบันไม่ถูกต้อง'
              : data.error === 'PASSWORD_TOO_SHORT'
                ? 'รหัสผ่านใหม่ต้องมีอย่างน้อย 12 ตัวอักษร'
                : `บันทึกไม่สำเร็จ (${data.error ?? `HTTP ${res.status}`})`,
          );
          setSaving(false);
          return;
        }
        setDone(true);
        setSaving(false);
        // Every session was revoked server-side — this one included.
        setTimeout(() => {
          clearAdminSession();
          localStorage.removeItem('nk_admin_email');
          window.location.href = '/management/login';
        }, 1800);
      })
      .catch(() => {
        setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
        setSaving(false);
      });
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-line-subtle bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-secondary">
        <Key size={14} />
        เปลี่ยนรหัสผ่าน
      </h3>
      <div className="space-y-3">
        <Field label="รหัสผ่านปัจจุบัน">
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
            className={INPUT_CLASS}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="รหัสผ่านใหม่ (12 ตัวอักษรขึ้นไป)">
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={12}
              autoComplete="new-password"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="ยืนยันรหัสผ่านใหม่">
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-coral-300 bg-coral-50 px-4 py-3 text-sm text-coral-700">
            <AlertTriangle size={16} /> {error}
          </div>
        )}
        {done && (
          <div className="border-jade-300 bg-jade-50 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-jade-700">
            <CheckCircle2 size={16} /> เปลี่ยนรหัสผ่านสำเร็จ — กำลังพาไปหน้าเข้าสู่ระบบ…
          </div>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || done}
            className="flex items-center gap-2 rounded-lg bg-peach-500 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-peach-400 disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? 'กำลังบันทึก…' : 'เปลี่ยนรหัสผ่าน'}
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Shared Components ────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line-subtle bg-surface p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        <p className="mt-1 text-sm text-fg-placeholder">{subtitle}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-fg-muted">{label}</label>
      {children}
    </div>
  );
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative h-6 w-11 flex-shrink-0 rounded-full transition-colors',
        enabled ? 'bg-peach-500' : 'bg-clay-300',
      )}
      role="switch"
      aria-checked={enabled}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform',
          enabled ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}

/** Placeholder sections have no backend yet — the button says so honestly. */
function SaveButton(): React.JSX.Element {
  return (
    <button
      disabled
      title="ส่วนนี้ยังไม่รองรับการบันทึก"
      className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-fg-placeholder"
    >
      <Save size={14} />
      ยังไม่รองรับการบันทึก
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-fg-placeholder hover:bg-surface hover:text-fg"
      title="คัดลอก"
    >
      {copied ? <CheckCircle2 size={14} className="text-jade-600" /> : <Copy size={14} />}
    </button>
  );
}

// ─── Homepage Banner (hero carousel) Settings ───────────
interface AdminHeroSlide {
  id: string;
  imageUrl: string;
  href: string | null;
  alt: string;
  sortOrder: number;
  isActive: boolean;
}

function BannerSettings(): React.JSX.Element {
  const [slides, setSlides] = useState<AdminHeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const newSlideInput = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch('/api/v1/admin/hero-slides');
      if (!res.ok)
        throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const data = (await res.json()) as { slides: AdminHeroSlide[] };
      setSlides(data.slides);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, data: Partial<AdminHeroSlide>): Promise<void> {
    setBusyId(id);
    try {
      const res = await adminFetch(`/api/v1/admin/hero-slides/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok)
        throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string): Promise<void> {
    if (!window.confirm('ลบสไลด์นี้ถาวร?')) return;
    setBusyId(id);
    try {
      const res = await adminFetch(`/api/v1/admin/hero-slides/${id}`, { method: 'DELETE' });
      if (!res.ok)
        throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setSlides((s) => s.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ลบไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  /** Add = pick an image first; the slide is created with the uploaded path. */
  function startAdd(): void {
    newSlideInput.current?.click();
  }

  async function createFromImage(file: File): Promise<void> {
    setUploadingId('new');
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
        reader.readAsDataURL(file);
      });
      const up = await adminFetch('/api/v1/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      if (!up.ok) {
        const data = (await up.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${up.status}`);
      }
      const { path } = (await up.json()) as { path: string };
      const res = await adminFetch('/api/v1/admin/hero-slides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: path,
          alt: 'แบนเนอร์โปรโมชั่น',
          sortOrder: slides.length,
        }),
      });
      if (!res.ok)
        throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เพิ่มสไลด์ไม่สำเร็จ');
    } finally {
      setUploadingId(null);
    }
  }

  function pickImage(id: string): void {
    fileInputs.current[id]?.click();
  }

  async function uploadImage(id: string, file: File): Promise<void> {
    setUploadingId(id);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
        reader.readAsDataURL(file);
      });
      const res = await adminFetch('/api/v1/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const { path } = (await res.json()) as { path: string };
      await patch(id, { imageUrl: path });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploadingId(null);
    }
  }

  function move(slide: AdminHeroSlide, dir: -1 | 1): void {
    const idx = slides.findIndex((s) => s.id === slide.id);
    const swapWith = slides[idx + dir];
    if (!swapWith) return;
    void patch(slide.id, { sortOrder: swapWith.sortOrder });
    void patch(swapWith.id, { sortOrder: slide.sortOrder });
  }

  if (loading) {
    return (
      <div className="clay-card rounded-2xl p-8 text-center text-sm text-fg-placeholder">
        กำลังโหลด…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="clay-card rounded-2xl p-5">
        <h2 className="text-base font-bold text-fg">แบนเนอร์หน้าแรก (Carousel)</h2>
        <p className="mt-1 text-sm text-fg-muted">
          อัปโหลดภาพโปรโมชั่น ใส่ลิงก์เมื่อกดภาพ และจัดลำดับการแสดงผล — ภาพแนะนำขนาดกว้าง
          อัตราส่วนประมาณ 21:8 (สูงสุด 512KB ต่อภาพ)
        </p>
        {error && (
          <p className="mt-3 rounded-lg bg-coral-50 px-3 py-2 text-sm text-coral-700 dark:bg-coral-900/20 dark:text-coral-300">
            {error}
          </p>
        )}
      </div>

      {slides.length === 0 && (
        <div className="clay-card rounded-2xl p-8 text-center text-sm text-fg-placeholder">
          ยังไม่มีแบนเนอร์ — กด “เพิ่มสไลด์” เพื่อเริ่ม
        </div>
      )}

      {slides.map((slide, i) => (
        <div key={slide.id} className="clay-card rounded-2xl p-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            {/* Image preview / upload */}
            <div className="relative shrink-0">
              {slide.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slide.imageUrl}
                  alt={slide.alt}
                  className="h-24 w-44 rounded-xl object-cover shadow-clay-sm"
                />
              ) : (
                <div className="flex h-24 w-44 items-center justify-center rounded-xl bg-surface text-xs text-fg-placeholder shadow-clay-sm">
                  ยังไม่มีภาพ
                </div>
              )}
              <input
                ref={(el) => {
                  fileInputs.current[slide.id] = el;
                }}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void uploadImage(slide.id, f);
                }}
              />
              <button
                type="button"
                onClick={() => pickImage(slide.id)}
                disabled={uploadingId === slide.id}
                className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-peach-500 px-3 py-1 text-xs font-semibold text-white shadow-clay-sm transition-transform duration-fast ease-out-quart hover:scale-105 active:scale-90"
              >
                {uploadingId === slide.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <ImageIcon size={12} />
                )}
                {uploadingId === slide.id ? 'กำลังอัปโหลด…' : 'เปลี่ยนรูป'}
              </button>
            </div>

            {/* Fields */}
            <div className="min-w-0 flex-1 space-y-2.5">
              <label className="block">
                <span className="text-xs font-medium text-fg-muted">
                  ลิงก์เมื่อกดภาพ (เว้นว่างได้)
                </span>
                <input
                  defaultValue={slide.href ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (slide.href ?? '')) void patch(slide.id, { href: v });
                  }}
                  placeholder="/search หรือ https://…"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-placeholder focus:border-peach-400 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-fg-muted">คำอธิบายภาพ (alt)</span>
                <input
                  defaultValue={slide.alt}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== slide.alt) void patch(slide.id, { alt: v });
                  }}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-peach-400 focus:outline-none"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={slide.isActive}
                    onChange={(e) => void patch(slide.id, { isActive: e.target.checked })}
                    className="size-4 accent-peach-500"
                  />
                  แสดงบนหน้าเว็บ
                </label>
                <span className="text-xs text-fg-placeholder">
                  {busyId === slide.id ? 'กำลังบันทึก…' : 'แก้ไขแล้วบันทึกอัตโนมัติ'}
                </span>
              </div>
            </div>

            {/* Order + delete */}
            <div className="flex shrink-0 flex-row items-center gap-1.5 sm:flex-col">
              <button
                type="button"
                onClick={() => move(slide, -1)}
                disabled={i === 0}
                aria-label="ย้ายขึ้น"
                className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface hover:text-fg disabled:opacity-30"
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                onClick={() => move(slide, 1)}
                disabled={i === slides.length - 1}
                aria-label="ย้ายลง"
                className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface hover:text-fg disabled:opacity-30"
              >
                <ArrowDown size={16} />
              </button>
              <button
                type="button"
                onClick={() => void remove(slide.id)}
                aria-label="ลบสไลด์"
                className="rounded-lg p-2 text-coral-600 transition-colors hover:bg-coral-50 dark:text-coral-400 dark:hover:bg-coral-900/20"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      ))}

      <input
        ref={newSlideInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void createFromImage(f);
        }}
      />
      <button
        type="button"
        onClick={startAdd}
        disabled={uploadingId === 'new'}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-peach-300 py-4 text-sm font-semibold text-fg-brand transition-colors hover:bg-peach-50 disabled:opacity-60 dark:border-peach-700/60 dark:hover:bg-peach-900/20"
      >
        {uploadingId === 'new' ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Plus size={16} />
        )}
        {uploadingId === 'new' ? 'กำลังอัปโหลด…' : 'เพิ่มสไลด์ (เลือกภาพ)'}
      </button>
    </div>
  );
}
