#!/usr/bin/env node
/**
 * ─── Nong-Kati — lib/gate-reach.mjs ─────────────────────────────────────────
 * Prove the post-switch gate's database route, read-only, before a deploy
 * publishes anything.
 *
 * The gate writes fixture rows, so `certify_precondition` used to accept any
 * `TARGET_DATABASE_URL` that merely *parsed*. With the shop's MariaDB user
 * created `@localhost`, a URL pointing at a closed SSH forward parsed fine and
 * the deploy published before discovering the route was dead. This probe is the
 * missing proof: one `SELECT 1` on the same URL, exit 0 only if the server
 * answers as that user.
 *
 *   node scripts/lib/gate-reach.mjs          # exit 0 reachable · 1 unreachable · 2 no URL
 *
 * Output is `host:port/database` plus an error code — never the URL, the user or
 * the password. Error text is scrubbed of every form of the credential (raw and
 * percent-decoded) before it is printed, so a driver that quotes the DSN cannot
 * leak it.
 *
 * Env: TARGET_DATABASE_URL (required), GATE_REACH_TIMEOUT_MS (default 12000).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const URL_ENV = 'TARGET_DATABASE_URL';
const BUDGET_MS = Number(process.env.GATE_REACH_TIMEOUT_MS ?? 12000) || 12000;

const raw = (process.env[URL_ENV] ?? '').trim();
if (!raw) {
  console.error(`✖ ${URL_ENV} is not set — there is no route to prove.`);
  process.exit(2);
}

let parsed;
try {
  parsed = new URL(raw);
} catch {
  console.error(`✖ ${URL_ENV} does not parse as a URL — fix it with bash scripts/make-gate-env.sh.`);
  process.exit(2);
}

const host = parsed.hostname || '(no host)';
const port = parsed.port || '3306';
const database = (parsed.pathname || '').replace(/^\//, '') || '(no database)';
const shape = `${host}:${port}/${database}`;

// Any message printed below is built from `shape`; free text from the driver is
// scrubbed of these first. The probe's contract is names and lengths, never a value.
const credential = [
  raw,
  parsed.password ?? '',
  (() => {
    try {
      return decodeURIComponent(parsed.password ?? '');
    } catch {
      return '';
    }
  })(),
].filter(Boolean);

const scrub = (text) => {
  let out = String(text ?? '');
  for (const secret of credential) out = out.split(secret).join('<redacted>');
  return out.replace(/\s+/g, ' ').trim();
};

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: raw } } });

let timer;
const budget = new Promise((_, reject) => {
  timer = setTimeout(() => {
    const err = new Error(`no answer within ${BUDGET_MS} ms`);
    err.code = 'GATE_REACH_TIMEOUT';
    reject(err);
  }, BUDGET_MS);
});

try {
  await Promise.race([prisma.$queryRawUnsafe('SELECT 1 AS ok'), budget]);
  console.log(`✔ database route reachable — ${shape} (read-only SELECT 1, ${BUDGET_MS} ms budget)`);
  process.exit(0);
} catch (err) {
  const code = err?.code ?? err?.errorCode ?? err?.name ?? 'error';
  console.error(`✖ database route unreachable — ${shape} (${code})`);
  const detail = scrub(err?.message ?? err);
  if (detail) console.error(`  ${detail.slice(0, 240)}`);
  process.exit(1);
} finally {
  clearTimeout(timer);
}
