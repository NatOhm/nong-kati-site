'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Save } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { cn } from '@/utils/cn';

import { TABS, type RegisterSaver, type SettingsSaver, type SettingsTab } from './shared';
import { AnnouncementSettings } from './sections/AnnouncementSettings';
import { AppearanceSettings } from './sections/AppearanceSettings';
import { BannerSettings } from './sections/BannerSettings';
import { EmailSettings } from './sections/EmailSettings';
import { ManualTransferSettings } from './sections/ManualTransferSettings';
import { NotificationSettings } from './sections/NotificationSettings';
import { PaymentSettings } from './sections/PaymentSettings';
import { SecuritySettings } from './sections/SecuritySettings';
import { StoreSettings } from './sections/StoreSettings';
import { VatSettings } from './sections/VatSettings';

export default function AdminSettingsPage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<SettingsTab>('store');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Every visible panel registers its real save here (the payment tab renders
  // two of them, so a single slot would silently drop one).
  const saversRef = useRef(new Set<SettingsSaver>());
  const [canSave, setCanSave] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Deep link support (e.g. forced password change after first login).
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab && TABS.some((t) => t.id === tab)) setActiveTab(tab as SettingsTab);
  }, []);

  const registerSaver: RegisterSaver = useCallback((fn: SettingsSaver): (() => void) => {
    saversRef.current.add(fn);
    setCanSave(true);
    return () => {
      saversRef.current.delete(fn);
      setCanSave(saversRef.current.size > 0);
    };
  }, []);

  async function handleSave() {
    const savers = [...saversRef.current];
    if (savers.length === 0 || saveState === 'saving') return;
    setSaveState('saving');
    setSaveError(null);
    try {
      // Sequential: each panel writes its own endpoint, one request at a time.
      for (const save of savers) await save();
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : null);
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 2500);
    }
  }

  return (
    <AdminShell staffRole="super_admin" breadcrumbs={[{ label: 'ตั้งค่า' }]}>
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

        {saveError && (
          <p role="alert" className="text-sm text-fg-error">
            บันทึกไม่สำเร็จ: {saveError}
          </p>
        )}

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
                      'transition-smart flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
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
            {activeTab === 'vat' && <VatSettings registerSaver={registerSaver} />}
            {activeTab === 'payment' && (
              <>
                <ManualTransferSettings registerSaver={registerSaver} />
                <PaymentSettings registerSaver={registerSaver} />
              </>
            )}
            {activeTab === 'email' && <EmailSettings registerSaver={registerSaver} />}
            {activeTab === 'security' && <SecuritySettings registerSaver={registerSaver} />}
            {activeTab === 'notifications' && (
              <NotificationSettings registerSaver={registerSaver} />
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
