/**
 * Pure boot decisions for the Infisical bootstrap in server.js — extracted
 * so they can be tested without touching the network, process.env or
 * process.exit (audit finding 7, 2026-10-26: this chain boots production
 * and had zero coverage).
 *
 * server.js owns everything impure: the two fetch calls, the env writes,
 * the log lines and the fail-closed exit codes. This module only decides:
 *   - resolveInfisicalConfig: wired vs skip, URL normalisation, defaults,
 *     and the credentials to send.
 *   - planInjection: which secrets land in env (only keys that are
 *     ABSENT — `=== undefined`, so a panel override of "" still wins) and
 *     which rows are skipped for having no key.
 */

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ wired: false } | {
 *   wired: true,
 *   clientId: string,
 *   clientSecret: string,
 *   base: string,
 *   envSlug: string,
 *   projectId: string,
 * }}
 */
function resolveInfisicalConfig(env) {
  const clientId = env.INFISICAL_CLIENT_ID;
  const clientSecret = env.INFISICAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { wired: false };
  return {
    wired: true,
    clientId,
    clientSecret,
    base: (env.INFISICAL_SITE_URL || 'https://app.infisical.com').replace(/\/+$/, ''),
    envSlug: env.INFISICAL_ENV || 'prod',
    // workspaceId in the Infisical API; absent is allowed (identity-scoped).
    projectId: env.INFISICAL_PROJECT_ID || '',
  };
}

/**
 * Decide the injection WITHOUT clobbering: panel-provided vars are
 * per-instance overrides and win; rows without a secretKey are skipped.
 *
 * @param {Array<{ secretKey?: string, secretValue?: string } | null | undefined>} secrets
 * @param {Record<string, string | undefined>} env
 * @returns {{ entries: Array<[string, string | undefined]>, kept: number }}
 */
function planInjection(secrets, env) {
  const entries = [];
  let kept = 0;
  for (const s of secrets) {
    if (!s || !s.secretKey) continue;
    if (env[s.secretKey] === undefined) {
      entries.push([s.secretKey, s.secretValue]);
    } else {
      kept++;
    }
  }
  return { entries, kept };
}

// ── Panel-owned keys (2026-11-20) ────────────────────────────────────────
//
// Since 2026-11-18 the MariaDB pair lives in Plesk Secrets, and the same-named
// Infisical rows are leftovers that still carry the PRE-ROTATION password
// (docs/PLESK-CUTOVER.md §6.1). planInjection only fills keys that are absent,
// so one of these names arriving from Infisical means the panel row is gone —
// and the process used to boot looking healthy, then fail every query.
//
// Boot still proceeds: an Infisical-only instance is a documented
// configuration, and the panel row is not something this process can restore.
// It just has to say so, by name, at boot (server.js step 3b).
const PANEL_OWNED_KEYS = ['DATABASE_URL', 'DATABASE_DIRECT_URL'];

/**
 * Which panel-owned keys Infisical had to fill — i.e. which Plesk Secret rows
 * are missing. `entries` is planInjection's output, so this can only ever name
 * keys Infisical supplied; a panel value is never reported.
 *
 * @param {Array<[string, string | undefined]> | undefined} entries
 * @param {string[]} [panelOwned]
 * @returns {string[]}
 */
function panelKeysFromInfisical(entries, panelOwned = PANEL_OWNED_KEYS) {
  const filled = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (Array.isArray(entry) && typeof entry[0] === 'string') filled.add(entry[0]);
  }
  return panelOwned.filter((key) => filled.has(key));
}

/**
 * Decide whether to mirror NK_CRON_SECRET to a file the Plesk scheduler can
 * read. Plesk's 10-minute task runs outside this process, so it cannot see
 * `process.env`; the task passes the header as
 * `-H x-cron-token:$(cat tmp/cron-token)` instead of holding the secret in the
 * task field, which the Plesk UI renders as plain text (docs/production-health-monitoring.md §3b).
 *
 * Absent or empty → nothing written, and the internal sweeps keep answering
 * 401 (they are fail-closed by design).
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ write: false } | { write: true, token: string }}
 */
function planCronTokenFile(env) {
  const token = env.NK_CRON_SECRET;
  if (!token) return { write: false };
  return { write: true, token };
}

/**
 * Serialise the secret as a curl config entry, not as a bare token.
 *
 * Plesk's scheduler dies on a `$` inside the command field (measured
 * 2026-11-05: `-H x-cron-token:$(cat tmp/cron-token)` and `T=$(cat …)` both
 * ended the task in under a second with empty output, while the same command
 * without `$` ran fine). So the task passes `-K tmp/cron-curl.conf` and curl
 * reads the header from the file — no substitution, no quoting.
 *
 * @param {string} token
 * @returns {string}
 */
function formatCronCurlConfig(token) {
  return `header = "x-cron-token: ${token}"\n`;
}

/**
 * Install the process-level safety net for promise rejections nobody caught
 * (audit finding, 2026-11-13). Node ≥15 exits the process on an unhandled
 * rejection, so one fire-and-forget notification or a stray DB call could take
 * the Passenger worker — and the whole storefront — down. Log and keep
 * serving; the request that caused it already has its own try/catch.
 *
 * @param {{ on: (event: string, listener: (reason: unknown) => void) => unknown }} proc
 * @param {(line: string) => void} log
 */
function registerProcessGuards(proc, log) {
  proc.on('unhandledRejection', (reason) => {
    const detail = reason instanceof Error ? reason.stack || reason.message : String(reason);
    log(`[unhandledRejection] ${detail}`);
  });
}

// ── Boot resilience (2026-11-18) ─────────────────────────────────────────
//
// Every Passenger respawn does a Universal Auth login. A respawn loop is
// therefore also a login loop, and Infisical rate-limits / locks an identity
// that logs in too often — which would turn a restart loop into an outage that
// cannot self-heal, because the old policy was "no Infisical, no boot".
//
// The cache is the last good secret set, written 0600 into `tmp/` beside the
// existing cron-curl.conf (same disk, same vhost user, 403-served). It is only
// a fallback: fresh data always wins, and it expires so a rotated secret cannot
// be resurrected indefinitely. Rotating a secret means deleting the file —
// docs/secret-rotation-checklist.md says so.

/** How long a cached secret set may still boot the app. */
const SECRET_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Keys the process cannot serve without. Absent after Infisical + panel
 * overrides + cache ⇒ exit, which keeps the fail-closed promise for a genuinely
 * unbootable state while letting a transient Infisical outage through.
 */
const REQUIRED_ENV_KEYS = ['DATABASE_URL', 'NK_JWT_SECRET'];

/**
 * Decide whether the last good secret set may stand in for a failed fetch.
 *
 * @param {{ now: number, fetchedAt?: number, ttlMs?: number, cached?: unknown }} input
 * @returns {{ usable: false, reason: string, ageMs: number | null }
 *   | { usable: true, ageMs: number }} 
 */
function planCachedSecrets({ now, fetchedAt, ttlMs = SECRET_CACHE_TTL_MS, cached }) {
  const rows = Array.isArray(cached) ? cached : [];
  if (rows.length === 0) return { usable: false, reason: 'no cached secret set', ageMs: null };
  if (!Number.isFinite(fetchedAt)) {
    return { usable: false, reason: 'cache carries no fetch timestamp', ageMs: null };
  }
  const ageMs = Number(now) - Number(fetchedAt);
  if (ageMs < 0) return { usable: false, reason: 'cache timestamp is in the future', ageMs: null };
  if (ageMs > ttlMs) {
    return { usable: false, reason: `cache is ${Math.round(ageMs / 60000)} min old (limit ${Math.round(ttlMs / 60000)} min)`, ageMs };
  }
  return { usable: true, ageMs };
}

/** Required keys absent or empty. Empty is missing: `DATABASE_URL=` cannot boot either. */
function missingRequiredKeys(env, required = REQUIRED_ENV_KEYS) {
  return required.filter((key) => !env[key]);
}

/**
 * Serialise the fetched rows for the fallback cache. Only the two fields
 * planInjection reads are kept — never Infisical metadata, never a log line.
 */
function formatSecretCache(secrets, fetchedAt) {
  const rows = (Array.isArray(secrets) ? secrets : [])
    .filter((s) => s && s.secretKey && typeof s.secretValue === 'string')
    .map((s) => ({ secretKey: s.secretKey, secretValue: s.secretValue }));
  return `${JSON.stringify({ version: 1, fetchedAt, secrets: rows }, null, 0)}\n`;
}

/**
 * Parse the cache file. Anything unexpected is "no cache" — a corrupt fallback
 * must never be half-trusted.
 *
 * @param {string} text
 * @returns {{ fetchedAt: number, secrets: Array<{ secretKey: string, secretValue: string }> } | null}
 */
function parseSecretCache(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text));
  } catch {
    return null;
  }
  if (!parsed || parsed.version !== 1) return null;
  if (!Number.isFinite(parsed.fetchedAt)) return null;
  if (!Array.isArray(parsed.secrets)) return null;
  const secrets = parsed.secrets.filter(
    (s) => s && typeof s.secretKey === 'string' && s.secretKey && typeof s.secretValue === 'string',
  );
  if (secrets.length === 0) return null;
  return { fetchedAt: Number(parsed.fetchedAt), secrets };
}

module.exports = {
  resolveInfisicalConfig,
  planInjection,
  panelKeysFromInfisical,
  PANEL_OWNED_KEYS,
  planCronTokenFile,
  formatCronCurlConfig,
  registerProcessGuards,
  planCachedSecrets,
  missingRequiredKeys,
  formatSecretCache,
  parseSecretCache,
  REQUIRED_ENV_KEYS,
  SECRET_CACHE_TTL_MS,
};
