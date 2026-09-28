import { Gamepad2, Globe, Music, Play, Scissors, Tv, Wrench, type LucideIcon } from 'lucide-react';

/**
 * Category.icon stores a lucide icon *name* (see prisma/seed.ts), not a glyph.
 * Rendering the raw string put literal words like "Scissors" into the UI —
 * and the homepage contrast gate caught that text (fg === bg fallback).
 * Map the known seed names to their components; anything else (or nothing)
 * falls back to a neutral game-pad mark. Always decorative (aria-hidden):
 * the accessible name lives on the wrapping link/heading.
 */
const ICONS: Record<string, LucideIcon> = {
  Globe,
  Music,
  Play,
  Scissors,
  Tv,
  Wrench,
};

export function CategoryIcon({
  name,
  size = 20,
  className,
}: {
  name?: string | null | undefined;
  size?: number;
  className?: string;
}): React.JSX.Element {
  const Icon = (name ? ICONS[name] : undefined) ?? Gamepad2;
  return <Icon size={size} className={className} aria-hidden="true" />;
}
