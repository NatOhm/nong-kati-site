'use client';

import { useState } from 'react';
import { Store, CreditCard, Mail, Shield, Bell, Megaphone, Palette, Banknote, CheckCircle2, Copy, Image as ImageIcon } from 'lucide-react';

import { cn } from '@/utils/cn';

/** A tab's save implementation, registered with the page so the header
 *  button can trigger the active tab's real save. */
export type SettingsSaver = () => Promise<void>;

export type SettingsTab =
  | 'announcement'
  | 'banner'
  | 'appearance'
  | 'store'
  | 'vat'
  | 'payment'
  | 'email'
  | 'security'
  | 'notifications';

export const TABS: { id: SettingsTab; label: string; icon: typeof Store }[] = [
  { id: 'announcement', label: 'แถบประกาศ', icon: Megaphone },
  { id: 'banner', label: 'แบนเนอร์หน้าแรก', icon: ImageIcon },
  { id: 'appearance', label: 'ธีมและแอนิเมชัน', icon: Palette },
  { id: 'store', label: 'ร้านค้า', icon: Store },
  { id: 'vat', label: 'ภาษีมูลค่าเพิ่ม', icon: Banknote },
  { id: 'payment', label: 'การชำระเงิน', icon: CreditCard },
  { id: 'email', label: 'อีเมล', icon: Mail },
  { id: 'security', label: 'ความปลอดภัย', icon: Shield },
  { id: 'notifications', label: 'การแจ้งเตือน', icon: Bell },
];

// ─── Shared Components ────────────────────────────────────

export function Section({
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

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-fg-muted">{label}</label>
      {children}
    </div>
  );
}

export function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
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

export function CopyButton({ text }: { text: string }) {
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
