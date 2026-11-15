/**
 * The deploy-artifact → post-switch-gate path, rehearsed offline (2026-11-15).
 *
 * Publishing a release is a force-push to the orphan `deploy-artifact` branch,
 * and CI learns "a release was sent" only from that commit's subject. Three
 * things about that path break on GitHub and nowhere else:
 *
 *   1. a `push` workflow only starts when its own file is in the pushed tree,
 *   2. the gate must run from the release commit the subject names — this repo's
 *      default branch can lag the release branch, so the gate script may not
 *      even exist there,
 *   3. every failure mode must EXIT NON-ZERO and name what it could not do:
 *      a gate that skips itself looks exactly like a certified release.
 *
 * Until now that was proven by a scratch harness in `tmp/` and by hand against
 * production, so nothing stopped the workflow from regressing silently. This
 * file is that harness, committed. It builds a throwaway git fixture (a bare
 * remote, plus a clone whose `master` lacks the scripts and whose `release`
 * commit has them), publishes with the REAL `scripts/deploy-artifact.sh`,
 * replays the workflow's git steps, and runs the REAL
 * `scripts/ci-postswitch-gate.sh` against a local HTTP stub standing in for the
 * live site. No network, no database, no credentials.
 *
 * Deliberately NOT covered: `scripts/postswitch-check.mjs` itself (22 checks
 * that need a real database — docs/db-migration-hostatom-mariadb.md covers that
 * against the copy), and the SSH-tunnel branch, which needs a real host.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'artifact-selftest',
  GIT_AUTHOR_EMAIL: 'artifact-selftest@example.invalid',
  GIT_COMMITTER_NAME: 'artifact-selftest',
  GIT_COMMITTER_EMAIL: 'artifact-selftest@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
};

/** `bash` is what both scripts are written in; CI has it, a bare Windows shell may not. */
const HAS_BASH = spawnSync('bash', ['-c', 'exit 0'], { encoding: 'utf8' }).status === 0;

const sandboxes: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV });
}

/** Git that is allowed to fail — used to assert an absence. */
function gitOk(cwd: string, ...args: string[]): boolean {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV });
  return r.status === 0;
}

function put(dir: string, relPath: string, content: string): void {
  const full = join(dir, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function copyInto(dir: string, relPath: string, source: string): void {
  const full = join(dir, relPath);
  mkdirSync(dirname(full), { recursive: true });
  copyFileSync(source, full);
}

interface Fixture {
  /** The clone the workflow shapes its steps in. */
  work: string;
  /** `file://` URL of the bare repo standing in for GitHub. */
  remote: string;
  /** The commit the artifact subject names. */
  releaseSha: string;
  defaultBranch: string;
}

/**
 * A repo shaped like the two branches that matter: `master` (no gate scripts,
 * so running there would fail) and `release` (the shipped scripts, plus the
 * files `deploy-artifact.sh` stages into the bundle).
 */
function makeFixture(): Fixture {
  const base = mkdtempSync(join(tmpdir(), 'nk-artifact-'));
  sandboxes.push(base);
  const remotePath = join(base, 'remote.git');
  const work = join(base, 'work');

  git(base, 'init', '--bare', '-q', remotePath);
  git(base, 'init', '-q', work);
  git(work, 'symbolic-ref', 'HEAD', 'refs/heads/master');

  put(work, 'README.md', '# fixture\n');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'default branch without the gate scripts');
  git(work, 'checkout', '-q', '-b', 'release');

  // The release commit: the real scripts, because the gate that ships is the
  // gate that must be rehearsed. Everything else is a stand-in for the staged
  // bundle so deploy-artifact.sh can run without a Next build.
  for (const script of ['ci-postswitch-gate.sh', 'wait-for-build.mjs', 'deploy-artifact.sh']) {
    copyInto(work, `scripts/${script}`, join(REPO, 'scripts', script));
  }
  copyInto(
    work,
    '.github/workflows/postswitch-gate.yml',
    join(REPO, '.github', 'workflows', 'postswitch-gate.yml'),
  );
  put(work, 'package.json', '{"name":"artifact-fixture","version":"0.0.0"}\n');
  put(work, 'package-lock.json', '{}\n');
  put(work, 'next.config.js', 'module.exports = {};\n');
  put(work, 'server.js', '\n');
  put(work, 'server-bootstrap.js', '\n');
  put(work, '.htaccess', '\n');
  put(work, 'public/.keep', '\n');
  put(work, 'prisma/.keep', '\n');
  put(work, '.next/BUILD_ID', 'fixture-placeholder\n');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'release: ship the post-switch gate');

  const releaseSha = git(work, 'rev-parse', 'HEAD').trim();
  // deploy-artifact.sh reads this stamp off disk and refuses anything that is
  // not a 40-hex commit id. Written after the commit so it can name that commit.
  put(work, '.next/GIT_SHA', `${releaseSha}\n`);

  git(work, 'remote', 'add', 'origin', pathToFileURL(remotePath).href);
  git(work, 'push', '-q', 'origin', 'master', 'release');
  git(work, 'fetch', '-q', 'origin');

  return { work, remote: pathToFileURL(remotePath).href, releaseSha, defaultBranch: 'master' };
}

interface Published {
  sha: string;
  subject: string;
}

/** Publish with the real script, exactly as a release would. */
function publish(f: Fixture, buildId: string): Published {
  put(f.work, '.next/BUILD_ID', `${buildId}\n`);
  const r = spawnSync('bash', [join(f.work, 'scripts', 'deploy-artifact.sh')], {
    cwd: f.work,
    encoding: 'utf8',
    env: {
      ...GIT_ENV,
      SKIP_BUILD: '1',
      // REMOTE stays at its default (`origin`, the fixture's bare repo) so the
      // push updates the same remote-tracking ref a real release would.
      ARTIFACT_BRANCH: 'deploy-artifact',
      SITE_URL: 'http://127.0.0.1:9',
    },
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  expect(r.status, `deploy-artifact.sh failed:\n${out}`).toBe(0);
  return {
    sha: git(f.work, 'rev-parse', 'origin/deploy-artifact').trim(),
    subject: git(f.work, 'log', '-1', '--format=%s', 'origin/deploy-artifact').trim(),
  };
}

/**
 * The workflow's git steps, in its own order: fetch the artifact branch, parse
 * the subject, check out the source commit it names.
 */
function emulateWorkflow(f: Fixture): { sha: string; buildId: string; checkedOut: boolean } {
  git(f.work, 'checkout', '-q', '--force', f.defaultBranch);
  if (!gitOk(f.work, 'fetch', '-q', '--depth=1', 'origin', 'deploy-artifact')) {
    return { sha: '', buildId: '', checkedOut: false };
  }
  const subject = git(f.work, 'log', '-1', '--format=%s', 'FETCH_HEAD').trim();
  const match = /^deploy bundle ([^ ]+) \(git ([0-9a-f]{40})\)$/.exec(subject);
  if (!match) return { sha: '', buildId: '', checkedOut: false };
  const checkedOut = gitOk(f.work, 'checkout', '-q', '--force', match[2]!);
  return { sha: match[2]!, buildId: match[1]!, checkedOut };
}

/**
 * Spawned asynchronously on purpose: the gate polls the stub site, and a
 * synchronous spawn would block this worker's event loop — the server lives in
 * the same process, so every attempt would time out.
 */
function runGate(f: Fixture, args: string[]): Promise<{ code: number; out: string }> {
  const env: NodeJS.ProcessEnv = { ...GIT_ENV };
  delete env['EXPECTED_BUILD_ID'];
  delete env['POSTSWITCH_TARGET_DATABASE_URL'];
  delete env['PLESK_SSH_KEY'];
  return new Promise((resolve) => {
    const child = spawn('bash', [join(f.work, 'scripts', 'ci-postswitch-gate.sh'), ...args], {
      cwd: f.work,
      env,
    });
    let out = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      out += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      out += chunk;
    });
    child.on('close', (code) => resolve({ code: code ?? -1, out }));
  });
}

let served = '';
let site: Server;
let base = '';

beforeAll(async () => {
  site = createServer((req, res) => {
    if ((req.url ?? '').startsWith('/api/v1/version')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ buildId: served }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => site.close(() => resolve()));
  for (const dir of sandboxes) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* sandbox cleanup is best-effort (Windows keeps handles) */
    }
  }
});

describe.skipIf(!HAS_BASH)('deploy-artifact → post-switch gate, offline', () => {
  it(
    'publishes only the bundle plus the workflow, under a parseable subject',
    { timeout: 60_000 },
    () => {
      const f = makeFixture();
      const buildId = 'selftest-bundle-1';
      const published = publish(f, buildId);

      expect(published.subject).toBe(`deploy bundle ${buildId} (git ${f.releaseSha})`);
      expect(
        git(f.work, 'ls-tree', '-r', '--name-only', published.sha).trim().split('\n').sort(),
      ).toEqual(['.github/workflows/postswitch-gate.yml', 'deploy-bundle.tar.gz']);
    },
  );

  it(
    'runs the gate from the release commit, not from a default branch without it',
    { timeout: 60_000 },
    () => {
      const f = makeFixture();
      expect(
        gitOk(f.work, 'cat-file', '-e', `origin/${f.defaultBranch}:scripts/ci-postswitch-gate.sh`),
        'the fixture is pointless unless the default branch genuinely lacks the script',
      ).toBe(false);

      publish(f, 'selftest-tree-1');
      const run = emulateWorkflow(f);

      expect(run.checkedOut).toBe(true);
      expect(run.buildId).toBe('selftest-tree-1');
      expect(run.sha).toBe(f.releaseSha);
      expect(git(f.work, 'rev-parse', 'HEAD').trim()).toBe(f.releaseSha);
      expect(existsSync(join(f.work, 'scripts', 'ci-postswitch-gate.sh'))).toBe(true);
    },
  );

  it('certifies a release the site is actually serving (exit 0)', { timeout: 60_000 }, async () => {
    const f = makeFixture();
    publish(f, 'selftest-live-1');
    emulateWorkflow(f);
    served = 'selftest-live-1';

    const gate = await runGate(f, [`--base=${base}`, '--check-only', '--timeout=20']);

    expect(gate.code, gate.out).toBe(0);
    expect(gate.out).toContain('is live at');
    expect(gate.out).toContain('check-only');
  });

  it(
    'fails a release the site never served, and names the build (exit 1)',
    { timeout: 60_000 },
    async () => {
      const f = makeFixture();
      publish(f, 'selftest-never-served');
      emulateWorkflow(f);
      served = 'selftest-still-older';

      const gate = await runGate(f, [`--base=${base}`, '--check-only', '--timeout=2']);

      expect(gate.code, gate.out).toBe(1);
      expect(gate.out).toContain('never went live');
      expect(gate.out).toContain('selftest-never-served');
      expect(gate.out).toContain('the artifact is published but the site never served it');
      expect(gate.out).toContain('deploy-artifact');
    },
  );

  it(
    'refuses to guess when there is no artifact ref at all (exit 2)',
    { timeout: 60_000 },
    async () => {
      const f = makeFixture();
      publish(f, 'selftest-absent-1');
      // A runner starts clean, so remove the ref on both ends: the push is gone
      // and this clone must not keep resolving a branch that no longer exists.
      git(f.work, 'push', '-q', 'origin', '--delete', 'deploy-artifact');
      git(f.work, 'update-ref', '-d', 'refs/remotes/origin/deploy-artifact');
      git(f.work, 'checkout', '-q', '--force', f.releaseSha);

      const gate = await runGate(f, [`--base=${base}`, '--check-only', '--timeout=5']);

      expect(gate.code, gate.out).toBe(2);
      expect(gate.out).toContain('cannot determine which BUILD_ID to certify');
      expect(gate.out).toContain('deploy-artifact');
    },
  );

  it(
    'will not certify without the database, and never claims it did',
    { timeout: 60_000 },
    async () => {
      const f = makeFixture();
      publish(f, 'selftest-nodb-1');
      emulateWorkflow(f);
      served = 'selftest-nodb-1';

      const gate = await runGate(f, [`--base=${base}`, '--timeout=20']);

      expect(gate.code, gate.out).toBe(2);
      expect(gate.out).toContain('POSTSWITCH_TARGET_DATABASE_URL is not set');
      expect(gate.out).not.toContain('certified at');
    },
  );
});
