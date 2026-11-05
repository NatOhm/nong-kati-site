/**
 * บันทึกแพตช์ must always describe what is actually on production (1.1.9).
 *
 * The page reads src/data/patch-notes.json, which scripts/patch-notes.mjs
 * generates from the deploy-log table in docs/hostatom-live.md. That only helps
 * if the committed JSON is never older than the log — otherwise the admin sees
 * a "latest release" that is not the latest release, which is worse than no
 * page at all. P1 is the whole point of this suite: edit the log and forget to
 * regenerate, and the build goes red.
 *
 *   P1  regeneration from the log equals the committed JSON (drift gate),
 *   P2  newest-first, unique BUILD_IDs, nothing dated in the future,
 *   P3  every entry is complete: commit, BUILD_ID, ISO date, title, detail,
 *   P4  the page reads that JSON and the nav points at the route.
 *
 * The parsing side is deliberately tested against the *real* log, not a
 * fixture: the log is the owner of history, so a table the parser can no
 * longer read is itself the failure worth catching.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Plain ESM script, shipped without type declarations on purpose: it runs under
// bare `node` during deploys, so it cannot import from src/.
// @ts-expect-error -- untyped .mjs helper
import { buildPatchNotes, parseDeployLog } from '../scripts/patch-notes.mjs';

const ROOT = path.join(__dirname, '..');
const COMMITTED = JSON.parse(
  readFileSync(path.join(ROOT, 'src', 'data', 'patch-notes.json'), 'utf8')
) as Array<{
  version: string | null;
  date: string;
  dateLabel: string;
  gitSha: string;
  buildId: string;
  title: string;
  detail: string;
}>;

const PAGE = readFileSync(
  path.join(ROOT, 'src', 'app', 'management', 'patch-notes', 'page.tsx'),
  'utf8'
);
const NAV = readFileSync(path.join(ROOT, 'src', 'lib', 'adminNav.ts'), 'utf8');

describe('patch notes — generated from the deploy log', () => {
  it('P1: the committed JSON is exactly what the log generates today', () => {
    expect(COMMITTED).toEqual(buildPatchNotes());
  });

  it('P2: newest first, unique builds, no future dates', () => {
    const dates = COMMITTED.map((n) => n.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(new Set(COMMITTED.map((n) => n.buildId)).size).toBe(COMMITTED.length);
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate()
    ).padStart(2, '0')}`;
    for (const note of COMMITTED) expect(note.date <= todayIso, note.buildId).toBe(true);
  });

  it('P3: every entry is complete enough to find the build', () => {
    for (const note of COMMITTED) {
      expect(note.gitSha, note.buildId).toMatch(/^[0-9a-f]{7,40}$/);
      expect(note.buildId).toMatch(/^[A-Za-z0-9_-]{6,}$/);
      expect(note.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(note.dateLabel.length).toBeGreaterThan(0);
      expect(note.title.length).toBeGreaterThan(8);
      expect(note.detail.length).toBeGreaterThan(note.title.length);
      if (note.version) expect(note.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('P4: the page renders that data and the sidebar links to it', () => {
    expect(PAGE).toMatch(/from '@\/data\/patch-notes\.json'/);
    expect(PAGE).toMatch(/patchNotes as PatchNote\[\]/);
    expect(PAGE).toMatch(/NOTES\.map\(/);
    expect(NAV).toContain("href: '/management/patch-notes'");
    expect(NAV).toMatch(/label: 'บันทึกแพตช์'[\s\S]{0,120}permission: 'settings:read'/);
  });

  it('P5: rows that shipped no code stay out of the list', () => {
    const log = readFileSync(path.join(ROOT, 'docs', 'hostatom-live.md'), 'utf8');
    // A DB cleanup / secret rotation row never has both a commit and a BUILD_ID.
    const skipped = parseDeployLog(log).length;
    const tableRows = log
      .split(/\r?\n/)
      .filter((l) => l.startsWith('| ') && /\d{4}/.test(l) && !l.includes('---'));
    expect(tableRows.length).toBeGreaterThan(skipped);
  });
});
