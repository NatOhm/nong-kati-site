'use client';

import { useState } from 'react';
import {
  Store,
  CreditCard,
  Mail,
  Shield,
  Bell,
  Globe,
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

type SettingsTab = 'store' | 'payment' | 'email' | 'security' | 'notifications';

const TABS: { id: SettingsTab; label: string; icon: typeof Store }[] = [
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
    <AdminShell
      staffName="Founder"
      staffRole="super_admin"
      breadcrumbs={[{ label: 'ตั้งค่า' }]}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink-100">ตั้งค่า</h1>
            <p className="mt-1 text-sm text-ink-400">จัดการการตั้งค่าร้านค้า ระบบชำระเงิน และความปลอดภัย</p>
          </div>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-amber-300"
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
                        ? 'bg-amber-900/30 text-amber-300 border border-amber-700/30'
                        : 'text-ink-400 hover:bg-ink-800 hover:text-ink-200 border border-transparent',
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

// ─── Store Settings ───────────────────────────────────────
function StoreSettings({ onSave }: { onSave: () => void }) {
  const [storeName, setStoreName] = useState('Nong-Kati');
  const [storeDesc, setStoreDesc] = useState('ซื้อบัตรเกม Netflix Steam และอื่นๆ ได้ที่ Nong-Kati ส่งโค้ดทันที');
  const [contactEmail, setContactEmail] = useState('support@nong-kati.co.th');
  const [contactPhone, setContactPhone] = useState('02-123-4567');
  const [currency, setCurrency] = useState('THB');
  const [timezone, setTimezone] = useState('Asia/Bangkok');

  return (
    <Section title="การตั้งค่าร้านค้า" subtitle="ตั้งค่าข้อมูลร้านค้าที่แสดงต่อลูกค้า">
      <Field label="ชื่อร้านค้า">
        <input value={storeName} onChange={(e) => setStoreName(e.target.value)} className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
      </Field>
      <Field label="คำอธิบายร้านค้า">
        <textarea value={storeDesc} onChange={(e) => setStoreDesc(e.target.value)} rows={3} className="w-full resize-none rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="อีเมลติดต่อ">
          <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        <Field label="เบอร์โทรศัพท์">
          <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="สกุลเงิน">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="THB">THB — ฿ บาทยอด</option>
            <option value="USD">USD — $ ดอลลาร์</option>
          </select>
        </Field>
        <Field label="Timezone">
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="Asia/Bangkok">Asia/Bangkok (ICT, UTC+7)</option>
            <option value="UTC">UTC</option>
          </select>
        </Field>
      </div>
      <div className="flex justify-end">
        <SaveButton onClick={onSave} />
      </div>
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
      <div className="rounded-lg border border-ink-700 bg-ink-800/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-jade-900/50 text-jade-400">
              <Smartphone size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-100">PromptPay</p>
              <p className="text-xs text-ink-400">สแกน QR Code ชำระเงินผ่านแอปธนาคาร</p>
            </div>
          </div>
          <ToggleSwitch enabled={promptpayEnabled} onChange={setPromptpayEnabled} />
        </div>
        {promptpayEnabled && (
          <div className="mt-4 space-y-3">
            <Field label="PromptPay ID (เลขบัตรประชาชน / กรมสรรพากร)">
              <input value={promptpayId} onChange={(e) => setPromptpayId(e.target.value)} className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 font-mono text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </Field>
            <div className="rounded-md bg-ink-850 p-3 text-xs text-ink-400">
              <p>ใช้ PromptPay ID ของร้านค้าในการสร้าง QR Code</p>
              <p className="mt-1">ทดสอบ: ใช้ <code className="text-amber-300">0123456789012</code></p>
            </div>
          </div>
        )}
      </div>

      {/* Credit Card */}
      <div className="rounded-lg border border-ink-700 bg-ink-800/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sapphire-900/50 text-sapphire-400">
              <CreditCard size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-100">บัตรเครดิต / เดบิต (Omise)</p>
              <p className="text-xs text-ink-400">Visa, Mastercard, JCB ผ่าน Omise Gateway</p>
            </div>
          </div>
          <ToggleSwitch enabled={cardEnabled} onChange={setCardEnabled} />
        </div>
        {cardEnabled && (
          <div className="mt-4 space-y-3">
            <Field label="Omise Public Key">
              <div className="flex gap-2">
                <input value={omisePublicKey} onChange={(e) => setOmisePublicKey(e.target.value)} className="flex-1 rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 font-mono text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                <CopyButton text={omisePublicKey} />
              </div>
            </Field>
            <Field label="Omise Secret Key">
              <div className="flex gap-2">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={showSecret ? 'sk_test_xxxxxxxxxxxxxxxx' : omiseSecretKey}
                  readOnly
                  className="flex-1 rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 font-mono text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  onClick={() => setShowSecret(!showSecret)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-ink-600 text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                >
                  {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <div className="rounded-md bg-ink-850 p-3 text-xs text-ink-400">
              <p>🧪 <strong className="text-ink-200">โหมดทดสอบ:</strong> ใช้ keys ที่ขึ้นต้นด้วย <code className="text-amber-300">pkey_test_</code> / <code className="text-amber-300">sk_test_</code></p>
              <p className="mt-1">🔑 <strong className="text-ink-200">โหมดจริง:</strong> เปลี่ยนเป็น <code className="text-amber-300">pkey_live_</code> / <code className="text-amber-300">sk_live_</code></p>
            </div>
          </div>
        )}
      </div>

      {/* Test Mode Badge */}
      <div className="flex items-center gap-3 rounded-lg border border-amber-700/30 bg-amber-900/20 p-4">
        <AlertTriangle size={20} className="flex-shrink-0 text-amber-400" />
        <div>
          <p className="text-sm font-medium text-amber-300">โหมดทดสอบเปิดใช้งานอยู่</p>
          <p className="text-xs text-ink-400">ระบบจะไม่เรียกเก็บเงินจริง เหมาะสำหรับการทดสอบก่อนเปิดใช้งานจริง</p>
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
          <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 font-mono text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        <Field label="SMTP Port">
          <input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 font-mono text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
      </div>
      <Field label="SMTP Username">
        <input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="ชื่อผู้ส่ง (From Name)">
          <input value={fromName} onChange={(e) => setFromName(e.target.value)} className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        <Field label="อีเมลผู้ส่ง (From Email)">
          <input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
      </div>

      <div className="rounded-lg border border-ink-700 bg-ink-800/50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink-200">เทมเพลตอีเมล</h3>
        <div className="space-y-2">
          {[
            { name: 'ยืนยันคำสั่งซื้อ', desc: 'ส่งเมื่อลูกค้าชำระเงินสำเร็จ', active: true },
            { name: 'ส่งโค้ดสินค้า', desc: 'ส่งโค้ดหลังจากทำรายการสำเร็จ', active: true },
            { name: 'แจ้งเตือนสต็อกต่ำ', desc: 'ส่งเมื่อสินค้าใกล้หมด', active: true },
            { name: 'ใบแจ้งหนี้ / ใบเสร็จ', desc: 'ส่งใบเสร็จรับเงิน', active: false },
          ].map((tpl) => (
            <div key={tpl.name} className="flex items-center justify-between rounded-md bg-ink-850 px-3 py-2">
              <div>
                <p className="text-xs font-medium text-ink-200">{tpl.name}</p>
                <p className="text-[10px] text-ink-500">{tpl.desc}</p>
              </div>
              <span className={cn(
                'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium',
                tpl.active ? 'bg-jade-900/30 text-jade-300' : 'bg-ink-800 text-ink-500',
              )}>
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
      <div className="rounded-lg border border-ink-700 bg-ink-800/50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-jade-900/50 text-jade-400">
            <Lock size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink-100">การยืนยันตัวตนสองชั้น (2FA)</p>
            <p className="text-xs text-ink-400">บังคับใช้ TOTP สำหรับพนักงานทุกคน</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-jade-900/30 px-2.5 py-1 text-xs font-medium text-jade-300">
            <CheckCircle2 size={12} />
            เปิดใช้งาน
          </span>
        </div>
      </div>

      {/* Password Policy */}
      <div className="rounded-lg border border-ink-700 bg-ink-800/50 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-200">
          <Key size={14} />
          นโยบายรหัสผ่าน
        </h3>
        <div className="space-y-3">
          <Field label="ความยาวรหัสผ่านขั้นต่ำ">
            <input type="number" defaultValue={12} min={8} max={64} className="w-24 rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
          <div className="flex flex-wrap gap-3">
            {['ตัวเลข', 'ตัวพิมพ์ใหญ่', 'ตัวพิมพ์เล็ก', 'อักขระพิเศษ'].map((rule) => (
              <label key={rule} className="flex items-center gap-2 text-xs text-ink-300">
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-ink-600 bg-ink-800 accent-amber-400" />
                {rule}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="rounded-lg border border-ink-700 bg-ink-800/50 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-200">
          <Shield size={14} />
          Sessions ที่ใช้งานอยู่
        </h3>
        <div className="space-y-2">
          {[
            { device: 'Chrome · Windows 11', ip: '1.2.3.4', lastActive: 'ตอนนี้', current: true },
            { device: 'Safari · iPhone 15', ip: '5.6.7.8', lastActive: '2 ชม. ที่แล้ว', current: false },
          ].map((session) => (
            <div key={session.ip} className="flex items-center justify-between rounded-md bg-ink-850 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'h-2 w-2 rounded-full',
                  session.current ? 'bg-jade-400' : 'bg-ink-500',
                )} />
                <div>
                  <p className="text-xs font-medium text-ink-200">{session.device}</p>
                  <p className="text-[10px] text-ink-500">IP: {session.ip} · {session.lastActive}</p>
                </div>
              </div>
              {!session.current && (
                <button className="rounded p-1.5 text-ink-500 hover:bg-ink-800 hover:text-crimson-400" aria-label="ยกเลิก session">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Login Attempt Limits */}
      <div className="rounded-lg border border-ink-700 bg-ink-800/50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink-200">ล็อกอินล้มเหลว</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="ล็อกบัญชีหลังจาก (ครั้ง)">
            <input type="number" defaultValue={5} min={3} max={10} className="w-24 rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
          <Field label="ล็อกอิน (นาที)">
            <input type="number" defaultValue={30} min={5} max={1440} className="w-24 rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
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
    { category: 'ออเดอร์', items: [
      { label: 'ออเดอร์ใหม่', desc: 'แจ้งเตือนเมื่อมีออเดอร์ชำระเงินสำเร็จ', enabled: true },
      { label: 'รอส่งโค้ด', desc: 'แจ้งเตือนเมื่อมีออเดอร์รอ manual fulfilment', enabled: true },
      { label: 'คืนเงิน', desc: 'แจ้งเตือนเมื่อทำรายการคืนเงิน', enabled: true },
    ]},
    { category: 'สินค้า', items: [
      { label: 'สต็อกต่ำ', desc: 'แจ้งเตือนเมื่อสินค้าใกล้หมด', enabled: true },
      { label: 'สินค้าหมด', desc: 'แจ้งเตือนเมื่อสินค้าหมดสต็อก', enabled: true },
    ]},
    { category: 'ลูกค้า', items: [
      { label: 'ลูกค้าใหม่', desc: 'แจ้งเตือนเมื่อมีลูกค้าสมัครสมาชิก', enabled: false },
      { label: 'ร้องเรียน', desc: 'แจ้งเตือนเมื่อลูกค้าส่งแบบฟอร์มติดต่อ', enabled: true },
    ]},
    { category: 'ระบบ', items: [
      { label: 'Webhook ล้มเหลว', desc: 'แจ้งเตือนเมื่อ payment webhook ผิดพลาด', enabled: true },
      { label: ' Circuit Breaker เปิด', desc: 'แจ้งเตือนเมื่อ payment gateway ขัดข้อง', enabled: true },
    ]},
  ];

  return (
    <Section title="การแจ้งเตือน" subtitle="ตั้งค่าการแจ้งเตือนสำหรับทีมงาน">
      <div className="space-y-6">
        {notifications.map((group) => (
          <div key={group.category}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">{group.category}</h3>
            <div className="space-y-2">
              {group.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-800/50 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink-200">{item.label}</p>
                    <p className="text-xs text-ink-500">{item.desc}</p>
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

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-ink-100">{title}</h2>
        <p className="mt-1 text-sm text-ink-400">{subtitle}</p>
      </div>
      <div className="space-y-5">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink-300">{label}</label>
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
        enabled ? 'bg-amber-400' : 'bg-ink-700',
      )}
      role="switch"
      aria-checked={enabled}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
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
      className="flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-amber-300"
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
      className="flex h-10 w-10 items-center justify-center rounded-lg border border-ink-600 text-ink-400 hover:bg-ink-800 hover:text-ink-200"
      title="คัดลอก"
    >
      {copied ? <CheckCircle2 size={14} className="text-jade-400" /> : <Copy size={14} />}
    </button>
  );
}
