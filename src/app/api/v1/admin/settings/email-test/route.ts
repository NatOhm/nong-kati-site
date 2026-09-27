import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { writeAuditLog } from '@/lib/auditLog';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { probeSmtp, type SmtpProbeResult } from '@/lib/email/smtpProbe';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
}

function clientIp(req: NextRequest): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

/** Hostnames that must never be probed, even outside production. */
const BANNED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'metadata.google.internal',
]);

function validHost(host: string): boolean {
  return (
    host.length > 0 &&
    host.length <= 253 &&
    !BANNED_HOSTS.has(host.toLowerCase()) &&
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host)
  );
}

/**
 * POST /api/v1/admin/settings/email-test (settings:write)
 *
 * Runs the SMTP connectivity probe (DNS → TCP → 220 greeting → EHLO) against
 * either the values currently typed into the settings form (body override —
 * lets an admin test BEFORE saving) or the saved `email` settings group.
 *
 * No message is sent, no credentials are transmitted, no state changes.
 * The probe itself enforces the SSRF guard (private/loopback targets are
 * rejected in production); this route additionally bans literal localhost
 * names and validates the shape of every field. The attempt is audit-logged
 * with the per-step outcome (never the credential env-var VALUE — only its
 * name, which is what the DB stores anyway).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  // Body is optional: absent → probe the saved settings.
  let body: Record<string, unknown> = {};
  const raw = await req.text();
  if (raw.trim() !== '') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
    }
  }

  // Resolve host/port/user/passwordEnv: form override first, saved settings
  // second. Same shape rules as the PUT validator on the email group.
  let host: string | null = null;
  let port: number | null = null;
  let user: string | null = null;
  let passwordEnv: string | null = null;

  if (typeof body['smtpHost'] === 'string' && body['smtpHost'].trim() !== '') {
    host = body['smtpHost'].trim().slice(0, 253);
    if (!validHost(host)) {
      return NextResponse.json({ error: 'INVALID_SMTP_HOST' }, { status: 400 });
    }
  }
  if (body['smtpPort'] !== undefined) {
    const p = Number(body['smtpPort']);
    if (!Number.isInteger(p) || p < 1 || p > 65535) {
      return NextResponse.json({ error: 'INVALID_SMTP_PORT' }, { status: 400 });
    }
    port = p;
  }
  if (typeof body['smtpUser'] === 'string' && body['smtpUser'].trim() !== '') {
    user = body['smtpUser'].trim().slice(0, 120);
  }
  if (typeof body['smtpPasswordEnv'] === 'string' && body['smtpPasswordEnv'].trim() !== '') {
    passwordEnv = body['smtpPasswordEnv'].trim();
    if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(passwordEnv)) {
      return NextResponse.json({ error: 'INVALID_ENV_VAR_NAME' }, { status: 400 });
    }
  }

  if (host === null || port === null) {
    const row = await prisma.siteSetting.findUnique({ where: { key: 'email' } });
    if (row) {
      try {
        const saved = JSON.parse(row.value) as Record<string, unknown>;
        if (host === null && typeof saved['smtpHost'] === 'string') host = saved['smtpHost'];
        if (port === null && typeof saved['smtpPort'] === 'number') port = saved['smtpPort'];
        if (user === null && typeof saved['smtpUser'] === 'string') user = saved['smtpUser'];
        if (
          passwordEnv === null &&
          typeof saved['smtpPasswordEnv'] === 'string' &&
          saved['smtpPasswordEnv'] !== ''
        ) {
          passwordEnv = saved['smtpPasswordEnv'];
        }
      } catch {
        // corrupt row — fall through to the missing-field error
      }
    }
  }

  if (!host || !port) {
    return NextResponse.json(
      { error: 'SMTP_NOT_CONFIGURED', detail: 'กรอก SMTP Host และ Port ก่อนทดสอบ' },
      { status: 400 },
    );
  }
  if (!validHost(host)) {
    return NextResponse.json({ error: 'INVALID_SMTP_HOST' }, { status: 400 });
  }

  const result: SmtpProbeResult = await probeSmtp({ host, port, user, passwordEnv });

  // Audit the ATTEMPT (success or failure) — actor, target, per-step outcome.
  // Credentials are never logged: the DB stores only the env-var NAME.
  await writeAuditLog({
    actorType: 'admin',
    actorId: check.payload?.sub ?? 'unknown',
    actorEmail: check.payload?.email ?? 'unknown',
    action: 'settings.email_test',
    tableName: 'SiteSetting',
    recordId: 'email',
    diff: null,
    ipAddress: clientIp(req),
    metadata: {
      smtpHost: host,
      smtpPort: port,
      smtpPasswordEnvName: passwordEnv ?? null,
      probeOk: result.ok,
      probeSteps: result.steps,
      probeError: result.error ?? null,
    },
  });

  return NextResponse.json(result, { status: 200 });
}
