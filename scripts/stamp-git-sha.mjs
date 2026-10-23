// Stamps the commit a build was made from into .next/GIT_SHA, right after
// `next build`. /api/v1/version reads that file (like .next/BUILD_ID) so it
// reports the SHA of the code actually serving requests — the GIT_SHA env var
// in Plesk/Infisical goes stale because no deploy step updates it, which is
// exactly the lie this file removes.
//
// Skipped (with a warning, not a failure) when there is no git context: the
// app is built in places without .git (BUILD=server on the host), and the
// route degrades to the env var in that case.
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

if (!existsSync('.next/BUILD_ID')) {
  console.error('stamp-git-sha: no .next/BUILD_ID — run `next build` first.');
  process.exit(1);
}

try {
  const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error(`unrecognised sha: ${sha}`);
  writeFileSync('.next/GIT_SHA', sha);
  console.log(`stamp-git-sha: .next/GIT_SHA = ${sha}`);
} catch (err) {
  console.warn(`stamp-git-sha: skipped (${err.message.trim()}) — /api/v1/version falls back to env GIT_SHA`);
}
