/**
 * SMTP probe — connectivity test for the email settings panel.
 *
 * Performs the cheapest safe handshake that proves a mail exchanger is
 * actually usable: DNS resolve → TCP connect → read the 220 greeting →
 * EHLO and read the capability list (STARTTLS / AUTH). No message is sent,
 * no credentials are transmitted, no state changes on the server.
 *
 * Safety:
 *  - SSRF guard: in production the host may not resolve to loopback /
 *    private / link-local addresses (an admin user could otherwise make the
 *    server open connections into the internal network).
 *  - Every step has a hard timeout; the socket is always destroyed.
 *  - The result is structured per step so the UI can show WHERE it failed.
 */
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export interface SmtpProbeParams {
  host: string;
  port: number;
  /** Reporting only — the probe never authenticates. */
  user?: string | null;
  passwordEnv?: string | null;
}

export interface SmtpProbeResult {
  ok: boolean;
  latencyMs: number;
  steps: { dns: boolean; tcp: boolean; greeting: boolean; ehlo: boolean };
  capabilities: { starttls: boolean; auth: boolean };
  error?: string;
  detail?: string;
}

const CONNECT_TIMEOUT_MS = 5_000;
const READ_TIMEOUT_MS = 4_000;
const DNS_TIMEOUT_MS = 5_000;

/** True when `ip` is loopback / RFC1918 / link-local / IPv6-internal. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map((x) => parseInt(x, 10));
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b! >= 16 && b! <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b! >= 64 && b! <= 127) return true; // CGNAT
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd'))
    return true;
  if (lower.startsWith('fe80:')) return true;
  if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7));
  return false;
}

function fail(
  steps: SmtpProbeResult['steps'],
  error: string,
  detail?: string,
  started = 0,
): SmtpProbeResult {
  return {
    ok: false,
    latencyMs: started ? Date.now() - started : 0,
    steps,
    capabilities: { starttls: false, auth: false },
    error,
    ...(detail !== undefined ? { detail } : {}),
  };
}

/** Read socket data until `done(data)` returns true, or the timeout fires. */
function readUntil(socket: net.Socket, done: (data: string) => boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      if (done(buf)) {
        cleanup();
        resolve(buf);
      }
    };
    const onErr = (err: Error) => {
      cleanup();
      reject(err);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(Object.assign(new Error('READ_TIMEOUT'), { code: 'READ_TIMEOUT' }));
    }, READ_TIMEOUT_MS);
    function cleanup() {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onErr);
    }
    socket.on('data', onData);
    socket.on('error', onErr);
  });
}

function sendLine(socket: net.Socket, line: string): void {
  socket.write(`${line}\r\n`);
}

/**
 * Probe an SMTP endpoint. Never throws — every failure is a structured
 * result so the settings UI can render exactly which step failed.
 */
export async function probeSmtp(params: SmtpProbeParams): Promise<SmtpProbeResult> {
  const started = Date.now();
  const steps = { dns: false, tcp: false, greeting: false, ehlo: false };
  const host = params.host.trim();
  const port = params.port;

  // ── DNS ─────────────────────────────────────────────────
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await Promise.race([
      lookup(host, { all: true }),
      new Promise<never>((_, rej) =>
        setTimeout(
          () => rej(Object.assign(new Error('DNS_TIMEOUT'), { code: 'DNS_TIMEOUT' })),
          DNS_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (err) {
    const code = err instanceof Error && 'code' in err ? String(err.code) : 'DNS_FAIL';
    return fail(steps, code, `cannot resolve ${host}`, started);
  }
  steps.dns = true;

  // ── SSRF guard (production only — tests/dev may target loopback) ──
  if (process.env['NODE_ENV'] === 'production' && addresses.some((a) => isPrivateIp(a.address))) {
    return fail(steps, 'PRIVATE_HOST_BLOCKED', 'resolved to an internal address', started);
  }

  // ── TCP + greeting + EHLO ───────────────────────────────
  const ip = addresses[0]?.address ?? host;
  const socket = new net.Socket();
  let result: SmtpProbeResult;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Object.assign(new Error('CONNECT_TIMEOUT'), { code: 'CONNECT_TIMEOUT' })),
        CONNECT_TIMEOUT_MS,
      );
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        const code = (err as NodeJS.ErrnoException).code ?? 'TCP_FAIL';
        reject(Object.assign(err, { code }));
      });
      socket.connect({ host: ip, port });
    });
    steps.tcp = true;

    // Greeting must be 220.
    const greeting = await readUntil(socket, (d) => d.includes('\n') || d.length > 256);
    if (!/^\d{3}[ -]/.test(greeting.trim())) {
      return fail(steps, 'GREETING_INVALID', greeting.trim().slice(0, 80), started);
    }
    if (!greeting.startsWith('220')) {
      return fail(steps, 'GREETING_NOT_READY', greeting.trim().slice(0, 80), started);
    }
    steps.greeting = true;

    // EHLO — multi-line reply ends with "250 " (space) on the final line.
    sendLine(socket, 'EHLO nong-kati.local');
    const ehlo = await readUntil(socket, (d) => /(?:^|\r?\n)250[ ]/.test(d));
    steps.ehlo = true;
    const caps = {
      starttls: /STARTTLS/i.test(ehlo),
      auth: /AUTH/i.test(ehlo),
    };
    result = {
      ok: true,
      latencyMs: Date.now() - started,
      steps,
      capabilities: caps,
    };
    // Best-effort courtesy close.
    try {
      sendLine(socket, 'QUIT');
    } catch {
      /* socket may already be gone */
    }
  } catch (err) {
    const code = err instanceof Error && 'code' in err ? String(err.code) : 'TCP_FAIL';
    result = fail(
      steps,
      code,
      err instanceof Error ? err.message.slice(0, 120) : undefined,
      started,
    );
  } finally {
    socket.destroy();
  }
  return result;
}
