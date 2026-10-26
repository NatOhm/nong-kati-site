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

module.exports = { resolveInfisicalConfig, planInjection };
