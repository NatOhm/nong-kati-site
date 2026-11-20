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
 * Failure policy: fail-closed on a partial set, not on a transient outage.
 * If credentials are provided and Infisical cannot be reached or rejects them,
 * the last good secret set from `tmp/infisical-cache.json` (0600, ≤ 24 h old)
 * stands in, so a restart loop cannot exhaust the identity's login budget and
 * leave the shop unbootable. The process still exits when a required key
 * (DATABASE_URL, NK_JWT_SECRET) is absent — a production server must never
 * serve with a partial secret set. Local/dev runs without those variables skip
 * the step entirely. A panel-owned key (DATABASE_URL, DATABASE_DIRECT_URL) that
 * Infisical had to fill is logged as a loud warning naming the key: the panel
 * row is missing and the Infisical copy predates the password rotation, so the
 * boot is "healthy" only until the first query.
 *
 * SECURITY: secret values are never logged. Only counts and error statuses.
 */

const fs = require('fs');
const { createServer } = require('http');
const path = require('path');
const { parse } = require('url');
const next = require('next');

const {
  resolveInfisicalConfig,
  planInjection,
  panelKeysFromInfisical,
  planCachedSecrets,
  missingRequiredKeys,
  formatSecretCache,
  parseSecretCache,
  planCronTokenFile,
  formatCronCurlConfig,
  registerProcessGuards,
  REQUIRED_ENV_KEYS,
} = require('./server-bootstrap');

// A promise nobody awaited used to kill the worker (Node exits on unhandled
// rejection); log it and keep the storefront up.
registerProcessGuards(process, (line) => console.error(line));

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// ── Infisical bootstrap (Universal Auth machine identity) ────────────────
const SECRET_CACHE_PATH = path.join(__dirname, 'tmp', 'infisical-cache.json');

function readSecretCache() {
  try {
    return parseSecretCache(fs.readFileSync(SECRET_CACHE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeSecretCache(secrets) {
  try {
    fs.mkdirSync(path.dirname(SECRET_CACHE_PATH), { recursive: true });
    fs.writeFileSync(SECRET_CACHE_PATH, formatSecretCache(secrets, Date.now()), { mode: 0o600 });
    // mode only applies on creation; an existing file keeps its old bits.
    fs.chmodSync(SECRET_CACHE_PATH, 0o600);
  } catch (err) {
    // A cache that cannot be written is not a boot failure: live secrets booted.
    console.error('[infisical] could not write the secret cache:', err.message);
  }
}

/** The network half: Universal Auth login, then the raw secret read. */
async function fetchInfisicalSecrets({ clientId, clientSecret, base, envSlug, projectId }) {
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
  const body = await secRes.json();
  if (!Array.isArray(body.secrets)) throw new Error('secrets response had no secrets array');
  return body.secrets;
}

async function loadSecretsFromInfisical() {
  const config = resolveInfisicalConfig(process.env);
  if (!config.wired) {
    console.log('[infisical] not wired (INFISICAL_CLIENT_ID / INFISICAL_CLIENT_SECRET absent) — using environment as-is');
    return;
  }

  let secrets;
  let fromCache = false;
  try {
    secrets = await fetchInfisicalSecrets(config);
  } catch (err) {
    const cached = readSecretCache();
    const plan = planCachedSecrets({
      now: Date.now(),
      fetchedAt: cached ? cached.fetchedAt : undefined,
      cached: cached ? cached.secrets : [],
    });
    if (!plan.usable) {
      throw new Error(`${err.message} — and no usable cached secret set (${plan.reason})`);
    }
    // Degraded, not dead: a restart loop must not take the shop down with it.
    console.error(
      `[infisical] DEGRADED — ${err.message}; booting from the cache written ${Math.round(plan.ageMs / 60000)} min ago`,
    );
    secrets = cached.secrets;
    fromCache = true;
  }

  // 3. Inject WITHOUT clobbering: panel-provided vars are per-instance
  //    overrides and win (decided by planInjection). Values are never logged.
  const plan = planInjection(secrets, process.env);
  for (const [key, value] of plan.entries) process.env[key] = value;
  console.log(
    `[infisical] loaded ${plan.entries.length} secret(s) from ${config.envSlug}` +
      `${plan.kept ? ` (${plan.kept} kept from panel override)` : ''}${fromCache ? ' (cached)' : ''}`,
  );

  // 3b. A panel-owned key Infisical had to fill: the Plesk Secret row is gone
  //     and the Infisical copy is the pre-rotation password, so the shop will
  //     boot looking healthy and fail every query. The panel row is not
  //     something this process can restore, and refusing to boot would take
  //     down an instance that legitimately runs from Infisical alone — so the
  //     boot proceeds and says it out loud, by key name. Never the value.
  for (const key of panelKeysFromInfisical(plan.entries)) {
    console.error(
      `[infisical] !!! ${key} came from Infisical, not a Plesk Secret` +
        `${fromCache ? ' (and from the cached set)' : ''} — the panel row is MISSING.`,
    );
    console.error(
      '[infisical] !!! Infisical still holds the PRE-ROTATION database password, so every query ' +
        'will fail after boot ("database":"error", 503 from /api/v1/health). A restart does not ' +
        `fix it — re-add ${key} under Plesk → Node.js → Secrets, then restart.`,
    );
  }

  // 4. Never serve a partial set. This is the fail-closed half that stays: a
  //    missing DATABASE_URL or JWT secret is not a transient outage.
  const missing = missingRequiredKeys(process.env, REQUIRED_ENV_KEYS);
  if (missing.length > 0) {
    throw new Error(`missing required secret(s): ${missing.join(', ')} — refusing to boot with a partial set`);
  }

  if (!fromCache) writeSecretCache(secrets);
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
  const file = path.join(__dirname, 'tmp', 'cron-curl.conf');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, formatCronCurlConfig(plan.token), { mode: 0o600 });
    // mode only applies on creation; an existing file keeps its old bits.
    fs.chmodSync(file, 0o600);
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
