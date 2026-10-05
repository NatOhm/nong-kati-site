/**
 * Admin training-deliverable gates (2026-10-05).
 *
 * The Thai staff training for the regrouped admin nav lives in
 * `webapp/nong-kati/admin-training/`, deliberately OUTSIDE this repository so
 * multi-megabyte binaries never reach a public remote. Being outside git meant
 * nothing was watching it, and two real defects shipped into it unnoticed:
 *
 *   - `th.srt` had 8 overlapping cue windows, so libass stacked two full
 *     sentences at once for ~0.6s at every beat transition. The caption band
 *     measured 47px tall instead of 21px. Any viewer saw doubled captions.
 *   - `index.html` kept a hand-written second copy of the manual's section 0
 *     (the 7 sections, the three role menus, the rail width). It agreed with
 *     the manual on the day it was written and nothing would have stopped the
 *     next person editing one file and silently making the page contradict
 *     the other. Both facts now live only in the manual; this gate asserts the
 *     page never grows a copy back.
 *
 * Both are cheap to state as static invariants, so they run on every `vitest`
 * with no browser, no network and no ffmpeg. The artifact gates skip when the
 * training folder is absent, which is the normal case in CI -- the folder is
 * not in git by design, and the doc-only gates below are what CI actually gets.
 *
 * Pixel-level verification of the burn (that no caption covers the sidebar, and
 * that the glyphs are real letterforms rather than .notdef boxes) needs ffmpeg
 * and takes about 90s, so it is NOT here. `docs/quality-gates.md` records the
 * command to run it by hand before shipping a re-burn.
 *
 * Manual gates (always run, repo-only):
 *   D1 — section 0 holds exactly 7 section rows and 3 role rows, so a
 *        careless rename or deletion cannot quietly shrink the guide.
 *   D2 — the TOC entry for section 0 resolves to the real heading.
 *   D3 — section 0 still states the behaviours the training video claims to
 *        demonstrate (64px rail, mobile drawer, the 403 note).
 *
 * Artifact gates (skipped unless ../admin-training exists):
 *   A1 — index.html restates none of section 0's facts.
 *   A2 — every local href/src in index.html resolves on disk.
 *   A3 — the beat count equals the SRT cue count, and each beat's seek time
 *        falls inside its own cue's window. This also guards the parsing
 *        itself: an earlier regex that stopped matching reported "13/13 ok"
 *        on an empty table.
 *   S1 — th.srt has no overlapping cue windows (the defect above).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
const MANUAL = path.join(ROOT, 'docs', 'admin-manual-th.md');
const ARTIFACTS = path.join(ROOT, '..', 'admin-training');
const PAGE = path.join(ARTIFACTS, 'index.html');
const SRT = path.join(ARTIFACTS, 'th.srt');

const manual = readFileSync(MANUAL, 'utf8');
const section0 = manual.match(/^## 0\. .*?$(.*?)^## 1\. /ms)?.[1] ?? '';
const sections = [...section0.matchAll(/^\| \*\*(.+?)\*\* \|/gm)].map((m) => m[1]!);
const roles = [...section0.matchAll(/^\| (Super Admin|Catalogue Manager|Order Manager) \| (\d+) หัวข้อ \|/gm)];

/** SRT fractions are centiseconds: "03.28" is 3.28s, not 3.028s. */
const seconds = (t: string): number => {
  const m = t.trim().match(/(\d+):(\d+):(\d+)[.,](\d+)/)!;
  return +m[1]! * 3600 + +m[2]! * 60 + +m[3]! + +m[4]! / 100;
};

// The artifact gates skip in CI, where this folder is absent by design. Skipping
// is visible in the vitest output; a "skipped" test asserting the skip would be
// the one thing here that can never fail.
const hasArtifacts = existsSync(PAGE) && existsSync(SRT);

describe('docs/admin-manual-th.md section 0', () => {
  it('D1: holds exactly 7 section rows and 3 role rows', () => {
    expect(sections, 'section 0.1 must list the 7 nav sections').toHaveLength(7);
    expect(roles, 'section 0.5 must map the 3 admin roles').toHaveLength(3);
    expect(roles.map((r) => r[2])).toEqual(['7', '4', '4']);
  });

  it('D2: the TOC entry for section 0 resolves to the real heading', () => {
    const heading = manual.match(/^## 0\. (.+)$/m)?.[1]?.trim();
    expect(heading, 'section 0 heading not found').toBeTruthy();
    const toc = manual.match(/^0\. \[.+?\]\(#(.+?)\)$/m)?.[1];
    expect(toc, 'TOC entry for section 0 not found').toBeTruthy();
    // GitHub drops punctuation rather than dashing it, so the slug is taken from
    // the manual's own TOC instead of being re-derived here.
    const link = manual.match(/\[เมนูหลังบ้านรูปแบบใหม่\]\(#(.+?)\)/)?.[1];
    expect(link, 'section 0 TOC anchor does not resolve to the heading slug').toBe(toc);
    expect(section0.length).toBeGreaterThan(0);
  });

  it('D3: still states the rail, mobile and 403 behaviour the video demonstrates', () => {
    expect(section0, 'rail width missing').toMatch(/64\s*px/);
    expect(section0, 'mobile drawer missing').toMatch(/ลิ้นชัก/);
    expect(section0, 'mobile auto-close missing').toMatch(/ปิดเอง/);
    expect(section0, '403 permission note missing').toMatch(/403/);
  });
});

describe.skipIf(!hasArtifacts)('admin-training deliverable', () => {
  // describe.skipIf still evaluates this callback at collection time, so the
  // read must be guarded here rather than left to run unconditionally — an
  // unguarded read throws ENOENT in a fresh clone and takes the doc-only gates
  // above down with it, turning a skip into a red build.
  const html = hasArtifacts ? readFileSync(PAGE, 'utf8') : '';

  it('A1: index.html restates none of section 0\'s facts', () => {
    // The beat captions are read from th.srt and legitimately quote role names
    // and the rail width, so those regions are excluded before scanning.
    const shell = html
      .replace(/<ul class="beats">.*?<\/ul>/s, '')
      .replace(/<footer[\s\S]*?<\/footer>/, '');
    for (const s of [...sections, ...roles.map((r) => r[1]!)]) {
      expect(shell, `page restates "${s}" — section 0 is the only owner`).not.toContain(s);
    }
    expect(shell).not.toContain('64px');
    expect(shell).not.toContain('drawerClosed');
  });

  it('A2: every local href/src resolves on disk', () => {
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((m) => m[1]!)
      .filter((r) => !/^(https?:|data:|#)/.test(r))
      .map((r) => r.split('#')[0]!);
    const missing = [...new Set(refs)].filter(
      (r) => r && !existsSync(path.resolve(path.dirname(PAGE), decodeURIComponent(r))),
    );
    expect(missing, `broken local references: ${missing.join(', ')}`).toEqual([]);
  });

  it('A3: the beat list matches the SRT, cue for cue', () => {
    const cues = readFileSync(SRT, 'utf8')
      .trim()
      .split(/\n\s*\n/)
      .map((block) => {
        const lines = block.split('\n').map((l) => l.trim());
        const [from, to] = lines[1]!.split('-->');
        return { start: seconds(from!), end: seconds(to!), text: lines.slice(2).join(' ') };
      });
    const beats = [...html.matchAll(/<a data-t="([\d.]+)"[^>]*>[\s\S]*?<span class="cue">([\s\S]*?)<\/span>/g)].map(
      (m) => ({ at: Number(m[1]), cue: m[2]!.trim() }),
    );

    // Guards the parse itself: a regex that silently stops matching would
    // otherwise report a clean pass over an empty list.
    expect(
      beats.length,
      'beat count must equal the SRT cue count, or this gate is parsing nothing',
    ).toBe(cues.length);

    beats.forEach((b, i) => {
      const cue = cues[i]!;
      expect(b.cue, `beat ${i + 1} quotes text that is not on screen at ${b.at}s`).toBe(cue.text);
      expect(
        cue.start <= b.at && b.at < cue.end,
        `beat ${i + 1} seeks to ${b.at}s, outside its cue window ${cue.start}-${cue.end}s`,
      ).toBe(true);
    });
  });

  it('S1: th.srt has no overlapping cue windows', () => {
    const cues = readFileSync(SRT, 'utf8')
      .trim()
      .split(/\n\s*\n/)
      .map((block) => {
        const lines = block.split('\n').map((l) => l.trim());
        const [from, to] = lines[1]!.split('-->');
        return { start: seconds(from!), end: seconds(to!) };
      });
    const overlaps = cues
      .slice(0, -1)
      .map((c, i) => ({ at: i + 1, over: c.end - cues[i + 1]!.start }))
      .filter((o) => o.over > 0);
    expect(
      overlaps,
      'overlapping cues make libass stack two sentences at once: ' +
        overlaps.map((o) => `cue ${o.at} overruns cue ${o.at + 1} by ${o.over.toFixed(2)}s`).join('; '),
    ).toEqual([]);
    const shortest = Math.min(...cues.map((c) => c.end - c.start));
    expect(shortest, `shortest cue is only ${shortest.toFixed(2)}s — unreadable`).toBeGreaterThan(1.5);
  });
});