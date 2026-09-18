import { getAppearance } from '@/lib/data';
import { appearanceToStyle, type AppearanceSpeed } from '@/lib/appearance';

/**
 * Server component: reads the admin appearance settings and emits a :root
 * CSS override so the accent ramp + animation durations apply to the whole
 * document (custom properties only inherit downward, so they must live on
 * the root, not on a sibling wrapper).
 */
export async function ThemeVars(): Promise<React.JSX.Element | null> {
  const { accent, speed } = await getAppearance();
  const style = appearanceToStyle(accent, speed as AppearanceSpeed);
  const declarations = Object.entries(style as Record<string, string>)
    .map(([k, v]) => `${k}:${v};`)
    .join('');
  if (!declarations) return null;
  return <style dangerouslySetInnerHTML={{ __html: `:root{${declarations}}` }} />;
}
