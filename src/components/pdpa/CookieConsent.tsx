'use client';

import { useState, useEffect } from 'react';
import { X, Shield } from 'lucide-react';
import Link from 'next/link';

const COOKIE_CONSENT_KEY = 'nk_cookie_consent';
const COOKIE_CONSENT_VERSION = '1.0';

interface CookieConsent {
  version: string;
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  acceptedAt: string;
}

export function CookieConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState({
    necessary: true,
    analytics: true,
    marketing: false,
  });

  useEffect(() => {
    // Check if user has already consented
    try {
      const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
      if (!stored) {
        setShowBanner(true);
      } else {
        const consent: CookieConsent = JSON.parse(stored);
        if (consent.version !== COOKIE_CONSENT_VERSION) {
          setShowBanner(true);
        }
      }
    } catch {
      setShowBanner(true);
    }
  }, []);

  const saveConsent = (prefs: typeof preferences) => {
    const consent: CookieConsent = {
      version: COOKIE_CONSENT_VERSION,
      necessary: prefs.necessary,
      analytics: prefs.analytics,
      marketing: prefs.marketing,
      acceptedAt: new Date().toISOString(),
    };
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
    setShowBanner(false);

    // Dispatch custom event for other components to react
    window.dispatchEvent(new CustomEvent('cookieConsent', { detail: consent }));
  };

  const handleAcceptAll = () => {
    saveConsent({ necessary: true, analytics: true, marketing: true });
  };

  const handleRejectOptional = () => {
    saveConsent({ necessary: true, analytics: false, marketing: false });
  };

  const handleSavePreferences = () => {
    saveConsent(preferences);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6">
      <div className="mx-auto max-w-2xl rounded-xl border border-ink-700 bg-ink-850 p-5 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400/10">
              <Shield size={20} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-100">
                คุกกี้และความเป็นส่วนตัว
              </h3>
              <p className="text-xs text-ink-400">
                พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
              </p>
            </div>
          </div>
          <button
            onClick={handleRejectOptional}
            className="rounded p-1 text-ink-500 hover:text-ink-300"
            aria-label="ปิด"
          >
            <X size={16} />
          </button>
        </div>

        {/* Description */}
        <p className="mb-4 text-sm leading-relaxed text-ink-300">
          เราใช้คุกกี้เพื่อปรับปรุงประสบการณ์การใช้งานของคุณ วิเคราะห์การเข้าชมเว็บไซต์
          และให้บริการที่ดีที่สุด คุณสามารถเลือกประเภทของคุกกี้ที่ต้องการอนุญาตได้
        </p>

        {/* Toggle Details */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="mb-4 text-xs text-amber-400 hover:text-amber-300"
        >
          {showDetails ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียดคุกกี้'}
        </button>

        {/* Cookie Details */}
        {showDetails && (
          <div className="mb-4 space-y-3 rounded-lg border border-ink-700 bg-ink-800 p-4">
            <CookieToggle
              label="คุกกี้ที่จำเป็น"
              description="จำเป็นสำหรับการทำงานของเว็บไซต์ ไม่สามารถปิดได้"
              checked={preferences.necessary}
              disabled
              onChange={(v) => setPreferences({ ...preferences, necessary: v })}
            />
            <CookieToggle
              label="คุกกี้วิเคราะห์"
              description="ช่วยวิเคราะห์การใช้งานเว็บไซต์เพื่อปรับปรุงบริการ"
              checked={preferences.analytics}
              onChange={(v) => setPreferences({ ...preferences, analytics: v })}
            />
            <CookieToggle
              label="คุกกี้การตลาด"
              description="ใช้สำหรับการแสดงโฆษณาที่เหมาะสมกับความสนใจ"
              checked={preferences.marketing}
              onChange={(v) => setPreferences({ ...preferences, marketing: v })}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={handleRejectOptional}
            className="rounded-md border border-ink-600 px-4 py-2 text-sm font-medium text-ink-300 hover:border-ink-400 hover:text-ink-100"
          >
            ปฏิเสธทั้งหมด
          </button>
          {showDetails && (
            <button
              onClick={handleSavePreferences}
              className="rounded-md border border-amber-700/50 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-400/20"
            >
              บันทึกการตั้งค่า
            </button>
          )}
          <button
            onClick={handleAcceptAll}
            className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-amber-300"
          >
            ยอมรับทั้งหมด
          </button>
        </div>

        {/* Legal Links */}
        <div className="mt-4 flex flex-wrap gap-4 border-t border-ink-700 pt-4">
          <Link href="/legal/privacy" className="text-[11px] text-ink-500 hover:text-ink-300">
            นโยบายความเป็นส่วนตัว
          </Link>
          <Link href="/legal/terms" className="text-[11px] text-ink-500 hover:text-ink-300">
            ข้อกำหนดการใช้งาน
          </Link>
          <Link href="/legal/cookies" className="text-[11px] text-ink-500 hover:text-ink-300">
            นโยบายคุกกี้
          </Link>
          <Link href="/legal/refund" className="text-[11px] text-ink-500 hover:text-ink-300">
            นโยบายการคืนเงิน
          </Link>
        </div>
      </div>
    </div>
  );
}

function CookieToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <div>
        <p className="text-sm font-medium text-ink-200">{label}</p>
        <p className="text-xs text-ink-400">{description}</p>
      </div>
      <div className="mt-1 flex-shrink-0">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-ink-600 bg-ink-800 text-amber-400 focus:ring-amber-400"
        />
      </div>
    </label>
  );
}
