/**
 * Vendored webfonts (2026-10-10) — no build-time font downloads, ever.
 *
 * Mitr / Noto Sans Thai Looped / JetBrains Mono used to load through
 * next/font/google, which fetches the woff2 files from fonts.gstatic.com
 * DURING `next build`. On CI runners that fetch started failing
 * intermittently (next/font TypeError → webpack "Build failed because of
 * webpack errors") and took the whole Browser Smoke gate down with it —
 * twice in three builds, while every local build of the same tree
 * succeeded. The build must never depend on a third-party font CDN.
 *
 * Three things to keep true:
 *   G1  no source file imports next/font/google (the failure mode itself);
 *   G2  every url() referenced by src/app/fonts.css resolves to a real
 *       vendored file in public/fonts/ — a renamed or forgotten woff2
 *       silently drops a whole unicode-range (Thai text → tofu);
 *   G3  the --font-* variables tokens.css consumes are still defined by
 *       fonts.css (they used to be injected by next/font via <html>
 *       className; a rename on either side silently falls back to the
 *       next family in the stack).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
const FONTS_CSS = path.join(ROOT, 'src', 'app', 'fonts.css');

/** Every .ts/.tsx under src/ (source scan — same shape as design-token-gates). */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const fontsCss = readFileSync(FONTS_CSS, 'utf8');

describe('vendored webfonts', () => {
  it('G1: nothing under src/ imports next/font/google (no build-time font fetch)', () => {
    const offenders = sourceFiles(path.join(ROOT, 'src')).filter((f) =>
      /from\s+['"]next\/font\/google['"]/.test(readFileSync(f, 'utf8')),
    );
    expect(
      offenders.map((f) => path.relative(ROOT, f)),
      'next/font/google reintroduces the CI-breaking build-time fetch — use the vendored faces in src/app/fonts.css',
    ).toEqual([]);
  });

  it('G2: every woff2 referenced by fonts.css exists in public/fonts/', () => {
    const urls = [...fontsCss.matchAll(/url\('(\/fonts\/[^']+)'\)/g)].map((m) => m[1]!);
    expect(urls.length, 'fonts.css must reference the vendored faces').toBeGreaterThanOrEqual(18);
    for (const url of urls) {
      const file = path.join(ROOT, 'public', url.replace(/^\//, ''));
      expect(existsSync(file), `missing vendored font: ${url}`).toBe(true);
      // wOF2 magic — a bad download (HTML error page) would otherwise ship.
      const head = readFileSync(file).subarray(0, 4).toString('latin1');
      expect(head, `${url} is not a woff2 file`).toBe('wOF2');
    }
  });

  it('G3: the --font-* variables tokens.css consumes are defined in fonts.css', () => {
    for (const variable of [
      '--font-mitr',
      '--font-noto-sans-thai-looped',
      '--font-jetbrains-mono',
    ]) {
      expect(fontsCss, `${variable} must be defined by fonts.css :root`).toContain(`${variable}:`);
    }
  });
});
