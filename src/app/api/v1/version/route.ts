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
 * `gitSha`/`gitRef` are kept for backward compatibility with the documented
 * response shape and with the deploy runbook's expectations. They are only
 * reported when the environment supplies them; we never let them shadow the
 * buildId, because a human-set env var and the code actually serving
 * requests can disagree.
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

export async function GET(): Promise<NextResponse> {
  const buildId = await readBuildId();

  const gitSha = process.env['GIT_SHA'] ?? process.env['VERCEL_GIT_COMMIT_SHA'];
  const gitRef = process.env['VERCEL_GIT_COMMIT_REF'];

  return NextResponse.json(
    {
      buildId,
      // Retained fields: same names as before, but 'unknown' rather than a
      // value we cannot verify. Prefer `buildId` when checking what is live.
      gitSha: gitSha ?? 'unknown',
      gitRef: gitRef ?? 'unknown',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}