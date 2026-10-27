/**
 * Build provenance stamp (audit finding 1, 2026-10-27).
 *
 * `next build` compiles the WORKING TREE, but the old stamp wrote a bare
 * `git rev-parse HEAD`. Building before committing therefore stamped an old
 * commit onto newer code — which is how production came to report `dbe8acd`
 * while serving `b057e55`'s routes (internal/settings/slip-retention answered
 * 401, but the file does not exist at dbe8acd).
 *
 * Under test, by running the real script in a throwaway git repo:
 *   1. a clean tree stamps the full commit SHA and exits 0;
 *   2. a modified tracked file stamps `<sha>-dirty` and STILL exits 0 — the
 *      dirty path is a loud warning, not a build failure (the refusal lives in
 *      .verify-bundle.ps1, so a build you are still editing can carry on);
 *   3. an untracked file also counts as dirty, because `next build` can compile
 *      a new route that is not in any commit yet;
 *   4. no `.next/BUILD_ID` still exits 1 (must run `next build` first).
 *
 * The sandbox writes its own `.gitignore` with `.next/` in it, mirroring the
 * real repo — otherwise BUILD_ID itself would be untracked and every build
 * would stamp `-dirty`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../scripts/stamp-git-sha.mjs', import.meta.url));
const SHA_RE = /^[0-9a-f]{40}$/;

const sandboxes: string[] = [];

/** Git in a sandbox, with identity injected (global config may be unset). */
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'stamp-test',
      GIT_AUTHOR_EMAIL: 'stamp-test@example.invalid',
      GIT_COMMITTER_NAME: 'stamp-test',
      GIT_COMMITTER_EMAIL: 'stamp-test@example.invalid',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
}

/**
 * Run the real script against `cwd`. Captures stdout AND stderr as one blob:
 * the dirty-tree warning is a `console.warn` (stderr), so reading only the
 * returned stdout would hide the very message under test.
 */
function stamp(cwd: string): { code: number; out: string } {
  const r = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });
  return {
    code: r.status ?? -1,
    out: `${r.stdout ?? ''}${r.stderr ?? ''}`,
  };
}

/** A repo shaped like the real one: committed sources, `.next/` ignored. */
function makeRepo(withBuildId: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'nk-stamp-'));
  sandboxes.push(dir);
  git(dir, 'init', '-q');
  writeFileSync(join(dir, '.gitignore'), '.next/\nnode_modules/\n');
  writeFileSync(join(dir, 'index.ts'), 'export {};\n');
  if (withBuildId) {
    mkdirSync(join(dir, '.next'), { recursive: true });
    writeFileSync(join(dir, '.next', 'BUILD_ID'), 'TESTBUILDID\n');
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'sandbox');
  return dir;
}

function readStamp(dir: string): string {
  return readFileSync(join(dir, '.next', 'GIT_SHA'), 'utf8').trim();
}

afterAll(() => {
  for (const dir of sandboxes) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* sandbox cleanup is best-effort */
    }
  }
});

describe('stamp-git-sha', () => {
  it('stamps the full commit SHA on a clean tree and exits 0', () => {
    const dir = makeRepo(true);
    const head = git(dir, 'rev-parse', 'HEAD').trim();
    expect(SHA_RE.test(head)).toBe(true);

    const r = stamp(dir);

    expect(r.code).toBe(0);
    expect(readStamp(dir)).toBe(head);
    expect(r.out).not.toContain('DIRTY');
  });

  it('stamps <sha>-dirty when a tracked file changed, and still exits 0', () => {
    const dir = makeRepo(true);
    const head = git(dir, 'rev-parse', 'HEAD').trim();

    writeFileSync(join(dir, 'index.ts'), 'export const changed = 1;\n');
    const r = stamp(dir);

    expect(r.code).toBe(0);
    expect(readStamp(dir)).toBe(`${head}-dirty`);
    expect(r.out).toContain('DIRTY');
    // The warning must say what to do, not just that something is wrong.
    expect(r.out).toContain('Commit, then rebuild');
  });

  it('treats an untracked file as dirty (build may compile it)', () => {
    const dir = makeRepo(true);
    const head = git(dir, 'rev-parse', 'HEAD').trim();

    writeFileSync(join(dir, 'brand-new-route.ts'), 'export {};\n');
    const r = stamp(dir);

    expect(r.code).toBe(0);
    expect(readStamp(dir)).toBe(`${head}-dirty`);
  });

  it('refuses to stamp without .next/BUILD_ID (exit 1)', () => {
    const dir = makeRepo(false);
    expect(existsSync(join(dir, '.next', 'BUILD_ID'))).toBe(false);

    const r = stamp(dir);

    expect(r.code).toBe(1);
    expect(existsSync(join(dir, '.next', 'GIT_SHA'))).toBe(false);
  });
});
