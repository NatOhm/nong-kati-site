import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/version — public, non-secret release identity
 * (production roadmap §5: "Add a safe /api/version endpoint containing the
 * Git SHA"). Deliberately minimal: SHA + ref + deploy time only — the full
 * migration/RLS diagnostics live behind auth at
 * /api/v1/internal/build-info. Cache-busted so the answer is always the
 * running build's.
 */
export async function GET(): Promise<NextResponse> {
  const gitSha = process.env['GIT_SHA'] ?? process.env['VERCEL_GIT_COMMIT_SHA'] ?? 'unknown';
  const gitRef = process.env['VERCEL_GIT_COMMIT_REF'] ?? 'unknown';

  return NextResponse.json({ gitSha, gitRef }, { headers: { 'Cache-Control': 'no-store' } });
}
