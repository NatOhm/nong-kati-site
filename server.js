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

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// ── Infisical bootstrap (Universal Auth machine identity) ────────────────
async function loadSecretsFromInfisical() {
  const clientId = process.env.INFISICAL_CLIENT_ID;
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log('[infisical] not wired (INFISICAL_CLIENT_ID / INFISICAL_CLIENT_SECRET absent) — using environment as-is');
    return;
  }

  const base = (process.env.INFISICAL_SITE_URL || 'https://app.infisical.com').replace(/\/+$/, '');
  const envSlug = process.env.INFISICAL_ENV || 'prod';
  const projectId = process.env.INFISICAL_PROJECT_ID; // workspaceId

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
  //    overrides and win. Values are never logged.
  let injected = 0;
  let overridden = 0;
  for (const s of secrets) {
    if (!s || !s.secretKey) continue;
    if (process.env[s.secretKey] === undefined) {
      process.env[s.secretKey] = s.secretValue;
      injected++;
    } else {
      overridden++;
    }
  }
  console.log(`[infisical] loaded ${injected} secret(s) from ${envSlug}${overridden ? ` (${overridden} kept from panel override)` : ''}`);
}

// ── Boot: secrets first, then the app ────────────────────────────────────
loadSecretsFromInfisical()
  .then(() => {
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
