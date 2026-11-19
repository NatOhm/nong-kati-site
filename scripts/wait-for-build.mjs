#!/usr/bin/env node
/**
 * scripts/wait-for-build.mjs — block until the live site serves a given BUILD_ID.
 *
 * A deploy artifact is only "published" when Plesk has pulled it AND Passenger has restarted onto
 * it; between the two the site keeps serving the previous build. Certifying that window would
 * certify the wrong release, so both the local deploy scripts and the CI gate wait for the build
 * they shipped. This is that wait, in one place, with a bounded timeout and a report that says what
 * was actually being served.
 *
 * Usage
 *   node scripts/wait-for-build.mjs --build-id=ZOptAHxrWCPUpaPYJc2L0 \
 *                                   --base=https://nongkatistore.com \
 *                                   --timeout=1800 [--interval=15]
 *
 * Exit: 0 the expected BUILD_ID is live · 1 timed out (prints what was served) · 2 bad usage.
 */
import process from 'node:process';

const arg = (name, fallback = '') => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};

const BASE = arg('base', process.env.POSTSWITCH_BASE_URL || '').replace(/\/+$/, '');
const WANT = arg('build-id', '').trim();
const TIMEOUT = Number(arg('timeout', '1800')) || 1800;
const INTERVAL = Number(arg('interval', '15')) || 15;

if (!BASE || !WANT) {
  console.error('usage: wait-for-build.mjs --build-id=<id> --base=<url> [--timeout=1800] [--interval=15]');
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const started = Date.now();
const deadline = started + TIMEOUT * 1000;
let attempt = 0;
let lastSeen = '(never answered)';
let lastError = '';

while (Date.now() < deadline) {
  attempt += 1;
  try {
    const res = await fetch(`${BASE}/api/v1/version`, {
      headers: { 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      lastError = `HTTP ${res.status}`;
    } else {
      const body = await res.json();
      lastSeen = String(body.buildId ?? '(no buildId field)');
      lastError = '';
      if (lastSeen === WANT) {
        const seconds = ((Date.now() - started) / 1000).toFixed(0);
        console.log(`✔ ${WANT} is live at ${BASE} after ${attempt} attempt(s), ${seconds}s`);
        process.exit(0);
      }
    }
  } catch (error) {
    lastError = error?.name === 'TimeoutError' ? 'request timed out' : String(error?.message ?? error);
  }
  // Say something every ~5 attempts so a CI log shows progress rather than a silent hang.
  if (attempt % 5 === 1) {
    console.log(`  … attempt ${attempt}: serving ${lastSeen}${lastError ? ` (${lastError})` : ''}, waiting for ${WANT}`);
  }
  await sleep(INTERVAL * 1000);
}

console.error(`✖ ${WANT} never went live at ${BASE} within ${TIMEOUT}s (${attempt} attempts).`);
console.error(`  last build served: ${lastSeen}${lastError ? ` (${lastError})` : ''}`);
console.error('  the artifact is published but not switched — check the Plesk deploy task, or that');
console.error('  Passenger restarted (Node.js → Restart App) if the pull succeeded.');
process.exit(1);
