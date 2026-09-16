import Image from 'next/image';
import { cn } from '@/utils/cn';

/**
 * The official Nong-Kati hamster mascot, served from /public/mascot.
 * Picks the right pre-generated PNG variant for the requested render size
 * so the browser never downloads more than needed. Decorative by default.
 */

interface MascotImageProps {
  size?: number;
  className?: string;
  /** Accessible name; omit for purely decorative usage. */
  alt?: string;
}

export function MascotImage({ size = 40, className, alt }: MascotImageProps): React.JSX.Element {
  // Face-only crop reads much better at small sizes (favicon/toast scale).
  const useFace = size <= 48;
  const src =
    size <= 64
      ? useFace
        ? '/mascot/mascot-face-64.png'
        : '/mascot/mascot-128.png'
      : size <= 128
        ? useFace
          ? '/mascot/mascot-face-256.png'
          : '/mascot/mascot-256.png'
        : '/mascot/mascot-512.png';

  return (
    <Image
      src={src}
      alt={alt ?? ''}
      width={size}
      height={size}
      className={cn('rounded-full', className)}
      priority={size > 100}
      sizes={`${size}px`}
    />
  );
}
