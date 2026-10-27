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
import { existsSync, writeFileSync } from 'node:fs';

if (!existsSync('.next/BUILD_ID')) {
  console.error('stamp-git-sha: no .next/BUILD_ID — run `next build` first.');
  process.exit(1);
}

try {
  const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error(`unrecognised sha: ${sha}`);

  // Untracked files count: `next build` can compile a new route file that is
  // not in any commit yet, which is the same lie under a different name.
  const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
  const stamped = dirty ? `${sha}-dirty` : sha;

  writeFileSync('.next/GIT_SHA', stamped);
  if (dirty) {
    console.warn(`stamp-git-sha: WORKING TREE DIRTY — .next/GIT_SHA = ${stamped}`);
    console.warn(
      'stamp-git-sha: this build contains changes that are not in that commit. Commit, then rebuild. .verify-bundle.ps1 will refuse to pack it.',
    );
  } else {
    console.log(`stamp-git-sha: .next/GIT_SHA = ${stamped}`);
  }
} catch (err) {
  console.warn(`stamp-git-sha: skipped (${err.message.trim()}) — /api/v1/version falls back to env GIT_SHA`);
}
