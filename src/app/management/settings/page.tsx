'use client';

import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { AdminShell } from '@/components/layout/AdminShell';
import { cn } from '@/utils/cn';

type SettingsTab =
  | 'announcement'
  | 'appearance'
  | 'store'
  | 'payment'
  | 'email'
  | 'security'
  | 'notifications';

const TABS: { id: SettingsTab; label: string; icon: typeof Store }[] = [
  { id: 'announcement', label: 'แถบประกาศ', icon: Megaphone },
  { id: 'appearance', label: 'ธีมและแอนิเมชัน', icon: Palette },
  { id: 'store', label: 'ร้านค้า', icon: Store },
  { id: 'payment', label: 'การชำระเงิน', icon: CreditCard },
  { id: 'email', label: 'อีเมล', icon: Mail },
  { id: 'security', label: 'ความปลอดภัย', icon: Shield },
  { id: 'notifications', label: 'การแจ้งเตือน', icon: Bell },
];

export default function AdminSettingsPage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<SettingsTab>('store');
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
            onClick={handleSave}
            className="flex items-center gap-2 rounded-lg bg-peach-500 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-peach-400"
          >
            {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {saved ? 'บันทึกแล้ว!' : 'บันทึกการตั้งค่า'}
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
            {activeTab === 'announcement' && <AnnouncementSettings />}
            {activeTab === 'appearance' && <AppearanceSettings />}
            {activeTab === 'store' && <StoreSettings onSave={handleSave} />}
            {activeTab === 'payment' && <PaymentSettings onSave={handleSave} />}
            {activeTab === 'email' && <EmailSettings onSave={handleSave} />}
            {activeTab === 'security' && <SecuritySettings onSave={handleSave} />}
            {activeTab === 'notifications' && <NotificationSettings onSave={handleSave} />}
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

function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('nk_admin_access_token');
}

function AnnouncementSettings(): React.JSX.Element {
  const [message, setMessage] = useState('');
  const [href, setHref] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch('/api/v1/admin/announcement', { headers })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json() as Promise<AnnouncementContent>;
      })
      .then((data) => {
        setMessage(data.message);
        setHref(data.href ?? '');
        setEnabled(data.enabled);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const token = getAdminToken();
      const res = await fetch('/api/v1/admin/announcement', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: message.trim(), href: href.trim() || null, enabled }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
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

function AppearanceSettings(): React.JSX.Element {
  const [accent, setAccent] = useState('#F97316');
  const [speed, setSpeed] = useState('normal');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch('/api/v1/admin/settings/appearance', { headers })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json() as Promise<{ accent?: string | null; speed?: string }>;
      })
      .then((data) => {
        if (data.accent) setAccent(data.accent);
        if (data.speed) setSpeed(data.speed);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const token = getAdminToken();
      const res = await fetch('/api/v1/admin/settings/appearance', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ accent, speed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
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
              <div className="h-4 w-32 overflow-hidden rounded-full bg-white">
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

function StoreSettings({ onSave }: { onSave: () => void }) {
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
    const token = getAdminToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch('/api/v1/admin/settings/store-info', { headers })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json() as Promise<Partial<StoreInfoForm>>;
      })
      .then((data) => {
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
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function set(field: keyof StoreInfoForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const token = getAdminToken();
      const res = await fetch('/api/v1/admin/settings/store-info', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setSaved(true);
      onSave();
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
function PaymentSettings({ onSave }: { onSave: () => void }) {
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
            <div className="rounded-md bg-white p-3 text-xs text-fg-placeholder">
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
            <div className="rounded-md bg-white p-3 text-xs text-fg-placeholder">
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
        <SaveButton onClick={onSave} />
      </div>
    </Section>
  );
}

// ─── Email Settings ───────────────────────────────────────
function EmailSettings({ onSave }: { onSave: () => void }) {
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
              className="flex items-center justify-between rounded-md bg-white px-3 py-2"
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
        <SaveButton onClick={onSave} />
      </div>
    </Section>
  );
}

// ─── Security Settings ────────────────────────────────────
function SecuritySettings({ onSave }: { onSave: () => void }) {
  return (
    <Section title="ความปลอดภัย" subtitle="จัดการ 2FA, Sessions, และ Password Policy">
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
              className="flex items-center justify-between rounded-md bg-white px-3 py-2.5"
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
        <SaveButton onClick={onSave} />
      </div>
    </Section>
  );
}

// ─── Notification Settings ────────────────────────────────
function NotificationSettings({ onSave }: { onSave: () => void }) {
  const notifications = [
    {
      category: 'ออเดอร์',
      items: [
        { label: 'ออเดอร์ใหม่', desc: 'แจ้งเตือนเมื่อมีออเดอร์ชำระเงินสำเร็จ', enabled: true },
        { label: 'รอส่งโค้ด', desc: 'แจ้งเตือนเมื่อมีออเดอร์รอ manual fulfilment', enabled: true },
        { label: 'คืนเงิน', desc: 'แจ้งเตือนเมื่อทำรายการคืนเงิน', enabled: true },
      ],
    },
    {
      category: 'สินค้า',
      items: [
        { label: 'สต็อกต่ำ', desc: 'แจ้งเตือนเมื่อสินค้าใกล้หมด', enabled: true },
        { label: 'สินค้าหมด', desc: 'แจ้งเตือนเมื่อสินค้าหมดสต็อก', enabled: true },
      ],
    },
    {
      category: 'ลูกค้า',
      items: [
        { label: 'ลูกค้าใหม่', desc: 'แจ้งเตือนเมื่อมีลูกค้าสมัครสมาชิก', enabled: false },
        { label: 'ร้องเรียน', desc: 'แจ้งเตือนเมื่อลูกค้าส่งแบบฟอร์มติดต่อ', enabled: true },
      ],
    },
    {
      category: 'ระบบ',
      items: [
        { label: 'Webhook ล้มเหลว', desc: 'แจ้งเตือนเมื่อ payment webhook ผิดพลาด', enabled: true },
        {
          label: ' Circuit Breaker เปิด',
          desc: 'แจ้งเตือนเมื่อ payment gateway ขัดข้อง',
          enabled: true,
        },
      ],
    },
  ];

  return (
    <Section title="การแจ้งเตือน" subtitle="ตั้งค่าการแจ้งเตือนสำหรับทีมงาน">
      <div className="space-y-6">
        {notifications.map((group) => (
          <div key={group.category}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-placeholder">
              {group.category}
            </h3>
            <div className="space-y-2">
              {group.items.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-lg border border-line-subtle bg-surface px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-fg-secondary">{item.label}</p>
                    <p className="text-xs text-clay-400">{item.desc}</p>
                  </div>
                  <ToggleSwitch enabled={item.enabled} onChange={() => {}} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <SaveButton onClick={onSave} />
      </div>
    </Section>
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
    <div className="rounded-xl border border-line-subtle bg-white p-6">
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
          'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          enabled ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}

function SaveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg bg-peach-500 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-peach-400"
    >
      <Save size={14} />
      บันทึก
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
