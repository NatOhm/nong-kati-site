'use client';

import { cn } from '@/utils/cn';

export interface BankNoteImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  imageUrl: string;
  height?: number;
}

/**
 * Renders the bank-note/QR PNG the backend generated for the named store
 * account. Stable alt text stays the same across renders so the heading test
 * keeps asserting the same accessible name; the component does NOT auto-promote
 * or rewrite this image based on any meta origin.
 */
export function BankNoteImage({ imageUrl, height = 92, className, alt, ...rest }: BankNoteImageProps): React.JSX.Element {
  // Admin-generated payment QR served from our own API — next/image would
  // need a loader config this component has no business knowing.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={alt ?? 'QR พร้อมเพย์ธนาคารไทยของร้าน'}
      height={height}
      width={height}
      className={cn('object-contain', className)}
      {...rest}
    />
  );
}
