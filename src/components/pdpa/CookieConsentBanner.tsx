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
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-ink-700 bg-ink-900 p-4 shadow-lg md:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          {/* Icon + Text */}
          <div className="flex items-start gap-3">
            <ShieldCheck size={24} className="mt-0.5 shrink-0 text-amber-400" />
            <div>
              <h3 className="mb-1 text-sm font-semibold text-ink-100">
                การใช้คุกกี้
              </h3>
              <p className="text-xs leading-relaxed text-ink-400">
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
              className="inline-flex items-center gap-1 rounded-md border border-ink-700 px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-800"
            >
              <Settings size={12} />
              {showDetails ? 'ซ่อน' : 'ตั้งค่า'}
            </button>
            <button
              onClick={handleRejectAll}
              className="rounded-md border border-ink-700 px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-800"
            >
              ปฏิเสธทั้งหมด
            </button>
            <button
              onClick={handleAcceptAll}
              className="rounded-md bg-amber-400 px-4 py-1.5 text-xs font-medium text-ink-900 hover:bg-amber-300"
            >
              ยอมรับทั้งหมด
            </button>
          </div>
        </div>

        {/* Detailed Options */}
        {showDetails && (
          <div className="mt-4 space-y-3 border-t border-ink-700 pt-4">
            {/* Necessary — always on */}
            <label className="flex items-center justify-between">
              <div>
                <p className="text-sm text-ink-200">คุกกี้ที่จำเป็น</p>
                <p className="text-xs text-ink-500">จำเป็นสำหรับเว็บไซต์ทำงานได้ ไม่สามารถปิดได้</p>
              </div>
              <div className="h-5 w-9 rounded-full bg-amber-900/50">
                <div className="ml-auto h-5 w-5 rounded-full bg-amber-400" />
              </div>
            </label>

            {/* Analytics */}
            <label className="flex cursor-pointer items-center justify-between">
              <div>
                <p className="text-sm text-ink-200">คุกกี้เพื่อการวิเคราะห์</p>
                <p className="text-xs text-ink-500">ช่วยเราเข้าใจวิธีที่ผู้เข้าชมใช้เว็บไซต์</p>
              </div>
              <button
                onClick={() => setAnalytics(!analytics)}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  analytics ? 'bg-amber-400' : 'bg-ink-700'
                )}
              >
                <div
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                    analytics ? 'left-[18px]' : 'left-0.5'
                  )}
                />
              </button>
            </label>

            {/* Marketing */}
            <label className="flex cursor-pointer items-center justify-between">
              <div>
                <p className="text-sm text-ink-200">คุกกี้เพื่อการตลาด</p>
                <p className="text-xs text-ink-500">ใช้สำหรับแสดงโฆษณาที่เกี่ยวข้อง</p>
              </div>
              <button
                onClick={() => setMarketing(!marketing)}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  marketing ? 'bg-amber-400' : 'bg-ink-700'
                )}
              >
                <div
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                    marketing ? 'left-[18px]' : 'left-0.5'
                  )}
                />
              </button>
            </label>

            <div className="pt-2">
              <button
                onClick={handleAcceptSelected}
                className="rounded-md bg-amber-400 px-4 py-1.5 text-xs font-medium text-ink-900 hover:bg-amber-300"
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
