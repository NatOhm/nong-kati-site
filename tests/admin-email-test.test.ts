/**
 * Email settings "Test connection" — SMTP probe + admin route.
 *
 * The probe is exercised against a REAL TCP listener: a minimal in-process
 * fake SMTP server (net.createServer) that speaks the exact handshake
 * probeSmtp performs — 220 greeting → EHLO → multi-line 250 with STARTTLS +
 * AUTH capabilities → QUIT. This proves the socket-level logic (line
 * framing, capability detection, structured failures), not a mock.
 *
 * The route is called in-process with real signed JWTs (same pattern as
 * admin-authz-matrix / admin-pii-masking): prisma is mocked so the
 * saved-settings fallback reads a fixture row and the audit write is a spy —
 * assertions cover the guard, the form-override precedence, the fallback,
 * the audit trail (outcome only — never a credential), and the structured
 * per-step result the settings panel renders.
 */
import { createServer, type Server } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'emailtest-secret-0123456789abcdef0123456789abcdef';

const { prismaMock, auditCreate } = vi.hoisted(() => {
  const prismaMock = {
    adminUser: { findUnique: vi.fn() },
    siteSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  };
  const auditCreate = vi.fn<(input: unknown) => Promise<unknown>>();
  auditCreate.mockResolvedValue({});
  return { prismaMock, auditCreate };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auditLog', () => ({
  writeAuditLog: (input: { tx?: { auditLog: { create: (args: unknown) => Promise<unknown> } } }) =>
    input.tx ? input.tx.auditLog.create({ data: input }) : auditCreate({ data: input }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  auditCreate.mockResolvedValue({});
  prismaMock.adminUser.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => {
      const m = /^admin-(.+)$/.exec(where.id);
      if (!m) return null;
      return {
        role: m[1],
        status: 'active',
        sessionsInvalidBefore: null,
        mustChangePassword: false,
      };
    },
  );
  prismaMock.siteSetting.findUnique.mockResolvedValue(null);
});

import { issueAdminJwt } from '@/lib/jwt';
import { ROLE_PERMISSIONS, type AdminRole } from '@/types/auth';
import { probeSmtp, isPrivateIp } from '@/lib/email/smtpProbe';

/** Minimal fake SMTP server: 220 greeting → EHLO caps → QUIT. */
function startFakeSmtp(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      // The probe destroys its socket mid-conversation by design (timeouts,
      // courtesy QUIT + destroy) — client aborts are not test failures.
      socket.on('error', () => {});
      socket.write('220 fake.smtp ESMTP ready\r\n');
      socket.on('data', (buf: Buffer) => {
        const line = buf.toString('utf8');
        if (/^EHLO/i.test(line)) {
          socket.write(
            '250-fake.smtp\r\n250-SIZE 10485760\r\n250-STARTTLS\r\n250-AUTH PLAIN LOGIN\r\n250 SMTPUTF8\r\n',
          );
        } else if (/^QUIT/i.test(line)) {
          socket.write('221 bye\r\n');
          socket.end();
        }
      });
    });
    server.on('error', () => {});
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const portOf = (server: Server): number => {
  const addr = server.address();
  return typeof addr === 'object' && addr ? addr.port : 0;
};

const tokenFor = (role: AdminRole): Promise<string> =>
  issueAdminJwt(`admin-${role}`, `${role}@test.local`, role, [...ROLE_PERMISSIONS[role]]);

function post(body: unknown, token: string): NextRequest {
  return new NextRequest('http://localhost/api/v1/admin/settings/email-test', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function call(mod: Record<string, unknown>, req: NextRequest): Promise<Response> {
  return (await (mod['POST'] as (r: NextRequest) => Promise<Response>)(req)) as Response;
}

describe('smtpProbe (real TCP against the fake server)', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = await startFakeSmtp();
    port = portOf(server);
  });
  afterAll(() => {
    server.close();
  });

  it('full handshake passes with STARTTLS/AUTH detected', async () => {
    const r = await probeSmtp({ host: '127.0.0.1', port });
    expect(r.ok).toBe(true);
    expect(r.steps).toEqual({ dns: true, tcp: true, greeting: true, ehlo: true });
    expect(r.capabilities.starttls).toBe(true);
    expect(r.capabilities.auth).toBe(true);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('refused connection → structured failure at the TCP step', async () => {
    const r = await probeSmtp({ host: '127.0.0.1', port: 1 });
    expect(r.ok).toBe(false);
    expect(r.steps.dns).toBe(true);
    expect(r.steps.tcp).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('isPrivateIp covers loopback, RFC1918, CGNAT, and IPv6-internal', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.1.2.3')).toBe(true);
    expect(isPrivateIp('192.168.0.5')).toBe(true);
    expect(isPrivateIp('172.16.9.9')).toBe(true);
    expect(isPrivateIp('100.64.0.1')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
  });
});

describe('POST /api/v1/admin/settings/email-test (route)', () => {
  let server: Server;
  let port: number;
  let route: Record<string, unknown>;  beforeAll(async () => {
    server = await startFakeSmtp();
    port = portOf(server);
    // Variable specifier — a literal '.ts' path trips TS5097 under tsc.
    const routePath = '../src/app/api/v1/admin/settings/email-test/route.ts';
    route = (await import(routePath)) as Record<string, unknown>;
  });
  afterAll(() => {
    server.close();
  });

  it('unauthenticated → exactly 401', async () => {
    const res = await call(
      route,
      new NextRequest('http://localhost/api/v1/admin/settings/email-test', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('role without settings:write → exactly 403', async () => {
    const res = await call(
      route,
      post({ smtpHost: '127.0.0.1', smtpPort: port }, await tokenFor('support_agent')),
    );
    expect(res.status).toBe(403);
  });

  it('missing host/port and no saved settings → 400 SMTP_NOT_CONFIGURED', async () => {
    const res = await call(route, post({}, await tokenFor('super_admin')));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('SMTP_NOT_CONFIGURED');
  });

  it('literal localhost → 400 INVALID_SMTP_HOST (never reaches the probe)', async () => {
    const res = await call(
      route,
      post({ smtpHost: 'localhost', smtpPort: 25 }, await tokenFor('super_admin')),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('INVALID_SMTP_HOST');
  });

  it('invalid env-var name → 400 INVALID_ENV_VAR_NAME', async () => {
    const res = await call(
      route,
      post(
        { smtpHost: 'smtp.example.com', smtpPort: 587, smtpPasswordEnv: 'bad-name' },
        await tokenFor('super_admin'),
      ),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('INVALID_ENV_VAR_NAME');
  });

  it('form override wins, settings untouched, audit records steps but only the env-var NAME', async () => {
    const res = await call(
      route,
      post({ smtpHost: '127.0.0.1', smtpPort: port }, await tokenFor('super_admin')),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      steps: { tcp: boolean };
      capabilities: { auth: boolean };
    };
    expect(body.ok).toBe(true);
    expect(body.steps.tcp).toBe(true);
    expect(body.capabilities.auth).toBe(true);

    expect(prismaMock.siteSetting.upsert).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const audit = auditCreate.mock.calls[0]?.[0] as {
      data: { action: string; metadata: Record<string, unknown> };
    };
    expect(audit.data.action).toBe('settings.email_test');
    expect(audit.data.metadata['probeOk']).toBe(true);
    expect(audit.data.metadata['smtpPasswordEnvName']).toBeNull();
  });

  it('falls back to the saved email settings when the body omits host/port', async () => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({
      value: JSON.stringify({
        smtpHost: '127.0.0.1',
        smtpPort: port,
        smtpUser: 'resend',
        smtpPasswordEnv: 'SMTP_PASSWORD',
      }),
    });
    const res = await call(route, post({}, await tokenFor('super_admin')));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    const audit = auditCreate.mock.calls[0]?.[0] as {
      data: { metadata: Record<string, unknown> };
    };
    expect(audit.data.metadata['smtpPort']).toBe(port);
    expect(audit.data.metadata['smtpPasswordEnvName']).toBe('SMTP_PASSWORD');
  });

  it('probe failure still returns 200 with a structured failure + audit trail', async () => {
    const res = await call(
      route,
      post({ smtpHost: '127.0.0.1', smtpPort: 1 }, await tokenFor('super_admin')),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; steps: { tcp: boolean } };
    expect(body.ok).toBe(false);
    expect(body.steps.tcp).toBe(false);
    const audit = auditCreate.mock.calls[0]?.[0] as {
      data: { metadata: Record<string, unknown> };
    };
    expect(audit.data.metadata['probeOk']).toBe(false);
  });
});
