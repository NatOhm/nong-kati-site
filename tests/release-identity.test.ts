/**
 * The artifact's identity is written BY THE PACK, never authored before the build (2026-11-24).
 *
 * The 1.2.6 ship went wrong in a way that no gate could see: the release row in
 * docs/hostatom-live.md named a BUILD_ID and a commit, the build then produced
 * different bytes, and correcting the row meant editing `src/data/patch-notes.json`
 * *after* the build — so the packed tar was no longer bytes-of-HEAD and task 250
 * was re-pinned to a commit nothing had been built from. The fix is a rule, not a
 * habit: a row with no commit and no BUILD_ID is a PREPARED row, it stays out of
 * the patch-notes JSON, and the identity the operator copies is the one the pack
 * printed from `.next`.
 *
 *   R1  an identity-free row is skipped by parseDeployLog — in every shape
 *       (no commit, no BUILD_ID, both missing) — and the parser invents nothing,
 *   R2  adding such a row to the real log leaves the committed JSON byte-identical,
 *       so preparing a release requires no `src/data` edit at all,
 *   R3  a row that calls itself prepared may not carry a commit or a BUILD_ID:
 *       a packer who puts one there before building goes red here,
 *   R4  the REAL pack writes `tmp/release-stamp.txt`, and it equals the `.next`
 *       stamps it verified — never the id in the doc,
 *   R5  writing that file cannot dirty the certified tree (`tmp/` is ignored).
 *
 * R1–R3 are pure and run everywhere. R4 builds a throwaway git repo and runs
 * `scripts/deploy-artifact.sh` with SKIP_BUILD=1 against a local build, the same
 * way a real pack does; it is skipped where `bash` is unavailable.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

// @ts-expect-error -- untyped .mjs helper (deploy tooling runs it under bare `node`)
import { buildPatchNotes, parseDeployLog } from '../scripts/patch-notes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

const HEADER = '| Date | Commit (ref) | BUILD_ID | Notes |';
const SEPARATOR = '|---|---|---|---|';

/** A row that names nothing: this is what "prepared" looks like on disk. */
const PREPARED_ROW =
  '| Nov 24, 2026 | prepared on `release/1.2.6-slip-recheck` | — (assigned by the pack) | **1.2.6 — prepared, not live.** The id comes from the pack. |';

/** One real build row, so the parser has something to keep. */
const SHIPPED_ROW =
  '| Nov 20, 2026 | `abc1234` on `master` | `KnownBuild_123456` | **1.2.5 — shipped.** A real detail sentence for the page. |';

/** The first four cells of a table row; notes may contain escaped pipes, later ones. */
const cells = (line: string): string[] => line.split('|').slice(1, 5).map((c) => c.trim());

const isBacktickedSha = (cell: string): boolean => /`[0-9a-f]{7,40}`/.test(cell);
const isBacktickedBuild = (cell: string): boolean => /`[A-Za-z0-9_-]{6,}`/.test(cell);

describe('release identity — a prepared row names nothing', () => {
  it('R1: every identity-free row shape is skipped, and no row is invented', () => {
    const cases: Array<{ label: string; row: string }> = [
      { label: 'prepared placeholder', row: PREPARED_ROW },
      {
        label: 'commit but no BUILD_ID',
        row: '| Nov 23, 2026 | `abc1234` on `master` | — | **1.2.6 — prepared.** Not built yet. |',
      },
      {
        label: 'BUILD_ID but no commit',
        row: '| Nov 23, 2026 | — (not committed) | `GuessedId_1234` | **1.2.6 — prepared.** Not built yet. |',
      },
    ];

    for (const { label, row } of cases) {
      const md = [HEADER, SEPARATOR, row, SHIPPED_ROW, ''].join('\n');
      const versions = parseDeployLog(md).map((n: { version: string | null }) => n.version);
      expect(versions, label).toEqual(['1.2.5']);
    }

    // The example with BOTH halves is a build, and it survives — the skip is
    // about missing identity, not about which row we happen to be looking at.
    const both = [HEADER, SEPARATOR, PREPARED_ROW, SHIPPED_ROW, ''].join('\n');
    expect(parseDeployLog(both)).toHaveLength(1);
  });

  it('R1b: the real log parses to exactly the rows that carry both halves', () => {
    // Counted off the table itself rather than against a stored number: if the
    // parser ever starts inventing an identity (or dropping a real build), the
    // two counts separate no matter how many releases have shipped since.
    const log = read('docs/hostatom-live.md');
    const lines = log.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim().startsWith(HEADER));
    expect(start, 'deploy-log header not found').toBeGreaterThan(-1);

    const rows: string[][] = [];
    for (const line of lines.slice(start + 2)) {
      if (!line.trim().startsWith('|')) break;
      rows.push(cells(line));
    }

    const withBothHalves = rows.filter(
      ([, commit = '', build = '']) => isBacktickedSha(commit) && isBacktickedBuild(build),
    );
    expect(parseDeployLog(log)).toHaveLength(withBothHalves.length);
  });

  it('R2: adding a prepared row forces no edit to src/data', () => {
    // This is the whole cost of the old rule: the row had to be filled in after
    // the build, which rewrote a shipped JSON file and took the tar off HEAD.
    // Preparing a release must be free, so the generated list has to be exactly
    // what is committed today.
    const log = read('docs/hostatom-live.md');
    const lines = log.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim().startsWith(HEADER));
    expect(start, 'deploy-log header not found').toBeGreaterThan(-1);

    lines.splice(start + 2, 0, PREPARED_ROW);
    const generated = parseDeployLog(lines.join('\n'));

    const committed = JSON.parse(read('src/data/patch-notes.json'));
    expect(generated).toEqual(committed);
    expect(generated).toEqual(buildPatchNotes());
  });

  it('R3: a row that says it is prepared carries no commit and no BUILD_ID', () => {
    // The 1.2.6 regression, as a gate: the prepared row named an id before any
    // build existed and the pack then disagreed with the shipped docs. A row
    // gains `commit` + `BUILD_ID` when it is deployed (from /api/v1/version), and
    // at that moment the word "prepared" leaves the row; until then this is red.
    const log = read('docs/hostatom-live.md');
    const lines = log.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim().startsWith(HEADER));
    expect(start, 'deploy-log header not found').toBeGreaterThan(-1);

    const prepared: Array<{ row: string; commit: string; build: string }> = [];
    for (const line of lines.slice(start + 2)) {
      if (!line.trim().startsWith('|')) break;
      if (!/prepared|not live|not deployed/i.test(line)) continue;
      const [, commit = '', build = ''] = cells(line);
      prepared.push({ row: line, commit, build });
    }

    for (const { row, commit, build } of prepared) {
      expect(isBacktickedSha(commit), `prepared row names a commit: ${row.slice(0, 80)}`).toBe(false);
      expect(isBacktickedBuild(build), `prepared row names a BUILD_ID: ${row.slice(0, 80)}`).toBe(
        false,
      );
    }
  });

  it('R5: tmp/ is ignored, so the pack’s stamp file cannot dirty the tree', () => {
    // The stamp has to live somewhere the next step can read it without turning
    // the certified worktree into a "dirty" one on the next run.
    expect(read('.gitignore').split(/\r?\n/)).toContain('tmp/');
    expect(read('.gitignore').split(/\r?\n/)).toContain('deploy-bundle.tar.gz');
  });
});

/** `bash` is what deploy-artifact.sh is written in; a bare Windows shell may lack it. */
const HAS_BASH = spawnSync('bash', ['-c', 'exit 0'], { encoding: 'utf8' }).status === 0;

const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'release-identity',
  GIT_AUTHOR_EMAIL: 'release-identity@example.invalid',
  GIT_COMMITTER_NAME: 'release-identity',
  GIT_COMMITTER_EMAIL: 'release-identity@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
};

const sandboxes: string[] = [];

function put(dir: string, relPath: string, content: string): void {
  const full = join(dir, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV });
}

afterAll(() => {
  for (const dir of sandboxes) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort (Windows keeps handles) */
    }
  }
});

describe.skipIf(!HAS_BASH)('release identity — the pack writes the stamps', () => {
  it(
    'R4: writes tmp/release-stamp.txt from .next, not from the doc, and leaves the tree clean',
    { timeout: 60_000 },
    () => {
      const work = mkdtempSync(join(tmpdir(), 'nk-identity-'));
      sandboxes.push(work);

      git(work, 'init', '-q');
      git(work, 'symbolic-ref', 'HEAD', 'refs/heads/release');

      // Exactly what deploy-artifact.sh stages; the script `cp`s these, so a
      // fixture without them fails at staging and proves nothing about stamps.
      put(work, 'package.json', '{"name":"identity-fixture","version":"0.0.0"}\n');
      put(work, 'package-lock.json', '{}\n');
      put(work, 'next.config.js', 'module.exports = {};\n');
      put(work, 'server.js', '\n');
      put(work, 'server-bootstrap.js', '\n');
      put(work, '.htaccess', '\n');
      put(work, 'public/.keep', '\n');
      put(work, 'prisma/.keep', '\n');
      put(work, '.next/BUILD_ID', 'placeholder\n');
      put(work, '.gitignore', '.next/\ntmp/\n.deploy-stage/\ndeploy-bundle.tar.gz\n');
      // A packer who reintroduced a pre-build identity: the row names an id and
      // a commit that have nothing to do with this build.
      put(
        work,
        'docs/hostatom-live.md',
        [
          HEADER,
          SEPARATOR,
          '| Nov 24, 2026 | `deadbee` on `release` | `AuthoredBefore_999` | **1.2.6 — prepared.** Filled in by hand, wrongly. |',
          '',
        ].join('\n'),
      );
      put(work, 'src/data/patch-notes.json', '[]\n');
      put(work, 'scripts/deploy-artifact.sh', read('scripts/deploy-artifact.sh'));
      git(work, 'add', '-A');
      git(work, 'commit', '-q', '-m', 'release: identity fixture');

      const releaseSha = git(work, 'rev-parse', 'HEAD').trim();
      // The build's own stamps, produced AFTER the commit — the order a real
      // build has. GIT_SHA names the commit the bytes came from.
      const buildId = 'identity-selftest-1';
      put(work, '.next/BUILD_ID', `${buildId}\n`);
      put(work, '.next/GIT_SHA', `${releaseSha}\n`);
      expect(existsSync(join(work, 'tmp', 'release-stamp.txt'))).toBe(false);

      const r = spawnSync('bash', [join(work, 'scripts', 'deploy-artifact.sh')], {
        cwd: work,
        encoding: 'utf8',
        env: {
          ...GIT_ENV,
          SKIP_BUILD: '1',
          DRY_RUN: '1', // no push: this suite is about the stamp file
          ARTIFACT_BRANCH: 'deploy-artifact',
          SITE_URL: 'http://127.0.0.1:9',
          NK_ALLOW_NO_SWEEP_CALLER: '1', // D10 owns the preflight itself
        },
      });
      const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
      expect(r.status, `deploy-artifact.sh failed:\n${out}`).toBe(0);

      const stamp = readFileSync(join(work, 'tmp', 'release-stamp.txt'), 'utf8');
      expect(stamp).toBe(`BUILD_ID=${buildId}\nGIT_SHA=${releaseSha}\nHEAD=${releaseSha}\n`);

      // The doc said otherwise; the pack is the owner and did not follow it.
      expect(stamp).not.toContain('AuthoredBefore_999');
      expect(stamp).not.toContain('deadbee');

      // The pair the operator is told to re-pin task 250 to is the same pair,
      // literally — a printed id that differs from the file is its own bug.
      expect(out).toContain(`BUILD_ID=${buildId}  GIT_SHA=${releaseSha}`);

      // Writing the stamp must not turn the certified worktree into a dirty one.
      expect(git(work, 'status', '--porcelain').trim()).toBe('');
    },
  );
});
