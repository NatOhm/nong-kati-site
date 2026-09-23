'use client';

import { cn } from '@/utils/cn';
import { useMascotUrl } from '@/providers/MascotProvider';

import { HamsterMascot } from './ClayIcons';

/**
 * SiteMascot — the site's mascot with admin override.
 * When the admin uploaded a custom image (appearance.mascotUrl), that renders
 * instead of the built-in clay hamster SVG. Animation classes
 * (mascot-wave / mascot-sniff / mascot-beg / cheeks hover) keep working —
 * they target the element this component returns, and object-contain keeps
 * any uploaded image inside the same footprint as the SVG.
 *
 * Client-safe (context): works in client components and server trees alike;
 * the URL itself is resolved once in the root layout.
 */
export function SiteMascot({
  size = 120,
  className,
}: {
  size?: number;
  className?: string;
}): React.JSX.Element {
  const mascotUrl = useMascotUrl();

  if (mascotUrl) {
    return (
      // Uploaded images are content-addressed and immutable — plain img is
      // correct here (next/image adds nothing for arbitrary admin uploads
      // served from an API route).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={mascotUrl}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className={cn('object-contain', className)}
      />
    );
  }

  return <HamsterMascot size={size} className={className ?? ''} />;
}
