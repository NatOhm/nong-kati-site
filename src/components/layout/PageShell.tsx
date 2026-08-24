import { cn } from '@/utils/cn';

export interface PageShellProps {
  children: React.ReactNode;
  maxWidth?: 'content' | 'prose' | 'full';
  paddingX?: boolean;
  className?: string;
}

const maxWidthClass: Record<NonNullable<PageShellProps['maxWidth']>, string> = {
  content: 'max-w-content',
  prose: 'max-w-prose',
  full: 'max-w-none',
};

/** 05-components.md §1.5 — consistent page-level wrapper: max-width, responsive padding, enter animation. */
export function PageShell({
  children,
  maxWidth = 'content',
  paddingX = true,
  className,
}: PageShellProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'animate-page-enter mx-auto w-full',
        maxWidthClass[maxWidth],
        paddingX && 'px-4 md:px-8 lg:px-12',
        className,
      )}
    >
      {children}
    </div>
  );
}
