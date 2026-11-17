/**
 * scripts/lib/plesk-tunnel.mjs — the one SSH forward both ops scripts use.
 *
 * Why it exists: the shop's MariaDB listens on the host's loopback only — Plesk
 * creates the database user `@localhost`, so a workstation is refused even
 * though port 3306 is open (measured 2026-11-16). `scripts/ci-postswitch-gate.sh`
 * already solves that with a tunnel keyed on PLESK_SSH_KEY; this module reads the
 * same three variables, so a script can run from anywhere and dial the database
 * through the host.
 *
 * Read-only by nature: it opens a TCP forward and kills the child. Nothing is
 * ever written to disk and no secret is printed — the database URL keeps its
 * credentials, only the host and port it dials are rewritten.
 *
 * Callers (scripts/stock-reconcile.mjs, scripts/db-report.mjs) pass their own
 * `fail` so a message keeps that script's prefix; the tunnel's own words —
 * "the SSH tunnel died", the Plesk SSH-Access hint — live only here.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Where the key, host, user and client come from. Read at call time, not import
 * time, so a caller can set the variables after this module is loaded.
 *
 * The gate's key is a CI secret the workflow writes to `$HOME/.ssh/plesk_ci` and
 * names in PLESK_SSH_KEY (postswitch-gate.yml). Same filename here, so a
 * workstation holding that file needs no extra wiring — but only when a host is
 * named, never just because a stray file exists.
 */
export function tunnelEnv(env = process.env) {
  const host = env.PLESK_SSH_HOST || '';
  const ciKeyPath = join(homedir(), '.ssh', 'plesk_ci');
  const key = env.PLESK_SSH_KEY || (host && existsSync(ciKeyPath) ? ciKeyPath : '');
  return {
    host,
    key,
    ciKeyPath,
    user: env.PLESK_SSH_USER || 'nongka',
    // Only for hosts where the client is not on PATH; normal runs keep plain `ssh`.
    bin: env.PLESK_SSH_BIN || 'ssh',
  };
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const portAccepts = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });

/**
 * Pure: what to forward, and the URL to dial once it is up. A loopback URL means
 * "the database on the host itself"; anything else forwards to where it points.
 */
export function tunnelPlan(targetUrl, { key, host, user, port }) {
  const parsed = new URL(targetUrl);
  const remoteHost = LOOPBACK.has(parsed.hostname) ? '127.0.0.1' : parsed.hostname;
  const remotePort = parsed.port || '3306';
  const forward = `127.0.0.1:${port}:${remoteHost}:${remotePort}`;
  const dial = new URL(targetUrl);
  dial.hostname = '127.0.0.1';
  dial.port = String(port);
  return {
    destination: `${user}@${host}`,
    remote: `${remoteHost}:${remotePort}`,
    url: dial.href,
    args: [
      '-i', key,
      // BatchMode: a missing/mistrusted key must fail, not prompt inside a script.
      '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ExitOnForwardFailure=yes',
      '-N',
      '-L', forward,
      `${user}@${host}`,
    ],
  };
}

/**
 * Opens the forward and waits for it to answer; `fail` is the caller's exit-2
 * helper, so every failure ends that script with its own prefix and code 2.
 */
export async function openTunnel(targetUrl, fail, env = process.env) {
  const { host, key, user, bin } = tunnelEnv(env);
  if (!key) return { url: targetUrl, close: () => {} };
  if (!host) fail('PLESK_SSH_KEY is set but PLESK_SSH_HOST is not.');

  const parsed = new URL(targetUrl);
  if (!/^mysqls?:$/.test(parsed.protocol)) {
    fail(`PLESK_SSH_KEY is set, so the database URL must be mysql:// — got ${parsed.protocol}//…`);
  }
  const localPort = await freePort();
  const plan = tunnelPlan(targetUrl, { key, host, user, port: localPort });

  const child = spawn(bin, plan.args, { stdio: ['ignore', 'ignore', 'pipe'] });

  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-800);
  });
  let spawnError = null;
  child.once('error', (error) => {
    spawnError = error;
  });

  const close = () => {
    if (!child.killed) child.kill();
  };
  // A script that dies between here and disconnect must not leave ssh behind.
  process.once('exit', close);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      close();
      process.exit(130);
    });
  }

  const deadline = Date.now() + 15_000;
  for (;;) {
    if (spawnError) {
      close();
      fail(`cannot run ssh: ${spawnError.message}. Is an OpenSSH client on PATH?`);
    }
    if (child.exitCode !== null) {
      close();
      // The two failures that look identical from here have different fixes, so
      // say which one this is instead of leaving a bare "Permission denied".
      const hint = /Permission denied \(publickey/i.test(stderr)
        ? '\n  ssh reached the host and refused the key: Plesk → Websites & Domains → SSH Access'
          + ' must be enabled, and the public half of PLESK_SSH_KEY must be in that account\'s'
          + ' ~/.ssh/authorized_keys.'
        : '';
      fail(`the SSH tunnel died (ssh exit ${child.exitCode}): ${stderr.trim() || 'no output'}${hint}`);
    }
    if (await portAccepts(localPort)) break;
    if (Date.now() > deadline) {
      close();
      fail(`the tunnel never answered on 127.0.0.1:${localPort} — ssh is up but the forward is not (${stderr.trim() || 'no output'})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.error(`  tunnel   : 127.0.0.1:${localPort} → ${plan.destination} ${plan.remote}`);

  return { url: plan.url, close };
}
