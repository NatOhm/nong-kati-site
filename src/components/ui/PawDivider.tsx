import { PawIcon } from '@/components/ui/ClayIcons';

/**
 * Hamster-theme divider: three clay paw prints walking across the gap
 * between homepage sections. Purely decorative — hidden from screen readers
 * and from users who prefer reduced motion (paws stay static).
 */
export function PawDivider({ className }: { className?: string }): React.JSX.Element {
  return (
    <div aria-hidden="true" className={className}>
      <div className="mx-auto flex w-fit items-center gap-6 opacity-60">
        {[0, 1, 2].map((i) => (
          <span key={i} className="mascot-peek" style={{ animationDelay: `${i * 0.35}s` }}>
            <PawIcon size={20} />
          </span>
        ))}
      </div>
    </div>
  );
}
