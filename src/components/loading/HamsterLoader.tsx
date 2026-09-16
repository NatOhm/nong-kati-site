import { cn } from '@/utils/cn';
import { MascotImage } from '@/components/ui/MascotImage';

/**
 * Wait animation: the Nong-Kati hamster mascot bouncing on a little clay
 * mound while content loads. Reduced motion handled globally.
 */
export function HamsterLoader({
  label = 'กำลังโหลด',
  className,
}: {
  label?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="กำลังโหลด"
      className={cn('flex flex-col items-center gap-4 py-12', className)}
    >
      <div className="relative flex flex-col items-center">
        <div className="animate-clay-bounce">
          <MascotImage size={88} className="drop-shadow-[0_8px_14px_rgba(147,107,73,0.3)]" />
        </div>
        {/* clay mound the hamster bounces on */}
        <div className="-mt-2 h-4 w-24 rounded-[100%] bg-jade-500/30" />
      </div>
      <p className="text-sm font-medium text-fg-muted">{label}…</p>
    </div>
  );
}
