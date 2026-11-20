#!/usr/bin/env node
/**
 * scripts/postswitch-verify.mjs — the Phase 3 post-switch checklist in one command.
 *
 * WHY THIS EXISTS
 * After Plesk's Run Now pulls the bundle, four separate facts have to hold before the release can be
 * called live: the site must serve THIS build (buildId AND gitSha — a buildId alone passes on a
 * cached response), health must read healthy/database ok, the database-backed product route and the
 * homepage must both answer 200, and the app must stay healthy across four reads 30 s apart. Run as
 * separate curls by hand, one of those gets skipped or read too early.
 *
 * The stability half is the part that is easy to get wrong by hand. Passenger reaps an idle process
 * and respawns it on the next request, so a lone low `uptime` proves nothing — on 2026-11-17 the
 * failure was a reset that came back WITH `database: "error"`, and a 503 whose uptime cycled every
 * 25–90 s. So this script does not fail on a low uptime. It fails on a sample that is not healthy,
 * and on a reset whose new process reports a bad database; a healthy respawn is reported, not failed.
 *
 * Read-only: three GETs plus four health reads. It changes nothing, deploys nothing, writes nothing.
 *
 * Usage
 *   node scripts/postswitch-verify.mjs
 *   node scripts/postswitch-verify.mjs --build-id=p1gdRDC7zoBaF9SuN-LOX --git-sha=5a70a0e7
 *   node scripts/postswitch-verify.mjs --base=https://nongkatistore.com --reads=4 --interval=30
 *
 * Defaults name the bundle published to `deploy-artifact` on 2026-11-19 21:05 UTC (5a70a0e), so the
 * click needs no arguments; publishing a different bundle means passing --build-id.
 *
 * Exit: 0 the checklist passed · 1 a check failed (the verdict box names it) · 2 bad usage.
 */
import process from 'node:process';

const arg = (name, fallback = '') => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};

const HELP = [
  'Phase 3 post-switch checklist — one command, one verdict.',
  '',
  'Flags:',
  '  --base <url>        default https://nongkatistore.com',
  '  --build-id <id>     default hG0RHiUSkpldDxCrlAXQl (the published deploy-artifact bundle)',
  '  --git-sha <prefix>  default 5a70a0e7 (a prefix is enough; the id is 40 hex chars)',
  '  --reads <n>         stability reads, default 4',
  '  --interval <sec>    seconds between reads, default 30',
  '',
  'Exit: 0 passed / 1 failed / 2 bad usage. Read-only.',
].join('\n');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

const BASE = arg('base', 'https://nongkatistore.com').replace(/\/+$/, '');
const WANT_BUILD = arg('build-id', 'hG0RHiUSkpldDxCrlAXQl');
const WANT_SHA = arg('git-sha', '5a70a0e7').toLowerCase();
const READS = Number(arg('reads', '4'));
const INTERVAL = Number(arg('interval', '30'));
const TOLERANCE = 5; // seconds of poll jitter; uptime is read at two different instants

if (!BASE || !WANT_BUILD || !WANT_SHA) {
  console.error('usage: postswitch-verify.mjs [--base=<url>] [--build-id=<id>] [--git-sha=<prefix>]');
  process.exit(2);
}
if (!Number.isInteger(READS) || READS < 1 || READS > 20) {
  console.error(`✖ --reads must be an integer 1–20 (got ${arg('reads', '4')})`);
  process.exit(2);
}
if (!Number.isFinite(INTERVAL) || INTERVAL < 1 || INTERVAL > 300) {
  console.error(`✖ --interval must be 1–300 seconds (got ${arg('interval', '30')})`);
  process.exit(2);
}

// ── Reporting ────────────────────────────────────────────────────────────
const failures = [];
const warnings = [];
const ok = (msg) => console.log(`  ✔ ${msg}`);
const bad = (msg) => {
  failures.push(msg);
  console.log(`  ✖ ${msg}`);
};
const note = (msg) => {
  warnings.push(msg);
  console.log(`  ⚠ ${msg}`);
};
const step = (msg) => console.log(`\n▶ ${msg}`);
const fmt = (s) => (Number.isFinite(Number(s)) ? `${Number(s).toFixed(1)}s` : '?');

// ── Network ──────────────────────────────────────────────────────────────
async function get(path, { json = false } = {}) {
  const startedAt = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'cache-control': 'no-cache', accept: json ? 'application/json' : 'text/html' },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let body = null;
    if (json) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { status: res.status, body, bytes: text.length, ms: Date.now() - startedAt };
  } catch (error) {
    return {
      status: null,
      body: null,
      bytes: 0,
      ms: Date.now() - startedAt,
      error: error?.name === 'TimeoutError' ? 'request timed out' : String(error?.message ?? error),
    };
  }
}

const why = (res) => (res.status === null ? `unreachable — ${res.error}` : `HTTP ${res.status}`);

/** null when the sample proves the app healthy and talking to its database, else the reason. */
function healthProblem(res, label) {
  if (!res.body) return `${label}: no JSON body — ${why(res)}`;
  const status = res.body.status ?? 'unknown';
  const db = res.body.checks?.database ?? 'unknown';
  if (res.status !== 200) return `${label}: HTTP ${res.status} (status=${status}, database=${db})`;
  if (status !== 'healthy') return `${label}: status=${status} (database=${db})`;
  if (db !== 'ok') return `${label}: database=${db}`;
  return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── 1. Build identity ────────────────────────────────────────────────────
async function checkIdentity() {
  step('1/4 — build identity (/api/v1/version)');
  const res = await get(`/api/v1/version?cb=${Date.now()}${Math.random().toString(36).slice(2, 8)}`, {
    json: true,
  });
  if (!res.body) {
    bad(`version did not answer JSON — ${why(res)}`);
    return;
  }
  const served = String(res.body.buildId ?? '(no buildId field)');
  const sha = String(res.body.gitSha ?? '(no gitSha field)').toLowerCase();
  console.log(`    served: build ${served} · git ${sha.slice(0, 12)}… · v${res.body.version ?? '?'}`);
  if (served !== WANT_BUILD) {
    bad(`buildId is ${served}, expected ${WANT_BUILD} — the switch has not landed`);
  } else {
    ok(`buildId ${served} is live`);
  }
  // The sha matters on its own: a buildId can come from a cached page, the pair cannot.
  if (!sha.startsWith(WANT_SHA)) {
    bad(`gitSha is ${sha.slice(0, 12)}…, expected it to start ${WANT_SHA} — wrong commit serving`);
  } else {
    ok(`gitSha starts ${WANT_SHA}`);
  }
}

// ── 2. Health ────────────────────────────────────────────────────────────
async function checkHealth() {
  step('2/4 — health (/api/v1/health)');
  const res = await get(`/api/v1/health?cb=${Date.now()}`, { json: true });
  const problem = healthProblem(res, 'health');
  if (problem) bad(problem);
  else ok(`healthy · database ok · ${res.ms}ms · uptime ${fmt(res.body.checks?.uptime)}`);
}

// ── 3. Database-backed route and the homepage ────────────────────────────
async function checkRoutes() {
  step('3/4 — products and homepage');
  const products = await get(`/api/v1/products?cb=${Date.now()}`, { json: true });
  if (products.status !== 200) {
    bad(`/api/v1/products ${why(products)} — the app is not reaching its database`);
  } else {
    const total = products.body?.total;
    ok(`/api/v1/products 200${Number.isFinite(total) ? ` (${total} products)` : ''}`);
  }
  const home = await get(`/?cb=${Date.now()}`);
  if (home.status !== 200) bad(`/ ${why(home)}`);
  else if (home.bytes === 0) bad('/ answered 200 with an empty body');
  else ok(`/ 200 (${home.bytes} bytes)`);
}

// ── 4. Four reads, and the failure-coupled reset rule ────────────────────
async function checkStability() {
  step(`4/4 — stability: ${READS} health reads ${INTERVAL}s apart`);
  const startedAt = Date.now();
  const samples = [];
  for (let i = 0; i < READS; i += 1) {
    const due = startedAt + i * INTERVAL * 1000;
    if (due > Date.now()) await sleep(due - Date.now());
    const res = await get(`/api/v1/health?cb=${Date.now()}`, { json: true });
    const problem = healthProblem(res, `read ${i + 1}`);
    const at = Math.round((Date.now() - startedAt) / 1000);
    samples.push({
      at,
      uptime: Number(res.body?.checks?.uptime),
      db: res.body?.checks?.database ?? 'unknown',
      healthy: !problem,
    });
    if (problem) bad(`${problem} at +${at}s`);
    else ok(`+${at}s · database ok · uptime ${fmt(samples[i].uptime)}`);
  }

  // A reset is uptime going backwards. Failure-coupled = the new process is not healthy:
  // that is the 2026-11-17 symptom, and it means Replace the Secrets, never touch the database.
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const cur = samples[i];
    if (!(Number.isFinite(prev.uptime) && Number.isFinite(cur.uptime) && cur.uptime < prev.uptime - TOLERANCE)) {
      continue;
    }
    if (!cur.healthy) {
      bad(
        `failure-coupled reset at +${cur.at}s — uptime ${fmt(prev.uptime)} → ${fmt(cur.uptime)} with ` +
          `database=${cur.db} (Replace both Plesk Secrets; do not touch the database)`,
      );
    } else {
      note(
        `healthy respawn at +${cur.at}s — uptime restarted at ${fmt(cur.uptime)} with database ok ` +
          '(Passenger idle reap; not a failure on its own)',
      );
    }
  }

  // The climb: a clean window must show the process passing 90 s. A respawn resets that clock,
  // so after one the bar is that the new process kept ticking rather than looping.
  const fresh = samples.filter((s) => Number.isFinite(s.uptime));
  const maxUptime = fresh.length ? Math.max(...fresh.map((s) => s.uptime)) : NaN;
  let bestSpan = 0;
  let streakStart = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const cur = samples[i];
    if (Number.isFinite(prev.uptime) && Number.isFinite(cur.uptime) && cur.uptime < prev.uptime - TOLERANCE) {
      streakStart = i;
    }
    if (Number.isFinite(samples[i].uptime) && Number.isFinite(samples[streakStart].uptime)) {
      bestSpan = Math.max(bestSpan, samples[i].uptime - samples[streakStart].uptime);
    }
  }
  const respawned = warnings.some((w) => w.startsWith('healthy respawn'));
  const requiredSpan = respawned
    ? Math.min(2 * INTERVAL, (READS - 1) * INTERVAL)
    : (READS - 1) * INTERVAL - TOLERANCE;

  if (!Number.isFinite(maxUptime)) {
    bad('no usable uptime in any read — a live process cannot be told from a looping one');
  } else if (maxUptime >= 90 || bestSpan >= requiredSpan) {
    ok(`uptime reached ${fmt(maxUptime)}, climbing span ${fmt(bestSpan)}${respawned ? ' after the respawn' : ''}`);
  } else {
    bad(
      `uptime never climbed past 90s and no respawn explains it — ${fmt(fresh[0]?.uptime)} → ` +
        `${fmt(fresh[fresh.length - 1]?.uptime)} across ${READS} reads (a stuck or looping process)`,
    );
  }
  return { maxUptime, bestSpan };
}

// ── Verdict ──────────────────────────────────────────────────────────────
function verdict(summary, detail) {
  const line = '─'.repeat(78);
  console.log(`\n${line}`);
  if (failures.length) {
    console.log(' ❌ POST-SWITCH VERIFY FAILED — this release does not pass the checklist');
    console.log(line);
    for (const failure of failures) console.log(`  • ${failure}`);
    console.log('');
    console.log('  The shop is not proven on this release. Do not call it done.');
    console.log('  • `database: error` → Replace BOTH Plesk Secrets (DATABASE_URL, DATABASE_DIRECT_URL);');
    console.log('    the app is holding an old secret, and the database must not be touched.');
    console.log('  • buildId mismatch → the switch has not landed: run the Plesk task again, re-run this.');
    console.log('  Rollback if it cannot be made green: httpdocs/.next.old.');
  } else {
    console.log(` ✅ POST-SWITCH VERIFY PASSED — ${summary}`);
    console.log(line);
    console.log(`  build ${WANT_BUILD} · git ${WANT_SHA}… · healthy with database ok on ${READS} reads`);
    console.log(`  ${detail}`);
    console.log('');
    console.log('  Still owed before the phase closes — the 22-check certification:');
    console.log(`    gh workflow run postswitch-gate.yml --ref master -f build-id=${WANT_BUILD}`);
    console.log('    # check-only today (the repo has no POSTSWITCH_TARGET_DATABASE_URL): -f check-only=true');
  }
  console.log(line);
}

async function main() {
  console.log(`\nPost-switch verify — ${BASE}`);
  console.log(`  expecting build ${WANT_BUILD} from git ${WANT_SHA}…`);
  console.log(`  ${READS} stability reads ${INTERVAL}s apart · read-only, nothing is changed`);

  await checkIdentity();
  // A build that is not live has no stability to watch, and the reads would only cost 90 s.
  if (failures.length) {
    verdict('the build is not live yet, so the stability reads were skipped', '');
    return 1;
  }

  await checkHealth();
  await checkRoutes();
  const { maxUptime, bestSpan } = await checkStability();

  verdict(
    `${WANT_BUILD} is live and healthy`,
    `uptime reached ${fmt(maxUptime)}, span ${fmt(bestSpan)} over ${READS} reads ${INTERVAL}s apart` +
      (warnings.length ? ` (${warnings.length} healthy respawn noted)` : ''),
  );
  return failures.length ? 1 : 0;
}

// process.exitCode, not process.exit: exiting while fetch handles are still open trips a libuv
// assertion on Windows and replaces the exit code with 127.
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`✖ post-switch verify itself failed: ${error?.message ?? error}`);
    process.exitCode = 2;
  });
