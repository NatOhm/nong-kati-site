/**
 * Runtime theme ramp generation.
 * The admin picks one accent hex; we derive the full 10-step peach ramp from
 * it (hue/saturation kept, lightness follows the default ramp curve) so brand
 * surfaces, hover steps and alpha tints all stay usable and contrast-safe.
 */

import type { CSSProperties } from 'react';

export const ACCENT_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

/** Lightness (%) per step, lifted from the default peach/orange ramp. */
const STEP_LIGHTNESS: Record<(typeof ACCENT_STEPS)[number], number> = {
  50: 97,
  100: 94,
  200: 85,
  300: 75,
  400: 65,
  500: 55,
  600: 45,
  700: 38,
  800: 30,
  900: 25,
};

/** Decode "#rrggbb" (3- or 6-digit) into [r, g, b] 0-255. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  const raw = m?.[1];
  if (!raw) return null;
  const s = raw.length === 3 ? raw[0]! + raw[0]! + raw[1]! + raw[1]! + raw[2]! + raw[2]! : raw;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(1, Math.max(0, s));
  const light = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let rn = 0;
  let gn = 0;
  let bn = 0;
  if (hue < 60) [rn, gn, bn] = [c, x, 0];
  else if (hue < 120) [rn, gn, bn] = [x, c, 0];
  else if (hue < 180) [rn, gn, bn] = [0, c, x];
  else if (hue < 240) [rn, gn, bn] = [0, x, c];
  else if (hue < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];
  return [Math.round((rn + m) * 255), Math.round((gn + m) * 255), Math.round((bn + m) * 255)];
}

/**
 * Build the CSS custom properties for an accent hex: `--accent-ramp-<step>`
 * holds an "R G B" triplet per ramp step. Returns null for invalid hex
 * (caller then renders no override and the built-in peach shows).
 */
export function accentToCssVars(hex: string): Record<string, string> | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [h, s] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const vars: Record<string, string> = {};
  for (const step of ACCENT_STEPS) {
    const [r, g, b] = hslToRgb(h, s, STEP_LIGHTNESS[step] / 100);
    vars[`--accent-ramp-${step}`] = `${r} ${g} ${b}`;
  }
  return vars;
}

/**
 * Animation-speed presets mapping to the site's semantic duration tokens.
 * "normal" keeps the designed 550ms interactive / 300ms page cadence.
 */
export const SPEED_PRESETS: Record<
  AppearanceSpeed,
  { interactive: string; page: string; float: string }
> = {
  slow: { interactive: '850ms', page: '500ms', float: '9s' },
  normal: { interactive: '550ms', page: '300ms', float: '6s' },
  fast: { interactive: '250ms', page: '150ms', float: '3.5s' },
  off: { interactive: '0ms', page: '0ms', float: '0s' },
};

export type AppearanceSpeed = 'slow' | 'normal' | 'fast' | 'off';

/** Compose the full style attribute for ThemeVars from DB appearance values. */
export function appearanceToStyle(accent: string | null, speed: AppearanceSpeed): CSSProperties {
  const style: CSSProperties = {};
  const accentVars = accent ? accentToCssVars(accent) : null;
  if (accentVars) Object.assign(style, accentVars);
  const durations = SPEED_PRESETS[speed] ?? SPEED_PRESETS['normal'];
  const cssVars = style as unknown as Record<string, string>;
  cssVars['--duration-interactive'] = durations.interactive;
  cssVars['--animate-page-duration'] = durations.page;
  cssVars['--animate-float-duration'] = durations.float;
  return style;
}
