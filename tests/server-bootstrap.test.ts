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

type Proc = { on: (event: string, listener: (reason: unknown) => void) => unknown };

type CachePlan =
  | { usable: false; reason: string; ageMs: number | null }
  | { usable: true; ageMs: number };

const boot = requireCjs('../server-bootstrap.js') as {
  resolveInfisicalConfig: (env: Env) => Config;
  planInjection: (secrets: unknown[], env: Env) => Plan;
  planCronTokenFile: (env: Env) => TokenPlan;
  formatCronCurlConfig: (token: string) => string;
  registerProcessGuards: (proc: Proc, log: (line: string) => void) => void;
  planCachedSecrets: (input: {
    now: number;
    fetchedAt?: number;
    ttlMs?: number;
    cached?: unknown;
  }) => CachePlan;
  missingRequiredKeys: (env: Env, required?: string[]) => string[];
  formatSecretCache: (secrets: unknown[], fetchedAt: number) => string;
  parseSecretCache: (
    text: string,
  ) => { fetchedAt: number; secrets: Array<{ secretKey: string; secretValue: string }> } | null;
  REQUIRED_ENV_KEYS: string[];
  SECRET_CACHE_TTL_MS: number;
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

describe('registerProcessGuards', () => {
  // Node ≥15 exits the worker on an unhandled rejection; the guard must absorb
  // it and leave a log line behind (audit 2026-11-13).
  it('registers an unhandledRejection listener that logs and does not throw', () => {
    const handlers = new Map<string, (reason: unknown) => void>();
    const lines: string[] = [];
    const proc: Proc = {
      on: (event, listener) => handlers.set(event, listener),
    };

    boot.registerProcessGuards(proc, (line) => lines.push(line));

    const handler = handlers.get('unhandledRejection');
    expect(handler).toBeTypeOf('function');
    expect(() => handler!(new Error('boom'))).not.toThrow();
    expect(lines[0]).toContain('[unhandledRejection]');
    expect(lines[0]).toContain('boom');

    handler!('plain-string-reason');
    expect(lines[1]).toContain('plain-string-reason');
  });
});

describe('planCachedSecrets', () => {
  // A restart loop is a login loop; without the cache, an Infisical rate-limit
  // turns a churn problem into an outage that cannot self-heal (2026-11-18).
  const TTL = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 10, 18, 12, 0, 0);
  const rows = [{ secretKey: 'NK_JWT_SECRET', secretValue: 'x' }];

  it('uses a set that is inside the TTL, and reports its age', () => {
    const plan = boot.planCachedSecrets({ now, fetchedAt: now - 90 * 60 * 1000, cached: rows });
    expect(plan).toEqual({ usable: true, ageMs: 90 * 60 * 1000 });
  });

  it('refuses an expired set — a rotated secret must not be resurrected for ever', () => {
    const plan = boot.planCachedSecrets({ now, fetchedAt: now - TTL - 1, ttlMs: TTL, cached: rows });
    expect(plan.usable).toBe(false);
    if (!plan.usable) expect(plan.reason).toContain('old');
  });

  it('refuses an empty set, a missing timestamp and a future timestamp', () => {
    expect(boot.planCachedSecrets({ now, fetchedAt: now, cached: [] }).usable).toBe(false);
    expect(boot.planCachedSecrets({ now, cached: rows }).usable).toBe(false);
    expect(boot.planCachedSecrets({ now, fetchedAt: now + 60_000, cached: rows }).usable).toBe(
      false,
    );
  });

  it('treats a non-array cache as no cache', () => {
    expect(boot.planCachedSecrets({ now, fetchedAt: now, cached: { nope: true } }).usable).toBe(
      false,
    );
  });

  it('defaults the TTL to 24 h', () => {
    expect(boot.SECRET_CACHE_TTL_MS).toBe(TTL);
  });
});

describe('missingRequiredKeys', () => {
  // Fail-closed survives the cache: a DB URL or JWT secret that is absent is a
  // refusal to boot, not a transient outage. Empty counts as absent.
  it('reports DATABASE_URL and NK_JWT_SECRET as the required set', () => {
    expect(boot.REQUIRED_ENV_KEYS).toEqual(['DATABASE_URL', 'NK_JWT_SECRET']);
  });

  it('names every absent or empty key', () => {
    expect(
      boot.missingRequiredKeys({ DATABASE_URL: '', NK_JWT_SECRET: 'secret' }),
    ).toEqual(['DATABASE_URL']);
    expect(boot.missingRequiredKeys({})).toEqual(['DATABASE_URL', 'NK_JWT_SECRET']);
    expect(
      boot.missingRequiredKeys({ DATABASE_URL: 'mysql://x', NK_JWT_SECRET: 'y' }),
    ).toEqual([]);
  });
});

describe('secret cache round-trip', () => {
  const fetchedAt = Date.UTC(2026, 10, 18, 10, 0, 0);

  it('keeps only the two fields planInjection reads', () => {
    const text = boot.formatSecretCache(
      [
        { secretKey: 'A', secretValue: '1', secretComment: 'drop me', workspace: 'ws' },
        { secretKey: 'B', secretValue: '2' },
        null,
        { secretValue: 'no key' },
      ],
      fetchedAt,
    );
    expect(JSON.parse(text)).toEqual({
      version: 1,
      fetchedAt,
      secrets: [
        { secretKey: 'A', secretValue: '1' },
        { secretKey: 'B', secretValue: '2' },
      ],
    });
  });

  it('parses what it wrote', () => {
    const text = boot.formatSecretCache([{ secretKey: 'A', secretValue: '1' }], fetchedAt);
    expect(boot.parseSecretCache(text)).toEqual({
      fetchedAt,
      secrets: [{ secretKey: 'A', secretValue: '1' }],
    });
  });

  it('returns null rather than half-trusting broken input', () => {
    expect(boot.parseSecretCache('')).toBeNull();
    expect(boot.parseSecretCache('{not json')).toBeNull();
    expect(boot.parseSecretCache(JSON.stringify({ version: 2, fetchedAt, secrets: [] }))).toBeNull();
    expect(boot.parseSecretCache(JSON.stringify({ version: 1, secrets: [] }))).toBeNull();
    expect(
      boot.parseSecretCache(JSON.stringify({ version: 1, fetchedAt, secrets: [{ secretValue: 'x' }] })),
    ).toBeNull();
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
