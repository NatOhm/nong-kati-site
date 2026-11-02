// Stamps the commit a build was made from into .next/GIT_SHA, right after
// `next build`. /api/v1/version reads that file (like .next/BUILD_ID) so it
// reports the SHA of the code actually serving requests — the GIT_SHA env var
// in Plesk/Infisical goes stale because no deploy step updates it, which is
// exactly the lie this file removes.
//
// Skipped (with a warning, not a failure) when there is no git context: the
// app is built in places without .git (BUILD=server on the host), and the
// route degrades to the env var in that case.
//
// DIRTY TREES STAMP `<sha>-dirty` (2026-10-27). `next build` compiles the
// working-tree bytes, not HEAD, so stamping a bare SHA onto an uncommitted
// build names a commit that does NOT contain the code being shipped. That is
// not hypothetical: production reported `dbe8acd` while serving `b057e55`'s
// routes (internal/settings/slip-retention answered 401 but the file does not
// exist at dbe8acd), and the runbook tells operators to verify a deploy by
// comparing gitSha. `.verify-bundle.ps1` refuses `-dirty`, so this stays a
// loud warning rather than a build failure — you can keep editing, you just
// cannot silently ship a build nobody can name.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

if (!existsSync('.next/BUILD_ID')) {
  console.error('stamp-git-sha: no .next/BUILD_ID — run `next build` first.');
  process.exit(1);
}

let dirty = false;
let stamped = null;
let count = null;

// Each stamp reports on its own. One shared try/catch meant a missing
// package.json printed "falls back to env GIT_SHA" (untrue — GIT_SHA was
// already written) and skipped the dirty-tree warning entirely, so a build
// could ship uncommitted code with no warning at all.
try {
  const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error(`unrecognised sha: ${sha}`);

  // Untracked files count: `next build` can compile a new route file that is
  // not in any commit yet, which is the same lie under a different name.
  dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
  stamped = dirty ? `${sha}-dirty` : sha;

  writeFileSync('.next/GIT_SHA', stamped);
} catch (err) {
  console.warn(`stamp-git-sha: GIT_SHA not stamped (${err.message.trim()}) — /api/v1/version falls back to env GIT_SHA`);
}

try {
  // HUMAN-FACING RELEASE NUMBER (2026-10-29, client ask): the commit count.
  // The Next build id is a random 21-char string nobody can read aloud, so
  // the admin UI shows this instead — monotonic, never resets, and identical
  // for two builds of the same commit (which is the truth: same code).
  // -dirty rides on GIT_SHA, so the number stays a plain integer here.
  const raw = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim();
  if (!/^\d+$/.test(raw)) throw new Error(`unrecognised commit count: ${raw}`);
  count = raw;
  writeFileSync('.next/BUILD_NUMBER', `${count}\n`);
} catch (err) {
  console.warn(`stamp-git-sha: BUILD_NUMBER not stamped (${err.message.trim()}) — the badge falls back to the build id`);
}

try {
  // HUMAN-FACING VERSION (2026-11-02, client ask): package.json is the ONE
  // source — a person picks MAJOR.MINOR.PATCH before the build, the artifact
  // carries it, and /api/v1/version reads it off disk. Same rule as GIT_SHA: a
  // value read from the shipped bundle cannot go stale the way a panel env var
  // does. A junk version stamps nothing (route + badge fall back to the commit
  // count) instead of shipping "1.1" as if it were a release.
  const pkgVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
  if (typeof pkgVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(pkgVersion)) {
    throw new Error(`package.json version ${JSON.stringify(pkgVersion)} is not MAJOR.MINOR.PATCH`);
  }
  writeFileSync('.next/VERSION', `${pkgVersion}\n`);
} catch (err) {
  console.warn(`stamp-git-sha: VERSION not stamped (${err.message.trim()}) — the badge shows the commit count`);
}

if (dirty) {
  console.warn(`stamp-git-sha: WORKING TREE DIRTY — .next/GIT_SHA = ${stamped}`);
  console.warn(
    'stamp-git-sha: this build contains changes that are not in that commit. Commit, then rebuild. .verify-bundle.ps1 will refuse to pack it.',
  );
} else if (stamped) {
  console.log(`stamp-git-sha: .next/GIT_SHA = ${stamped} · .next/BUILD_NUMBER = ${count}`);
}
