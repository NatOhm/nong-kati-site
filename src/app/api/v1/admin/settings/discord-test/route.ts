import { NextRequest, NextResponse } from 'next/server';

import { writeAuditLog } from '@/lib/auditLog';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { sendTestDiscordMessage } from '@/lib/notify';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
}

/**
 * POST /api/v1/admin/settings/discord-test (settings:write)
 *
 * Sends a one-off test embed to the webhook configured in the environment
 * (NK_DISCORD_WEBHOOK_URL) so an admin can confirm the setup in one click
 * from the notifications settings page. Unlike the production notifications
 * (fire-and-forget), this route REPORTS the outcome: not configured,
 * rejected by Discord (with its status), or unreachable.
 *
 * The webhook URL is an environment secret and never appears in the request,
 * the response, or the audit log — only the boolean "it is configured" and
 * the delivery outcome are recorded.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const result = await sendTestDiscordMessage();

  // Audit the attempt (success or failure) — who tested, what happened.
  // No URL, no token: the metadata carries the outcome only.
  await writeAuditLog({
    actorType: 'admin',
    actorId: check.payload?.sub ?? 'unknown',
    actorEmail: check.payload?.email ?? 'unknown',
    action: 'settings.discord_test',
    tableName: 'SiteSetting',
    recordId: 'notifications',
    diff: null,
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    metadata: {
      configured: result.error !== 'WEBHOOK_NOT_CONFIGURED',
      ok: result.ok,
      status: result.status ?? null,
      error: result.error ?? null,
    },
  });

  return NextResponse.json(result, { status: 200 });
}
