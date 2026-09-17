import Link from 'next/link';
import { HamsterSleeping } from '@/components/ui/ClayIcons';

/**
 * Global 404 — the mascot fell asleep waiting for this page to load.
 * Reuses the site's clay primitives; the Zzz drift is the only motion.
 */
export default function NotFound(): React.JSX.Element {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="relative mb-6">
        <HamsterSleeping size={150} className="drop-shadow-[0_8px_14px_rgba(147,107,73,0.3)]" />
        {/* drifting Zzz */}
        <div
          aria-hidden="true"
          className="zzz absolute -right-2 -top-2 font-display text-lg font-bold text-fg-placeholder"
        >
          <span className="absolute">Z</span>
          <span className="absolute">z</span>
          <span className="absolute">z</span>
        </div>
      </div>
      <h1 className="font-display text-5xl font-bold text-fg-brand-strong">404</h1>
      <p className="mt-3 max-w-sm text-base text-fg-muted">
        ไม่พบหน้าที่คุณกำลังหา — น้องแฮมสเตอร์หลับไประหว่างรอ
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full bg-peach-500 px-6 py-2.5 text-sm font-semibold text-white shadow-clay-brand transition-all hover:scale-[1.03] hover:bg-peach-400 hover:shadow-clay-lg active:scale-[0.96] active:shadow-clay-press"
        >
          กลับหน้าหลัก
        </Link>
        <Link
          href="/search"
          className="clay-btn inline-flex items-center justify-center rounded-full border border-line bg-surface px-6 py-2.5 text-sm font-semibold text-fg transition-all hover:scale-[1.03] hover:shadow-clay-sm active:scale-[0.96]"
        >
          ค้นหาสินค้า
        </Link>
      </div>
    </div>
  );
}
