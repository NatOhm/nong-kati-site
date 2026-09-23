import { NextResponse } from 'next/server';

import { isProviderConfigured } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/auth/oauth — which social providers are configured.
 * The login page renders buttons only for enabled providers.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    providers: (['google', 'line'] as const).filter((p) => isProviderConfigured(p)),
  });
}
