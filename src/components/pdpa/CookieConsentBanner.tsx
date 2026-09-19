'use client';

/**
 * CookieConsent Banner — 05-components.md §12.1, 13-security.md §13.1.
 * PDPA-compliant cookie consent.
 * GA4/analytics only fires after consent (01-prd.md FR-160).
 */

import { useState, useEffect } from 'react';
import { Settings, ShieldCheck } from 'lucide-react';
import { cn } from '@/utils/cn';

const CONSENT_KEY = 'nk_cookie_consent';
const CONSENT_VERSION = '1.0';

export type CookieConsent = {
  version: string;
  necessary: true; // Always true
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
};

// ─── Consent Storage ─────────────────────────────────────

export function getStoredConsent(): CookieConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsent;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeConsent(consent: CookieConsent): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
}

// ─── Component ───────────────────────────────────────────

export function CookieConsentBanner(): React.JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const existing = getStoredConsent();
    if (!existing) {
      setVisible(true);
    }
  }, []);

  const handleAcceptAll = () => {
    const consent: CookieConsent = {
      version: CONSENT_VERSION,
      necessary: true,
      analytics: true,
      marketing: true,
      timestamp: new Date().toISOString(),
    };
    storeConsent(consent);
    setVisible(false);
    // Fire analytics initialization
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nk:consent', { detail: consent }));
    }
  };

  const handleAcceptSelected = () => {
    const consent: CookieConsent = {
      version: CONSENT_VERSION,
      necessary: true,
      analytics,
      marketing,
      timestamp: new Date().toISOString(),
    };
    storeConsent(consent);
    setVisible(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nk:consent', { detail: consent }));
    }
  };

  const handleRejectAll = () => {
    const consent: CookieConsent = {
      version: CONSENT_VERSION,
      necessary: true,
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString(),
    };
    storeConsent(consent);
    setVisible(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nk:consent', { detail: consent }));
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-[4.25rem] z-50 border border-line-subtle bg-surface-base p-4 shadow-lg md:bottom-0 md:border-x-0 md:border-b-0 md:border-t lg:bottom-0 lg:p-6">
      {/* Mobile: sits above the fixed bottom taskbar (bottom-[4.25rem]) so the
          taskbar stays reachable; md/lg have no taskbar → full bottom. */}
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          {/* Icon + Text */}
          <div className="flex items-start gap-3">
            <ShieldCheck size={24} className="mt-0.5 shrink-0 text-fg-brand" />
            <div>
              <h3 className="mb-1 text-sm font-semibold text-fg">การใช้คุกกี้</h3>
              <p className="text-xs leading-relaxed text-fg-placeholder">
                เราใช้คุกกี้เพื่อให้เว็บไซต์ทำงานได้อย่างถูกต้อง
                และปรับปรุงประสบการณ์การใช้งานของคุณ
                คุณสามารถเลือกประเภทของคุกกี้ที่ต้องการอนุญาตได้
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-line-subtle px-3 py-1.5 text-xs text-fg-muted hover:bg-surface"
            >
              <Settings size={12} />
              {showDetails ? 'ซ่อน' : 'ตั้งค่า'}
            </button>
            <button
              onClick={handleRejectAll}
              className="inline-flex min-h-[32px] rounded-md border border-line-subtle px-3 py-1.5 text-xs text-fg-muted hover:bg-surface"
            >
              ปฏิเสธทั้งหมด
            </button>
            <button
              onClick={handleAcceptAll}
              className="inline-flex min-h-[32px] rounded-md bg-peach-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-peach-400"
            >
              ยอมรับทั้งหมด
            </button>
          </div>
        </div>

        {/* Detailed Options */}
        {showDetails && (
          <div className="mt-4 space-y-3 border-t border-line-subtle pt-4">
            {/* Necessary — always on */}
            <label className="flex items-center justify-between">
              <div>
                <p className="text-sm text-fg-secondary">คุกกี้ที่จำเป็น</p>
                <p className="text-clay-9000 text-xs">
                  จำเป็นสำหรับเว็บไซต์ทำงานได้ ไม่สามารถปิดได้
                </p>
              </div>
              <div className="h-5 w-9 rounded-full bg-peach-200">
                <div className="ml-auto h-5 w-5 rounded-full bg-peach-500" />
              </div>
            </label>

            {/* Analytics */}
            <label className="flex cursor-pointer items-center justify-between">
              <div>
                <p className="text-sm text-fg-secondary">คุกกี้เพื่อการวิเคราะห์</p>
                <p className="text-clay-9000 text-xs">ช่วยเราเข้าใจวิธีที่ผู้เข้าชมใช้เว็บไซต์</p>
              </div>
              <button
                onClick={() => setAnalytics(!analytics)}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  analytics ? 'bg-peach-500' : 'bg-clay-300',
                )}
              >
                <div
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                    analytics ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </button>
            </label>

            {/* Marketing */}
            <label className="flex cursor-pointer items-center justify-between">
              <div>
                <p className="text-sm text-fg-secondary">คุกกี้เพื่อการตลาด</p>
                <p className="text-clay-9000 text-xs">ใช้สำหรับแสดงโฆษณาที่เกี่ยวข้อง</p>
              </div>
              <button
                onClick={() => setMarketing(!marketing)}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  marketing ? 'bg-peach-500' : 'bg-clay-300',
                )}
              >
                <div
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                    marketing ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </button>
            </label>

            <div className="pt-2">
              <button
                onClick={handleAcceptSelected}
                className="inline-flex min-h-[36px] rounded-md bg-peach-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-peach-400"
              >
                บันทึกการเลือก
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
