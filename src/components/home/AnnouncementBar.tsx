'use client';

import { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';

interface AnnouncementContent {
  message: string;
  href: string | null;
  enabled: boolean;
}

const FALLBACK: AnnouncementContent = {
  message: `🎉 โปรโมชั่นพิเศษ! ส่วนลดทุกบัตรในหน้าร้าน`,
  href: '/search',
  enabled: true,
};

/**
 * The announcement strip above the page — content is admin-editable via
 * /management/settings (stored in the SiteSetting table, key 'announcement').
 * Renders the default immediately (no layout shift) and swaps in the live
 * value from the API on mount; hides itself when disabled.
 */
export function AnnouncementBar(): React.JSX.Element | null {
  const [content, setContent] = useState<AnnouncementContent>(FALLBACK);
  const [isVisible, setIsVisible] = useState(true);

  // Pick up admin edits without a full page reload.
  useEffect(() => {
    fetch('/api/v1/announcement')
      .then((r) => (r.ok ? (r.json() as Promise<AnnouncementContent>) : null))
      .then((data) => {
        if (data) setContent(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!content.enabled) setIsVisible(false);
  }, [content.enabled]);

  if (!content.enabled || !isVisible) return null;

  return (
    <div className="relative bg-gradient-to-r from-peach-400 via-peach-300 to-peach-400 px-4 py-2">
      <div className="mx-auto flex max-w-[1440px] items-center justify-center gap-2 text-center">
        <Sparkles size={16} className="shrink-0 text-peach-900" aria-hidden="true" />
        <p className="text-sm font-medium text-fg">
          <span className="font-bold">{content.message}</span>
          {content.href && (
            <>
              {' — '}
              <a
                href={content.href}
                className="inline-flex min-h-[32px] items-center font-bold underline hover:text-peach-800"
              >
                กดซื้อเลย!
              </a>
            </>
          )}
        </p>
        {/* Audit #8: close is a bare control at the screen edge — 44×44 hit
            area (icon unchanged). */}
        <button
          onClick={() => setIsVisible(false)}
          className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full transition-colors hover:bg-clay-500/20 hover:text-fg"
          aria-label="ปิดประกาศ"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
