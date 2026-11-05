/**
 * Custom Node.js Server for Hostatom Deployment (Plesk + Passenger)
 *
 * Next.js application on traditional hosting, plus an Infisical bootstrap:
 * Plesk's Node.js panel can only hold a handful of plain env vars, so the
 * panel stores ONLY the Infisical machine-identity credentials and this
 * server pulls the real secrets at boot — nothing sensitive sits in the
 * panel or in a .env file on the server disk.
 *
 * Boot sequence:
 *   1. If INFISICAL_CLIENT_ID + INFISICAL_CLIENT_SECRET are present in the
 *      environment, authenticate via Universal Auth and inject every secret
 *      from the configured project/environment into process.env.
 *      Panel-provided variables always win (they act as per-instance
 *      overrides) — Infisical only fills what is missing.
 *   2. Then (and only then) the Next.js server starts.
 *
 * Failure policy: fail-closed. If credentials are provided but Infisical
 * cannot be reached or rejects them, the process exits — a production
 * server must not boot with a partial secret set. Local/dev runs without
 * those variables skip the step entirely.
 *
 * SECURITY: secret values are never logged. Only counts and error statuses.
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const {
  resolveInfisicalConfig,
  planInjection,
  planCronTokenFile,
  formatCronCurlConfig,
} = require('./server-bootstrap');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// ── Infisical bootstrap (Universal Auth machine identity) ────────────────
async function loadSecretsFromInfisical() {
  const config = resolveInfisicalConfig(process.env);
  if (!config.wired) {
    console.log('[infisical] not wired (INFISICAL_CLIENT_ID / INFISICAL_CLIENT_SECRET absent) — using environment as-is');
    return;
  }
  const { clientId, clientSecret, base, envSlug, projectId } = config;

  const timeout = (ms) => AbortSignal.timeout(ms);

  // 1. Exchange client credentials for a short-lived access token.
  const loginRes = await fetch(`${base}/api/v1/auth/universal-auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ clientId, clientSecret }),
    signal: timeout(15000),
  });
  if (!loginRes.ok) {
    throw new Error(`universal-auth login failed: HTTP ${loginRes.status} (check credentials / trusted IPs / lockout)`);
  }
  const { accessToken } = await loginRes.json();
  if (!accessToken) throw new Error('universal-auth login returned no accessToken');

  // 2. Read every raw secret for the project/environment.
  const params = new URLSearchParams({ environment: envSlug });
  if (projectId) params.set('workspaceId', projectId);
  const secRes = await fetch(`${base}/api/v3/secrets/raw?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: timeout(15000),
  });
  if (!secRes.ok) {
    throw new Error(`secrets read failed: HTTP ${secRes.status} (check identity is added to the project with a secrets-read role)`);
  }
  const { secrets } = await secRes.json();
  if (!Array.isArray(secrets)) throw new Error('secrets response had no secrets array');

  // 3. Inject WITHOUT clobbering: panel-provided vars are per-instance
  //    overrides and win (decided by planInjection). Values are never logged.
  const plan = planInjection(secrets, process.env);
  for (const [key, value] of plan.entries) process.env[key] = value;
  console.log(`[infisical] loaded ${plan.entries.length} secret(s) from ${envSlug}${plan.kept ? ` (${plan.kept} kept from panel override)` : ''}`);
}

// ── Cron token hand-off (docs/production-health-monitoring.md §3b) ───────
// The Plesk scheduler fires the internal sweeps from outside this process, so
// it cannot read env, and its task field renders secrets as plain text — so
// the header travels through a 0600 file the task passes as `-K`. It is a
// curl CONFIG (`header = "x-cron-token: …"`), not a bare token: Plesk's
// scheduler dies on a `$` in the command, so `-H …$(cat …)` is not usable
// (measured 2026-11-05).
//
// `tmp/` is Passenger's restart directory, not the web root: Plesk answers
// 403 for anything under it, so the file is never served. Exposure is the
// same disk the env var already sits on, readable by the same vhost user; it
// adds no new reader, it only spares a human copying the secret between
// panels.
//
// Not fatal on failure: without the file the sweeps keep answering 401, which
// is what they do today with no scheduler at all.
function writeCronCurlConfig() {
  const plan = planCronTokenFile(process.env);
  if (!plan.write) {
    console.log('[cron-token] NK_CRON_SECRET absent — no curl config written');
    return;
  }
  const fs = require('fs');
  const path = require('path').join(__dirname, 'tmp', 'cron-curl.conf');
  try {
    fs.mkdirSync(require('path').dirname(path), { recursive: true });
    fs.writeFileSync(path, formatCronCurlConfig(plan.token), { mode: 0o600 });
    // mode only applies on creation; an existing file keeps its old bits.
    fs.chmodSync(path, 0o600);
    console.log('[cron-token] wrote tmp/cron-curl.conf (0600) for the Plesk sweeper');
  } catch (err) {
    console.error('[cron-token] could not write curl config:', err.message);
  }
}

// ── Boot: secrets first, then the app ────────────────────────────────────
loadSecretsFromInfisical()
  .then(() => {
    writeCronCurlConfig();

    const app = next({ dev, hostname, port });
    const handle = app.getRequestHandler();

    return app.prepare().then(() => {
      createServer(async (req, res) => {
        try {
          const parsedUrl = parse(req.url, true);
          await handle(req, res, parsedUrl);
        } catch (err) {
          console.error('Error handling request:', err);
          res.statusCode = 500;
          res.end('Internal Server Error');
        }
      })
        .once('error', (err) => {
          console.error(err);
          process.exit(1);
        })
        .listen(port, () => {
          console.log(`> Ready on http://${hostname}:${port}`);
          console.log(`> Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    });
  })
  .catch((err) => {
    console.error('[infisical] FATAL — refusing to start:', err.message);
    process.exit(1);
  });
