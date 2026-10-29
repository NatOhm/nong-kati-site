/**
 * Release badge placement gates (source-level scan, 2026-10-29).
 *
 * The release identity used to be a 12px line under the dashboard title fed
 * by a private `useEffect` — an operator on any other admin screen could not
 * tell what build was serving. It now has three readings (top bar chip,
 * sidebar footer, dashboard card) backed by ONE cached request.
 *
 * These gates pin that structure as plain text, so a refactor cannot quietly
 * re-introduce the per-page fetch or drop a placement:
 *   1. exactly one file under src/ fetches /api/v1/version, behind a
 *      module-level cache (a fetch per mount would fan out over every
 *      admin navigation);
 *   2. the chip is mounted in the top bar (every admin page) and in the
 *      sidebar footer for BOTH rail and drawer;
 *   3. the dashboard reads the shared hook, keeps its failure/empty copy,
 *      the dirty-build warning and the copy button.
 *
 * Rendered contrast for the new chip is covered by the design-token scan
 * (tests/design-token-gates.test.ts) and e2e/contrast.spec.ts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { deriveRelease } from '../src/components/layout/ReleaseBadge';

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const badge = read('../src/components/layout/ReleaseBadge.tsx');
const topbar = read('../src/components/layout/AdminTopBar.tsx');
const sidebar = read('../src/components/layout/AdminSidebar.tsx');
const dashboard = read('../src/app/management/dashboard/page.tsx');

/** Every .ts/.tsx under src/ as raw text, for the single-fetch rule. */
function* walk(dir: string): Generator<{ file: string; text: string }> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield { file: p, text: readFileSync(p, 'utf8') };
  }
}

const SRC = fileURLToPath(new URL('../src', import.meta.url));

describe('release badge — single shared request', () => {
  it('fetches /api/v1/version with cache: no-store', () => {
    expect(badge).toContain("fetch('/api/v1/version', { cache: 'no-store' })");
  });

  it('caches the request at module scope, and clears it on failure', () => {
    // Module-level (outside any component) — a per-render ref would defeat it.
    expect(badge).toMatch(/^let pending: Promise<ReleaseInfo> \| null = null;$/m);
    expect(badge).toMatch(/^let settled: \{ value: ReleaseInfo; at: number \} \| null = null;$/m);
    // A rejection must release the promise so the next mount retries.
    expect(badge).toMatch(/\.catch\(\(err: unknown\) => \{\s*pending = null;/);
  });

  it('is the only file that fetches the version endpoint', () => {
    const fetchers = [...walk(SRC)]
      .filter((f) => f.text.includes("fetch('/api/v1/version'"))
      .map((f) => path.relative(SRC, f.file));
    expect(fetchers).toEqual([path.join('components', 'layout', 'ReleaseBadge.tsx')]);
  });

  it('degrades invisibly (null on loading / unverifiable / failure)', () => {
    expect(badge).toMatch(/if \(!release\) return null;/);
    expect(badge).toMatch(/if \(!d\.usable\) return null;/);
  });

  it('carries the dirty-build warning once, in Thai, with error tokens', () => {
    expect(badge).toContain('เวอร์ชันนี้สร้างจากไฟล์ที่ยังไม่ได้ commit — แก้ไขไม่ได้จาก commit นี้');
    expect(badge).toMatch(/d\.dirty \? 'border-error bg-error text-fg-error'/);
  });
});

describe('release badge — the build number, not the build id', () => {
  const SHA = 'd6335ad1f2da9dcee79cf19cb3670eebb41c7c75';

  it('renders the stamped release number as #N', () => {
    const d = deriveRelease({
      buildId: 'b3VolF0huX9073f7NUdKN',
      buildNumber: 337,
      gitSha: SHA,
      gitRef: 'master',
    });

    expect(d.displayBuild).toBe('#337');
    expect(d.usable).toBe(true);
    // The raw id stays on the payload for support, but is not what we show.
    expect(d.displayBuild).not.toContain('b3VolF0');
  });

  it('falls back to the short build id while nothing is stamped', () => {
    const d = deriveRelease({
      buildId: 'b3VolF0huX9073f7NUdKN',
      buildNumber: null,
      gitSha: SHA,
      gitRef: 'master',
    });

    expect(d.displayBuild).toBe('b3VolF0h');
    expect(d.usable).toBe(true);
  });

  it('stays unusable rather than rendering a junk number', () => {
    const d = deriveRelease({
      buildId: null,
      buildNumber: null,
      gitSha: 'unknown',
      gitRef: 'unknown',
    });

    expect(d.displayBuild).toBeNull();
    expect(d.usable).toBe(false);
  });

  it('every placement reads the one display token', () => {
    // Chip (top bar / sidebar), collapsed rail and full card all render
    // `displayBuild` — no placement may keep the raw id behind the change.
    expect(badge.match(/d\.displayBuild/g)!.length).toBeGreaterThanOrEqual(5);
    expect(badge).not.toContain('release.buildId && <span>');
    expect(dashboard).toContain('d.displayBuild');
  });
});

describe('release badge — placements', () => {
  it('shows a responsive chip in the top bar (every admin page)', () => {
    expect(topbar).toContain('<ReleaseBadge variant="chip" commit="responsive" />');
    // Mounted before the store link, i.e. inside the always-rendered group.
    expect(topbar.indexOf('<ReleaseBadge')).toBeLessThan(topbar.indexOf('กลับหน้าร้าน'));
  });

  it('pins the footer line in the sidebar rail AND the mobile drawer', () => {
    expect(sidebar).toContain('function SidebarRelease(');
    expect(sidebar).toContain('<SidebarRelease collapsed={collapsed} />'); // desktop rail
    expect(sidebar).toContain('<SidebarRelease collapsed={false} />'); // drawer
    // Both go through the one component that renders the chip.
    expect(sidebar).toMatch(/function SidebarRelease[\s\S]*<ReleaseBadge/);
    // Collapsed 4rem rail: bare short id, no commit — it cannot fit.
    expect(sidebar).toContain("commit={collapsed ? 'none' : 'always'}");
    expect(sidebar).toContain('minimal={collapsed}');
  });

  it('renders the dashboard card on the shared hook, not a private fetch', () => {
    expect(dashboard).toContain('<ReleaseCard />');
    // …and it is the page FOOTER (below Quick Actions), not a line under the
    // title — the title carries the always-on chip instead.
    expect(dashboard).toMatch(/<footer aria-label="เวอร์ชันระบบ">\s*<ReleaseCard \/>/);
    expect(dashboard).toContain('useRelease()');
    expect(dashboard).toContain('<ReleaseBadge variant="full" />');
    // The card still explains failure and "no identity" explicitly — those
    // lines are the one place the operator is TOLD rather than shown nothing.
    expect(dashboard).toContain('ดึงข้อมูลเวอร์ชันไม่สำเร็จ');
    expect(dashboard).toContain('ไม่มีข้อมูลเวอร์ชัน');
    // Warning text and copy payload come from the shared module.
    expect(dashboard).toContain('DIRTY_WARNING_TEXT');
    expect(dashboard).toContain("'คัดลอกแล้ว'");
  });
});
