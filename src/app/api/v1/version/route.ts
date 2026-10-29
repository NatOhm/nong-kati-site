import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/version — public, non-secret release identity
 * (production roadmap §5: "Add a safe /api/version endpoint containing the
 * Git SHA"). Deliberately minimal: build identity + ref only — the full
 * migration/RLS diagnostics live behind auth at
 * /api/v1/internal/build-info. Cache-busted so the answer is always the
 * running build's.
 *
 * `buildId` is the SOURCE OF TRUTH: Next.js writes .next/BUILD_ID during the
 * build and the deploy artifact ships that whole directory, so it is read
 * straight off the running deployment's disk. It cannot go stale the way an
 * injected env var can — the whole reason this endpoint used to lie was that
 * GIT_SHA lived in Infisical, which no deploy step updates.
 *
 * `gitSha` now follows the same rule: the deploy scripts stamp
 * `git rev-parse HEAD` into .next/GIT_SHA as they bundle, and the artifact
 * ships it next to BUILD_ID, so it names the commit the running build was
 * made from. The GIT_SHA / VERCEL_GIT_COMMIT_SHA env vars remain only as a
 * fallback for paths that build without stamping (CI's browser smoke, a
 * local `next start`) — the disk stamp always wins when present.
 */

/**
 * Next.js build IDs are 21-char base64url-ish random strings. Treat anything
 * else (empty, a stray newline-only file, an HTML error page from a failed
 * extraction) as "no buildId" rather than reporting it as the release id.
 */
const BUILD_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

async function readBuildId(): Promise<string | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8');
    const trimmed = raw.trim();
    return BUILD_ID_RE.test(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Same shape-check philosophy as BUILD_ID: the stamp is written by our own
 * bundle scripts, but a junk value (empty file, an error page from a broken
 * extraction) must degrade to "not stamped" rather than become a fake sha.
 *
 * `-dirty` IS a valid stamp (2026-10-27). stamp-git-sha.mjs appends it when
 * the working tree had uncommitted changes, because `next build` compiled the
 * working tree rather than HEAD. Accepting only bare SHAs here would make the
 * route REJECT the honest stamp and fall back to the stale env echo — which is
 * precisely the lie this endpoint exists to remove, reintroduced one line
 * below. `.verify-bundle.ps1` refuses `-dirty`, so a dirty build should never
 * reach production; if it does, this endpoint must SAY so.
 */
const GIT_SHA_RE = /^[0-9a-f]{7,40}(-dirty)?$/i;

async function readStampedGitSha(): Promise<string | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), '.next', 'GIT_SHA'), 'utf8');
    const trimmed = raw.trim();
    return GIT_SHA_RE.test(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * The human-facing release number (client ask 2026-10-29): stamp-git-sha.mjs
 * writes `git rev-list --count HEAD` into .next/BUILD_NUMBER so the admin UI
 * can show a number an operator can read aloud instead of the random build id.
 *
 * Same shape-check philosophy as the other two files: a junk value (empty
 * file, an HTML error page from a broken extraction) or no file at all
 * degrades to null, and the UI then falls back to the raw build id.
 */
const BUILD_NUMBER_RE = /^\d{1,9}$/;

async function readBuildNumber(): Promise<number | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), '.next', 'BUILD_NUMBER'), 'utf8');
    const trimmed = raw.trim();
    return BUILD_NUMBER_RE.test(trimmed) ? Number(trimmed) : null;
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse> {
  const buildId = await readBuildId();

  // The stamped file ships inside the build artifact, so it names the commit
  // this build was actually made from; env vars are hand-maintained echoes.
  const gitSha =
    (await readStampedGitSha()) ?? process.env['GIT_SHA'] ?? process.env['VERCEL_GIT_COMMIT_SHA'];
  const gitRef = process.env['VERCEL_GIT_COMMIT_REF'];

  return NextResponse.json(
    {
      buildId,
      // Monotonic release number for display; null until a stamped build ships it.
      buildNumber: await readBuildNumber(),
      // Retained fields: same names as before, but 'unknown' rather than a
      // value we cannot verify. Prefer `buildId` when checking what is live.
      gitSha: gitSha ?? 'unknown',
      gitRef: gitRef ?? 'unknown',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}