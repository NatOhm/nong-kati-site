import { cn } from '@/utils/cn';
import { HamsterWheelSpinner } from '@/components/ui/ClayIcons';

/**
 * Wait animation: a clay hamster running in its wheel while content loads.
 * Pure CSS rotation — reduced motion handled globally.
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
      <HamsterWheelSpinner size={80} />
      <p className="text-sm font-medium text-fg-muted">{label}…</p>
    </div>
  );
}
