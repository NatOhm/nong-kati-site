/**
 * Production health monitor gates (Oct 3, 2026).
 *
 * The Oct 3 deploy surfaced an unexplained restart: /api/v1/health reported
 * `uptime: 7s` with no deploy, no panel restart, and an empty Apache
 * error_log. Investigation proved there are two distinct causes that look
 * identical from uptime alone:
 *
 *   • IDLE REAP (expected) — Plesk/Passenger reaps the idle Node process and
 *     respawns it on the next request. Uptime NEVER resets during continuous
 *     traffic, and ALWAYS resets after a multi-minute gap.
 *   • UNEXPECTED RESTART — an uptime reset while the app was recently polled,
 *     i.e. it died on its own while in use.
 *
 * scripts/monitor-health.mjs exists to tell those apart and to page someone
 * when the second one happens. The classifier is the whole value of the tool,
 * so it is pinned here rather than left to a smoke test.
 *
 *  G1 — first ever run records a baseline and never alerts. Alerting on "no
 *       previous state" would make every fresh deploy look like an incident.
 *  G2 — an uptime reset after a long idle gap is an idle reap: recorded,
 *       NOT alerted. This is the case that cried wolf all afternoon.
 *  G3 — an uptime reset while the app was recently active IS an alert.
 *  G4 — uptime jitter within tolerance is not a restart. Two reads happen at
 *       different instants, so uptime never rises by exactly the elapsed time.
 *  G5 — a single failure never alerts; `failureThreshold` consecutive ones do.
 *       One dropped request during a restart is not an outage.
 *  G6 — CLI flags actually reach their option keys. `--state` silently landing
 *       on `state` instead of `statePath` shipped once already: the monitor
 *       wrote to the default path and looked like it had worked.
 *  G7 — corrupt/missing state degrades to a re-baseline, never a hard failure.
 *       A monitor that stops because its state file is ugly stops monitoring.
 *  G8 — the scheduled workflow exists and is wired to this script, so the
 *       monitoring cannot be deleted silently by a refactor.
 *  G9 — every third-party action is pinned to a full 40-hex commit SHA. The
 *       monitor's first-ever run failed in 2s because `actions/cache` was
 *       pinned to a well-formed but NON-EXISTENT SHA, so the job could not
 *       even start. A real SHA cannot be verified offline, so this gate does
 *       the half that is checkable without the network (no floating tags) and
 *       `scripts/verify-action-pins.sh` does the other half against the API.
 */
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { evaluateSample, parseArgs, readState, writeState } from '../scripts/monitor-health.mjs';

const WORKFLOW = path.join(process.cwd(), '.github/workflows/prod-health-monitor.yml');

/** A healthy sample with the given process uptime. */
function healthy(uptime: number, over: Partial<{ httpStatus: number; database: string }> = {}) {
  return {
    ok: true,
    httpStatus: over.httpStatus ?? 200,
    body: { status: 'healthy', checks: { uptime, database: over.database ?? 'ok' } },
    error: null,
    latencyMs: 12,
  };
}

const T0 = 1_700_000_000_000; // fixed clock; the classifier never reads Date.now()
const MIN = 60_000;

describe('G1 — first run baselines instead of alerting', () => {
  it('records a baseline when there is no previous state', () => {
    const res = evaluateSample({ prev: null, sample: healthy(42), now: T0 });
    expect(res.verdict).toBe('ok');
    expect(res.shouldAlert).toBe(false);
    expect(res.events[0]?.type).toBe('baseline');
  });

  it('re-baselines when previous state exists but carries no uptime', () => {
    const res = evaluateSample({
      prev: { lastCheckAt: T0 - MIN, lastUptime: null },
      sample: healthy(10),
      now: T0,
    });
    expect(res.shouldAlert).toBe(false);
    expect(res.verdict).toBe('ok');
  });
});

describe('G2 — an uptime reset after idling is the expected reap', () => {
  it('classifies a reset after a long gap as idle-reap and does NOT alert', () => {
    const res = evaluateSample({
      prev: { lastCheckAt: T0 - 9 * MIN, lastUptime: 3600 },
      sample: healthy(4), // fresh process
      now: T0,
    });
    expect(res.verdict).toBe('idle-reap');
    expect(res.shouldAlert).toBe(false);
    expect(res.events[0]).toMatchObject({ type: 'idle-reap', previousUptime: 3600, uptime: 4 });
  });

  it('honours a raised idleReapSeconds threshold', () => {
    const sample = { prev: { lastCheckAt: T0 - 4 * MIN, lastUptime: 900 }, sample: healthy(3), now: T0 };
    expect(evaluateSample({ ...sample, opts: { idleReapSeconds: 180 } }).verdict).toBe('idle-reap');
    // Same evidence, but the operator insists 4 minutes is "active".
    expect(evaluateSample({ ...sample, opts: { idleReapSeconds: 600 } }).shouldAlert).toBe(true);
  });
});

describe('G3 — an uptime reset while active is a real alert', () => {
  it('alerts when the app restarts seconds after the last check', () => {
    const res = evaluateSample({
      prev: { lastCheckAt: T0 - 20_000, lastUptime: 500 },
      sample: healthy(6),
      now: T0,
    });
    expect(res.verdict).toBe('restart');
    expect(res.shouldAlert).toBe(true);
    expect(res.events[0]).toMatchObject({ type: 'restart', previousUptime: 500, uptime: 6 });
  });

  it('alerts on a reset in the gap just under the idle threshold', () => {
    const res = evaluateSample({
      prev: { lastCheckAt: T0 - 2 * MIN, lastUptime: 500 },
      sample: healthy(5),
      now: T0,
    });
    expect(res.shouldAlert).toBe(true);
  });
});

describe('G4 — jitter is not a restart', () => {
  it('treats a small uptime dip inside tolerance as healthy', () => {
    // 600.0 -> 598.0 is a 2s dip with a 5s tolerance: measurement skew, not a crash.
    const res = evaluateSample({
      prev: { lastCheckAt: T0 - 60_000, lastUptime: 600 },
      sample: healthy(598),
      now: T0,
    });
    expect(res.verdict).toBe('ok');
    expect(res.shouldAlert).toBe(false);
  });

  it('stays healthy while uptime climbs', () => {
    const res = evaluateSample({
      prev: { lastCheckAt: T0 - 60_000, lastUptime: 600 },
      sample: healthy(660),
      now: T0,
    });
    expect(res.verdict).toBe('ok');
    expect(res.events).toHaveLength(0);
  });
});

describe('G5 — failures need to persist before they alert', () => {
  it('does not alert on the first unreachable check but does on the third', () => {
    const sample = { ok: false, httpStatus: null, body: null, error: 'fetch failed', latencyMs: 15000 };

    const first = evaluateSample({ prev: { consecutiveFailures: 0 }, sample, now: T0 });
    expect(first.shouldAlert).toBe(false);
    expect(first.events[0]).toMatchObject({ type: 'unreachable', consecutiveFailures: 1 });

    const second = evaluateSample({ prev: { consecutiveFailures: 1 }, sample, now: T0 });
    expect(second.shouldAlert).toBe(false);

    const third = evaluateSample({ prev: { consecutiveFailures: 2 }, sample, now: T0 });
    expect(third.shouldAlert).toBe(true);
    expect(third.verdict).toBe('unreachable');
  });

  it('treats a 503 / database error as unhealthy with the same threshold', () => {
    const sick = healthy(100, { httpStatus: 503, database: 'error' });

    const first = evaluateSample({ prev: { consecutiveFailures: 0 }, sample: sick, now: T0 });
    expect(first.shouldAlert).toBe(false);
    expect(first.events[0]).toMatchObject({ type: 'unhealthy', httpStatus: 503, database: 'error' });

    const third = evaluateSample({ prev: { consecutiveFailures: 2 }, sample: sick, now: T0 });
    expect(third.shouldAlert).toBe(true);
  });

  it('does not alert when healthy but the body carries no uptime field', () => {
    const res = evaluateSample({
      prev: { lastCheckAt: T0 - MIN, lastUptime: 10 },
      sample: {
        ok: true,
        httpStatus: 200,
        body: { status: 'healthy', checks: {} },
        error: null,
        latencyMs: 9,
      },
      now: T0,
    });
    expect(res.shouldAlert).toBe(false);
    expect(res.events[0]?.type).toBe('no-uptime-field');
  });
});

describe('G6 — CLI flags reach the right option keys', () => {
  it('maps --state to statePath and --history to historyPath', () => {
    const opts = parseArgs(['--state', 'a.json', '--history', 'b.ndjson']);
    expect(opts.statePath).toBe('a.json');
    expect(opts.historyPath).toBe('b.ndjson');
  });

  it('maps the kebab-case flags onto their camelCase options', () => {
    const opts = parseArgs([
      '--health-path',
      '/api/v1/health',
      '--timeout-ms',
      '9000',
      '--idle-reap-seconds',
      '120',
      '--failure-threshold',
      '5',
      '--webhook',
      'https://example.invalid/hook',
    ]);
    expect(opts.healthPath).toBe('/api/v1/health');
    expect(opts.timeoutMs).toBe('9000');
    expect(opts.idleReapSeconds).toBe('120');
    expect(opts.failureThreshold).toBe('5');
    expect(opts.webhook).toBe('https://example.invalid/hook');
  });

  it('falls back to the documented defaults when no flags are passed', () => {
    const opts = parseArgs([]);
    expect(opts.url).toBe('https://nongkatistore.com');
    expect(opts.idleReapSeconds).toBe(180);
    expect(opts.failureThreshold).toBe(3);
  });
});

describe('G7 — state I/O survives a missing or corrupt file', () => {
  let dir = '';

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'nk-health-'));
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips state through disk', () => {
    const file = path.join(dir, 'state.json');
    writeState(file, { lastUptime: 12, lastVerdict: 'ok' });
    expect(readState(file)).toMatchObject({ lastUptime: 12, lastVerdict: 'ok' });
  });

  it('returns null for a missing file and for garbage, never throwing', () => {
    expect(readState(path.join(dir, 'nope.json'))).toBeNull();

    const corrupt = path.join(dir, 'corrupt.json');
    writeFileSync(corrupt, '{not json at all', 'utf-8');
    expect(readState(corrupt)).toBeNull();
  });
});

describe('G8 — the scheduled monitor cannot be deleted silently', () => {
  let workflow = '';

  beforeAll(() => {
    if (existsSync(WORKFLOW)) workflow = readFileSync(WORKFLOW, 'utf-8');
  });

  it('exists and runs on a schedule', () => {
    expect(workflow).not.toBe('');
    expect(workflow).toMatch(/schedule:/);
    expect(workflow).toMatch(/cron:/);
  });

  it('invokes the monitor script it is supposed to be monitoring', () => {
    expect(workflow).toContain('scripts/monitor-health.mjs');
  });

  it('keeps a healthchecks.io ping wired as a dead-man switch', () => {
    // The check can be green while the SCHEDULE is dead (cron disabled, repo
    // paused, Actions quota exhausted). Only an external watchdog notices that.
    expect(workflow).toMatch(/healthchecks\.io/);
  });
});

describe('G9 — action pins cannot be floating tags', () => {
  it('pins every `uses:` in every workflow to a full commit SHA', () => {
    const dir = path.join(process.cwd(), '.github/workflows');
    const files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    expect(files.length).toBeGreaterThan(0);

    const unpinned: string[] = [];
    for (const file of files) {
      for (const line of readFileSync(path.join(dir, file), 'utf-8').split('\n')) {
        const ref = line.match(/uses:\s*(\S+)/)?.[1];
        if (ref === undefined) continue;
        if (ref.startsWith('./') || ref.startsWith('docker://')) continue;
        // Anchored at BOTH ends on purpose. The pin that actually broke this
        // monitor was 41 hex chars, so an unanchored /@[0-9a-f]{40}/ would have
        // matched its first 40 and passed a ref that cannot resolve.
        if (!/@[0-9a-f]{40}$/.test(ref)) unpinned.push(`${file}: ${ref}`);
      }
    }
    // A tag like `actions/cache@v4` is a supply-chain hole; a typo'd SHA is
    // what actually broke this monitor. Both are caught by the same shape.
    expect(unpinned).toEqual([]);
  });
});