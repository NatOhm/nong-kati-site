import { NextRequest, NextResponse } from 'next/server';

import { writeAuditLog } from '@/lib/auditLog';
import { getAdminToken } from '@/lib/adminRequest';
import { getSlip2GoAccountInfo } from '@/lib/payment/slip2go';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/settings/slip-account (settings:write)
 *
 * One-click Slip2Go account-info probe — the no-purchase connectivity check
 * adapted from the merchant dashboard's REST API example (which ships with
 * broken syntax; this is the corrected, environment-driven form). It calls
 * the documented read-only `GET {base}/api/account/info` to answer two
 * questions and nothing else:
 *
 *   1. does the configured secret authenticate (and under which scheme —
 *      raw per the public guide, `Bearer` per the dashboard examples), and
 *   2. how much API quota / credit is left?
 *
 * It does NOT establish that slip verification, amount/receiver matching,
 * duplicate detection, or production checkout works — a real slip through
 * the customer flow is still required for that. The call is informational
 * per the docs: no verification credit is spent, no order is touched.
 *
 * The secret never appears in the request, the response, or the audit log —
 * only the boolean "it is configured", the outcome, and the auth scheme.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = getAdminToken(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const result = await getSlip2GoAccountInfo();

  await writeAuditLog({
    actorType: 'admin',
    actorId: check.payload?.sub ?? 'unknown',
    actorEmail: check.payload?.email ?? 'unknown',
    action: 'settings.slip_account_probe',
    tableName: 'SiteSetting',
    recordId: 'payments',
    diff: null,
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    metadata: {
      configured: result.ok ? true : result.code !== 'NOT_CONFIGURED',
      ok: result.ok,
      error: result.ok ? null : result.code,
      authScheme: result.ok ? result.authScheme : null,
      tokenRemaining: result.ok ? result.account.tokenRemaining : null,
    },
  });

  return NextResponse.json(result, { status: 200 });
}
