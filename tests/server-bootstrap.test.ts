/**
 * server.js bootstrap decisions — audit finding 7 (2026-10-26).
 *
 * server.js boots production through the Infisical Universal-Auth chain, and
 * its decision layer (wired vs skip, URL/default resolution, panel-override
 * precedence) had zero coverage. server-bootstrap.js holds those decisions;
 * server.js keeps the fetch/exit/log side effects.
 *
 * Loaded through createRequire: the module is plain CJS because Plesk runs
 * server.js unbuilt, and tsconfig has allowJs off — a static import would
 * not typecheck.
 */
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

type Env = Record<string, string | undefined>;

type Config =
  | { wired: false }
  | {
      wired: true;
      clientId: string;
      clientSecret: string;
      base: string;
      envSlug: string;
      projectId: string;
    };

type Plan = { entries: Array<[string, string | undefined]>; kept: number };

const requireCjs = createRequire(import.meta.url);
type TokenPlan = { write: false } | { write: true; token: string };

const boot = requireCjs('../server-bootstrap.js') as {
  resolveInfisicalConfig: (env: Env) => Config;
  planInjection: (secrets: unknown[], env: Env) => Plan;
  planCronTokenFile: (env: Env) => TokenPlan;
  formatCronCurlConfig: (token: string) => string;
};

describe('resolveInfisicalConfig', () => {
  it('is not wired when credentials are absent (dev/local skip)', () => {
    expect(boot.resolveInfisicalConfig({})).toEqual({ wired: false });
    expect(
      boot.resolveInfisicalConfig({ INFISICAL_CLIENT_ID: 'id-only' }),
    ).toEqual({ wired: false });
    expect(
      boot.resolveInfisicalConfig({ INFISICAL_CLIENT_SECRET: 'secret-only' }),
    ).toEqual({ wired: false });
  });

  it('wires with production defaults when only credentials are set', () => {
    const cfg = boot.resolveInfisicalConfig({
      INFISICAL_CLIENT_ID: 'cli_x',
      INFISICAL_CLIENT_SECRET: 'sec_y',
    });
    expect(cfg).toEqual({
      wired: true,
      clientId: 'cli_x',
      clientSecret: 'sec_y',
      base: 'https://app.infisical.com',
      envSlug: 'prod',
      projectId: '',
    });
  });

  it('honours overrides and strips trailing slashes from the site URL', () => {
    const cfg = boot.resolveInfisicalConfig({
      INFISICAL_CLIENT_ID: 'id',
      INFISICAL_CLIENT_SECRET: 'sec',
      INFISICAL_SITE_URL: 'https://eu.api.infisical.com///',
      INFISICAL_ENV: 'staging',
      INFISICAL_PROJECT_ID: 'ws_123',
    });
    expect(cfg).toEqual({
      wired: true,
      clientId: 'id',
      clientSecret: 'sec',
      base: 'https://eu.api.infisical.com',
      envSlug: 'staging',
      projectId: 'ws_123',
    });
  });
});

describe('planInjection', () => {
  it('injects only keys that are absent — panel overrides always win', () => {
    const plan = boot.planInjection(
      [
        { secretKey: 'NK_JWT_SECRET', secretValue: 'from-infisical' },
        { secretKey: 'PANEL_OVERRIDE', secretValue: 'from-infisical' },
        { secretKey: 'EMPTY_PANEL_OVERRIDE', secretValue: 'from-infisical' },
      ],
      {
        PANEL_OVERRIDE: 'from-panel',
        // An override set to "" is still an override (`=== undefined`, not falsy).
        EMPTY_PANEL_OVERRIDE: '',
      },
    );
    expect(plan.entries).toEqual([['NK_JWT_SECRET', 'from-infisical']]);
    expect(plan.kept).toBe(2);
  });

  it('skips rows without a secretKey (and null rows) instead of crashing', () => {
    const plan = boot.planInjection(
      [
        null,
        undefined,
        {},
        { secretValue: 'value-without-key' },
        { secretKey: 'GOOD_KEY', secretValue: 'good' },
      ],
      {},
    );
    expect(plan.entries).toEqual([['GOOD_KEY', 'good']]);
    expect(plan.kept).toBe(0);
  });

  it('reports nothing to inject and nothing kept for an empty secret set', () => {
    expect(boot.planInjection([], {})).toEqual({ entries: [], kept: 0 });
  });
});

describe('planCronTokenFile', () => {
  // The Plesk sweeper task cats this file; if the server ever wrote it with an
  // absent secret, the sweeps would answer 401 to a token of "undefined".
  it('writes nothing when the secret is absent or empty', () => {
    expect(boot.planCronTokenFile({})).toEqual({ write: false });
    expect(boot.planCronTokenFile({ NK_CRON_SECRET: '' })).toEqual({
      write: false,
    });
  });

  it('hands back the exact secret string to mirror', () => {
    expect(boot.planCronTokenFile({ NK_CRON_SECRET: 'abc123' })).toEqual({
      write: true,
      token: 'abc123',
    });
  });
});

describe('formatCronCurlConfig', () => {
  // Plesk's scheduler kills any command containing `$`, so the task cannot run
  // `$(cat …)`; it passes `-K tmp/cron-curl.conf` and curl reads this line.
  it('produces a curl config line curl can read with -K', () => {
    expect(boot.formatCronCurlConfig('abc123')).toBe(
      'header = "x-cron-token: abc123"\n',
    );
  });

  it('keeps the header name stable — the routes accept x-cron-token', () => {
    expect(boot.formatCronCurlConfig('t')).toContain('header = "x-cron-token: ');
  });
});
