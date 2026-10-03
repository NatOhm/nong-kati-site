#!/usr/bin/env node
/**
 * scripts/monitor-health.mjs — production health + restart monitor for
 * nongkatistore.com (Hostatom/Plesk).
 *
 * WHY THIS EXISTS
 * On Oct 3, 2026 the app was found reporting `uptime: 7s` with no deploy, no
 * panel restart, and an empty Apache error_log. The investigation (see
 * docs/production-health-monitoring.md) showed there are TWO different things
 * that both look like "the app restarted", and only one of them is a problem:
 *
 *   1. IDLE REAP (expected). Plesk/Passenger reaps the idle Node process after
 *      a few minutes of no traffic and respawns it on the next request. Proven:
 *      uptime NEVER resets during continuous traffic (4+ minutes of 15s polls,
 *      monotonic), and ALWAYS resets after a multi-minute gap. Apache's
 *      error_log stays empty because nothing crashed.
 *   2. UNEXPECTED RESTART (a real alert). A reset that happens while the app
 *      was being polled recently — i.e. it died on its own while in use.
 *
 * A monitor that alerts on every uptime reset would cry wolf on every quiet
 * afternoon. So the classifier below compares the uptime reset against how long
 * the app had been idle, and only the unexpected case alerts by default.
 *
 * USAGE
 *   node scripts/monitor-health.mjs
 *   node scripts/monitor-health.mjs --url https://nongkatistore.com \
 *        --state .prod-health-state.json --history .prod-health-history.ndjson
 *
 * Exit codes (this is the alerting contract):
 *   0 = healthy, or an expected idle reap was observed
 *   1 = an alert condition fired (unreachable, unhealthy, unexpected restart)
 *   2 = the monitor itself is misconfigured/broken (bad args, unwritable state)
 *
 * Exit 2 is deliberately distinct from 1: "the monitor failed" must never be
 * mistaken for "production is down", and vice versa.
 *
 * Only node: builtins are used — no npm install, so it runs in a bare CI
 * runner or on any machine with Node 18+.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// ── Defaults ────────────────────────────────────────────────────────────
const DEFAULTS = {
  url: 'https://nongkatistore.com',
  healthPath: '/api/v1/health',
  statePath: '.prod-health-state.json',
  historyPath: '.prod-health-history.ndjson',
  timeoutMs: 15000,
  /**
   * A gap at least this long before a check means the app was idle, so an
   * uptime reset is the expected reap rather than a crash. Set from the
   * observed behaviour: resets happened after ~4-9 minutes of silence and
   * never during continuous traffic.
   */
  idleReapSeconds: 180,
  /**
   * Clock/poll jitter tolerance. Uptime is read at two different instants, so
   * it never rises by exactly the elapsed time; without a small tolerance a
   * fast poll can look like a restart.
   */
  uptimeToleranceSeconds: 5,
  /**
   * Consecutive failures before alerting. One dropped request during a deploy
   * (the app is restarting) should not page anyone; three in a row is a site
   * that is actually down.
   */
  failureThreshold: 3,
  /** Cap on the in-state restart log so the file cannot grow without bound. */
  maxHistoryInState: 50,
};

// ── Tiny arg parser (no deps) ───────────────────────────────────────────
/**
 * CLI flag name → option key. `--state` must land on `statePath`, not `state`;
 * getting this wrong silently ignores the flag and writes to the default
 * location, which looks like "it worked" until you look for the file.
 */
const FLAG_ALIASES = {
  url: 'url',
  'health-path': 'healthPath',
  state: 'statePath',
  history: 'historyPath',
  'timeout-ms': 'timeoutMs',
  'idle-reap-seconds': 'idleReapSeconds',
  'failure-threshold': 'failureThreshold',
  'uptime-tolerance-seconds': 'uptimeToleranceSeconds',
  'max-history-in-state': 'maxHistoryInState',
  webhook: 'webhook',
  help: 'help',
};

export function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const flag = arg.slice(2);
    const key = FLAG_ALIASES[flag] ?? flag;
    if (key === 'help') return { ...opts, help: true };
    const next = argv[i + 1];
    // A flag with no value is treated as boolean true (e.g. --max-history-in-state 0
    // is a value, but a trailing bare flag is not).
    if (next === undefined || next.startsWith('--')) {
      opts[key] = true;
    } else {
      opts[key] = next;
      i++;
    }
  }
  return opts;
}

/**
 * Classify one health sample against the previous state.
 *
 * Pure and side-effect free so the decision table can be unit-tested without a
 * network, a server, or a clock. `now` and the sample's timestamps are passed
 * in rather than read from Date.now().
 *
 * @param {object} input
 * @param {object|null} input.prev     previous state (null on first ever run)
 * @param {object} input.sample        { ok, httpStatus, body, error, latencyMs }
 * @param {number} input.now           epoch ms of this check
 * @param {object} input.opts          resolved options
 * @returns {{verdict: string, events: object[], shouldAlert: boolean}}
 */
export function evaluateSample({ prev, sample, now, opts = DEFAULTS }) {
  const events = [];
  const idleReapSeconds = Number(opts.idleReapSeconds ?? DEFAULTS.idleReapSeconds);
  const tolerance = Number(opts.uptimeToleranceSeconds ?? DEFAULTS.uptimeToleranceSeconds);
  const failureThreshold = Number(opts.failureThreshold ?? DEFAULTS.failureThreshold);

  // ── 1. Could we even reach it? ───────────────────────────────────────
  if (!sample.ok) {
    const consecutive = (prev?.consecutiveFailures ?? 0) + 1;
    events.push({
      type: 'unreachable',
      error: sample.error ?? `HTTP ${sample.httpStatus ?? 'no response'}`,
      consecutiveFailures: consecutive,
    });
    return {
      verdict: 'unreachable',
      events,
      // Only alert once the failure has persisted — a single timeout is noise.
      shouldAlert: consecutive >= failureThreshold,
    };
  }

  const body = sample.body ?? {};
  const uptime = Number(body?.checks?.uptime);
  const dbError = body?.checks?.database === 'error';
  const statusNotHealthy = body?.status !== 'healthy';
  const badStatus = sample.httpStatus !== 200 || statusNotHealthy || dbError;

  if (badStatus) {
    const consecutive = (prev?.consecutiveFailures ?? 0) + 1;
    events.push({
      type: 'unhealthy',
      httpStatus: sample.httpStatus,
      status: body?.status ?? 'unknown',
      database: body?.checks?.database ?? 'unknown',
      consecutiveFailures: consecutive,
    });
    return { verdict: 'unhealthy', events, shouldAlert: consecutive >= failureThreshold };
  }

  // ── 2. Healthy. Now the interesting part: did it restart under us? ────
  const prevUptime = prev?.lastUptime;
  const lastCheckAt = prev?.lastCheckAt;
  const idleForSec = lastCheckAt ? Math.max(0, (now - lastCheckAt) / 1000) : null;

  if (!Number.isFinite(uptime)) {
    // Healthy but no usable uptime: still worth recording, never alerting.
    events.push({ type: 'no-uptime-field' });
    return { verdict: 'ok', events, shouldAlert: false };
  }

  if (prevUptime === undefined || prevUptime === null) {
    // First run ever, or state was reset: there is nothing to compare against.
    events.push({ type: 'baseline', uptime });
    return { verdict: 'ok', events, shouldAlert: false };
  }

  if (uptime < prevUptime - tolerance) {
    // Uptime went BACKWARDS → the process is new.
    const idleReap = idleForSec !== null && idleForSec >= idleReapSeconds;
    events.push({
      type: idleReap ? 'idle-reap' : 'restart',
      uptime,
      previousUptime: prevUptime,
      idleForSec,
      // How long the *new* process had been alive when we saw it.
      newProcessAgeSec: uptime,
    });
    return {
      verdict: idleReap ? 'idle-reap' : 'restart',
      events,
      // The expected reap is recorded but must NOT alert — see file header.
      shouldAlert: !idleReap,
    };
  }

  return { verdict: 'ok', events, shouldAlert: false };
}

// ── State I/O ───────────────────────────────────────────────────────────
export function readState(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // Missing or corrupt state is NOT fatal: the monitor re-baselines and says
    // so. A monitor that refuses to run because its state file is ugly is a
    // monitor that silently stops monitoring.
    return null;
  }
}

export function writeState(path, state) {
  try {
    if (dirname(path) && dirname(path) !== '.') mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  } catch (err) {
    throw new Error(`cannot write state file ${path}: ${err.message}`);
  }
}

export function appendHistory(path, record) {
  try {
    if (dirname(path) && dirname(path) !== '.') mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (err) {
    // History is a nice-to-have; never fail the check over it.
    console.warn(`⚠ could not append history ${path}: ${err.message}`);
  }
}

// ── Network ─────────────────────────────────────────────────────────────
export async function fetchHealth({ baseUrl, healthPath, timeoutMs }) {
  const url = `${baseUrl.replace(/\/+$/, '')}${healthPath}`;
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json', 'user-agent': 'nong-kati-health-monitor/1.0' },
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      // A 200 that is not JSON is still a failure signal — keep the raw text.
      body = { status: 'unparseable', raw: text.slice(0, 200) };
    }
    return { ok: true, httpStatus: res.status, body, error: null, latencyMs: Date.now() - startedAt };
  } catch (err) {
    return {
      ok: false,
      httpStatus: null,
      body: null,
      error: err?.message ?? String(err),
      latencyMs: Date.now() - startedAt,
    };
  }
}

// ── Alert delivery ──────────────────────────────────────────────────────
/**
 * Optional webhook (Slack/Discord/Line shape: `{ text }`). Failure to deliver
 * is reported but does not change the exit code — the check verdict is the
 * signal, and a broken webhook must not mask it.
 */
async function sendWebhook(url, message) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: message }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) console.warn(`⚠ webhook returned HTTP ${res.status}`);
  } catch (err) {
    console.warn(`⚠ webhook delivery failed: ${err?.message ?? err}`);
  }
}

function describe(events) {
  return events
    .map((e) => {
      switch (e.type) {
        case 'restart':
          return (
            `UNEXPECTED RESTART — uptime ${fmtDur(e.previousUptime)} → ${fmtDur(e.uptime)} ` +
            `while the app was active (idle only ${fmtDur(e.idleForSec)})`
          );
        case 'idle-reap':
          return (
            `idle reap (expected) — uptime was ${fmtDur(e.previousUptime)}, now ${fmtDur(e.uptime)} ` +
            `after ${fmtDur(e.idleForSec)} idle`
          );
        case 'unreachable':
          return `UNREACHABLE — ${e.error} (${e.consecutiveFailures} in a row)`;
        case 'unhealthy':
          return (
            `UNHEALTHY — HTTP ${e.httpStatus}, status=${e.status}, database=${e.database} ` +
            `(${e.consecutiveFailures} in a row)`
          );
        case 'baseline':
          return `baseline recorded — uptime ${fmtDur(e.uptime)}`;
        default:
          return e.type;
      }
    })
    .join('; ');
}

function fmtDur(sec) {
  if (sec === null || sec === undefined || !Number.isFinite(Number(sec))) return '?';
  const s = Math.round(Number(sec));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
  const h = Math.floor(s / 3600);
  return `${h}h${Math.floor((s % 3600) / 60)}m`;
}

// ── Main ────────────────────────────────────────────────────────────────
export async function main(argv = process.argv.slice(2), env = process.env) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(
      [
        'Production health + restart monitor.',
        '',
        'Flags:',
        `  --url <base>            default ${DEFAULTS.url}`,
        `  --health-path <path>    default ${DEFAULTS.healthPath}`,
        `  --state <file>          default ${DEFAULTS.statePath}`,
        `  --history <file>        default ${DEFAULTS.historyPath}`,
        `  --timeout-ms <n>        default ${DEFAULTS.timeoutMs}`,
        `  --idle-reap-seconds <n> default ${DEFAULTS.idleReapSeconds}`,
        `  --failure-threshold <n> default ${DEFAULTS.failureThreshold}`,
        '  --webhook <url>         POST {"text":...} on alert (or WEBHOOK_URL env)',
        '',
        'Exit: 0 ok / 1 alert / 2 monitor error',
      ].join('\n'),
    );
    return 0;
  }

  const baseUrl = String(opts.url ?? DEFAULTS.url);
  const healthPath = String(opts.healthPath ?? DEFAULTS.healthPath);
  const statePath = String(opts.statePath ?? DEFAULTS.statePath);
  const historyPath = String(opts.historyPath ?? DEFAULTS.historyPath);
  const timeoutMs = Number(opts.timeoutMs ?? DEFAULTS.timeoutMs);
  const webhook = opts.webhook ?? env.WEBHOOK_URL ?? null;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    console.error(`✖ --timeout-ms must be a positive number (got ${opts.timeoutMs})`);
    return 2;
  }

  const now = Date.now();
  const prev = readState(statePath);

  const sample = await fetchHealth({ baseUrl, healthPath, timeoutMs });
  const result = evaluateSample({ prev, sample, now, opts });

  const uptime = Number(sample.body?.checks?.uptime);
  const record = {
    at: new Date(now).toISOString(),
    url: baseUrl,
    verdict: result.verdict,
    httpStatus: sample.httpStatus,
    latencyMs: sample.latencyMs,
    uptime: Number.isFinite(uptime) ? uptime : null,
    previousUptime: prev?.lastUptime ?? null,
    idleForSec: prev?.lastCheckAt ? Math.round((now - prev.lastCheckAt) / 1000) : null,
    database: sample.body?.checks?.database ?? null,
    error: sample.error ?? null,
    events: result.events,
  };

  // State advances on EVERY run, including alerting runs: after a crash the
  // new process's uptime is the new baseline, and re-alerting on it forever
  // would be noise. `consecutiveFailures` resets as soon as we are healthy.
  const restarts = [...(prev?.restarts ?? [])];
  if (result.verdict === 'restart') {
    restarts.push({ at: record.at, previousUptime: prev?.lastUptime ?? null, uptime });
  }
  const maxHistory = Number(opts.maxHistoryInState ?? DEFAULTS.maxHistoryInState);

  const nextState = {
    lastCheckAt: now,
    lastUptime: Number.isFinite(uptime) ? uptime : (prev?.lastUptime ?? null),
    lastVerdict: result.verdict,
    consecutiveFailures:
      result.verdict === 'ok' || result.verdict === 'idle-reap' ? 0 : (prev?.consecutiveFailures ?? 0) + 1,
    restarts: restarts.slice(-maxHistory),
  };

  try {
    writeState(statePath, nextState);
  } catch (err) {
    console.error(`✖ ${err.message}`);
    return 2;
  }
  appendHistory(historyPath, record);

  // ── Report ────────────────────────────────────────────────────────────
  const line = describe(result.events) || result.verdict;
  if (result.shouldAlert) {
    console.error(`✖ ALERT ${line}`);
    console.error(`  url=${baseUrl}${healthPath} http=${sample.httpStatus ?? '-'} latency=${sample.latencyMs}ms`);
    // GitHub renders ::error:: as a red annotation on the run page — but ONLY
    // from stdout. Workflow commands on stderr are silently dropped, so the
    // annotation would never appear. Keep this on stdout; the human-readable
    // lines above stay on stderr.
    process.stdout.write(`::error title=production health alert::${line.replace(/\n/g, ' ')}\n`);
    if (webhook) await sendWebhook(String(webhook), `🚨 nongkatistore.com — ${line}`);
    return 1;
  }

  if (result.verdict === 'idle-reap') {
    console.log(`ℹ ${line}`);
  } else if (result.verdict === 'ok') {
    console.log(
      `✓ healthy — uptime ${fmtDur(uptime)}, db ${sample.body?.checks?.database ?? '?'}, ` +
        `${sample.latencyMs}ms${result.events[0]?.type === 'baseline' ? ' (baseline)' : ''}`,
    );
  } else {
    // Non-alerting failure (below threshold) — visible, but not an incident.
    console.warn(`⚠ ${line} (below threshold ${opts.failureThreshold ?? DEFAULTS.failureThreshold})`);
  }
  return 0;
}

// Only run when invoked directly, so tests can import the pure helpers.
const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch((err) => {
      console.error(`✖ monitor error: ${err?.message ?? err}`);
      process.exit(2);
    });
}