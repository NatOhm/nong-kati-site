#!/usr/bin/env node
/**
 * scripts/stock-reconcile.mjs — READ-ONLY. Does the stock ledger agree with the stock counter?
 *
 * `ProductVariant.stock` is the number the shop sells from. `StockMove` is the audit trail that
 * explains how it got there. They can drift in three ways, and only one of them is harmless:
 *
 *   chain break      a move's `stockAfter` ≠ previous `stockAfter` + delta. Something wrote the
 *                    counter outside the ledger, or two writers raced. This is real drift.
 *   clamp            a void/sale drove the counter below zero, so the code recorded `delta: -n`
 *                    while `stockAfter = Math.max(stock - n, 0)`. Expected, documented, and the
 *                    reason Σ(delta) can sit a few units below `stock` (see App/api/admin/void
 *                    routes and AGENTS.md → "StockMove looking small is by design").
 *   stale tail       the newest move's `stockAfter` ≠ current `stock`. Either the latest movement
 *                    was never written, or the counter was edited afterwards. This is real drift.
 *
 * The 2026-11-16 investigation of "why are there only 27 stock moves?" was done by hand in
 * phpMyAdmin; this script is that afternoon compressed into one command. It answers per variant:
 * moves, Σ(delta), the replayed chain, clamps, and whether the last entry matches the counter.
 *
 * Usage:
 *   node scripts/stock-reconcile.mjs              # human report, exit 1 on real drift
 *   node scripts/stock-reconcile.mjs --json       # same data as JSON
 *   node scripts/stock-reconcile.mjs --variant=<id>   # one variant, verbose
 *
 * Needs DATABASE_URL in the environment (on the host: the documented
 * `npm explore next -- node --env-file=… scripts/stock-reconcile.mjs` path). It never writes:
 * every query is a findMany, so it is safe to point at production.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const VARIANT = (argv.find((a) => a.startsWith('--variant=')) || '').slice('--variant='.length) || null;

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(
    [
      'stock-reconcile — compare StockMove against ProductVariant.stock (read-only)',
      '',
      '  --json              machine-readable report',
      '  --variant=<id>      only this variant (shows every move)',
      '  --help              this text',
      '',
      'Tunnel (optional, same variables the post-switch gate uses):',
      '  PLESK_SSH_KEY       private key → opens ssh -N -L to the host, which is the',
      '                      only place the shop user may log in from. Defaults to',
      '                      ~/.ssh/plesk_ci (the file the gate workflow materialises)',
      '                      when PLESK_SSH_HOST is set.',
      '  PLESK_SSH_HOST      e.g. thsv93.hostatom.com',
      '  PLESK_SSH_USER      default nongka',
      '  PLESK_SSH_BIN       ssh client path, default ssh',
      '',
      'Exit: 0 consistent · 1 real drift · 2 cannot run (no DATABASE_URL / tunnel / DB unreachable)',
    ].join('\n'),
  );
  process.exit(0);
}

const die = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(2);
};

/* ─── Optional SSH tunnel ───────────────────────────────────────────────────
 * The shop's MariaDB listens on the host's loopback only — Plesk creates the
 * user `@localhost`, so this workstation is refused even though port 3306 is
 * open (measured 2026-11-16). `scripts/ci-postswitch-gate.sh` already solves
 * that with a tunnel keyed on PLESK_SSH_KEY; this script reads the same three
 * variables, so the reconciliation does not have to be run on the host.
 * Nothing here is written to disk and no secret is printed: the URL keeps its
 * credentials, only the host and port it dials are rewritten.
 */
const SSH_HOST = process.env.PLESK_SSH_HOST || '';
// The gate's key is a CI secret that workflow writes to `$HOME/.ssh/plesk_ci` and
// then names in PLESK_SSH_KEY (postswitch-gate.yml). Same filename here, so a
// workstation holding that file needs no extra wiring — but only when a host is
// named, never just because a stray file exists.
const CI_KEY_PATH = join(homedir(), '.ssh', 'plesk_ci');
const SSH_KEY =
  process.env.PLESK_SSH_KEY || (SSH_HOST && existsSync(CI_KEY_PATH) ? CI_KEY_PATH : '');
const SSH_USER = process.env.PLESK_SSH_USER || 'nongka';
// Only for hosts where the client is not on PATH (and for exercising the
// forward without a key); everything normal keeps plain `ssh`.
const SSH_BIN = process.env.PLESK_SSH_BIN || 'ssh';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const portAccepts = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });

/**
 * Pure: what to forward, and the URL to dial once it is up. A loopback URL means
 * "the database on the host itself"; anything else forwards to where it points.
 */
export function tunnelPlan(targetUrl, { key, host, user, port }) {
  const parsed = new URL(targetUrl);
  const remoteHost = LOOPBACK.has(parsed.hostname) ? '127.0.0.1' : parsed.hostname;
  const remotePort = parsed.port || '3306';
  const forwarded = new URL(targetUrl);
  forwarded.hostname = '127.0.0.1';
  forwarded.port = String(port);
  return {
    username: user,
    destination: `${user}@${host}`,
    forward: `127.0.0.1:${port}:${remoteHost}:${remotePort}`,
    remote: `${remoteHost}:${remotePort}`,
    url: forwarded.href,
    args: [
      '-i', key,
      // BatchMode: a missing/mistrusted key must fail, not prompt inside a script.
      '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ExitOnForwardFailure=yes',
      '-N',
      '-L', `127.0.0.1:${port}:${remoteHost}:${remotePort}`,
      `${user}@${host}`,
    ],
  };
}

/** Opens the forward and waits for it to answer; throws with ssh's own words. */
async function openTunnel(targetUrl) {
  if (!SSH_KEY) return { url: targetUrl, close: () => {} };
  if (!SSH_HOST) die('PLESK_SSH_KEY is set but PLESK_SSH_HOST is not.');

  const parsed = new URL(targetUrl);
  if (!/^mysqls?:$/.test(parsed.protocol)) {
    die(`PLESK_SSH_KEY is set, so DATABASE_URL must be a mysql:// URL — got ${parsed.protocol}//…`);
  }
  const localPort = await freePort();
  const plan = tunnelPlan(targetUrl, {
    key: SSH_KEY,
    host: SSH_HOST,
    user: SSH_USER,
    port: localPort,
  });

  const child = spawn(SSH_BIN, plan.args, { stdio: ['ignore', 'ignore', 'pipe'] });

  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-800);
  });
  let spawnError = null;
  child.once('error', (error) => {
    spawnError = error;
  });

  const close = () => {
    if (!child.killed) child.kill();
  };
  // A script that dies between here and disconnect must not leave ssh behind.
  process.once('exit', close);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      close();
      process.exit(130);
    });
  }

  const deadline = Date.now() + 15_000;
  for (;;) {
    if (spawnError) {
      close();
      die(`cannot run ssh: ${spawnError.message}. Is an OpenSSH client on PATH?`);
    }
    if (child.exitCode !== null) {
      close();
      // The two failures that look identical from here have different fixes, so
      // say which one this is instead of leaving a bare "Permission denied".
      const hint = /Permission denied \(publickey/i.test(stderr)
        ? '\n  ssh reached the host and refused the key: Plesk → Websites & Domains → SSH Access'
          + ' must be enabled, and the public half of PLESK_SSH_KEY must be in that account\'s'
          + ' ~/.ssh/authorized_keys.'
        : '';
      die(`the SSH tunnel died (ssh exit ${child.exitCode}): ${stderr.trim() || 'no output'}${hint}`);
    }
    if (await portAccepts(localPort)) break;
    if (Date.now() > deadline) {
      close();
      die(`the tunnel never answered on 127.0.0.1:${localPort} — ssh is up but the forward is not (${stderr.trim() || 'no output'})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.error(`  tunnel   : 127.0.0.1:${localPort} → ${plan.destination} ${plan.remote}`);

  return { url: plan.url, close };
}

/**
 * Pure reconciliation — no database, no I/O, so it can be exercised against a captured export.
 * `moves` must be in `createdAt` order (the caller sorts; ties break on id).
 */
export function reconcile({ variants, moves }) {
  const byVariant = new Map();
  for (const v of variants) {
    byVariant.set(v.id, {
      id: v.id,
      label: v.label ?? '',
      product: v.product ?? null,
      stock: Number(v.stock ?? 0),
      moves: [],
    });
  }
  for (const m of moves) {
    const bucket = byVariant.get(m.variantId);
    // A move whose variant is gone means the FK was violated or the export is partial.
    if (!bucket) continue;
    bucket.moves.push({
      id: m.id,
      delta: Number(m.delta ?? 0),
      stockAfter: Number(m.stockAfter ?? 0),
      reason: m.reason ?? '',
      createdAt: m.createdAt,
    });
  }

  const rows = [];
  const breaks = [];

  for (const v of byVariant.values()) {
    let prev = 0; // the counter before the first recorded move
    let sumDelta = 0;
    let clamps = 0;
    let chainBreaks = 0;

    for (const m of v.moves) {
      const expected = prev + m.delta;
      sumDelta += m.delta;
      if (expected !== m.stockAfter) {
        if (expected < 0 && m.stockAfter === 0) {
          // Recorded as -n, applied as "down to zero": the documented clamp.
          clamps += 1;
        } else {
          chainBreaks += 1;
          breaks.push({
            variantId: v.id,
            moveId: m.id,
            at: m.createdAt,
            previous: prev,
            delta: m.delta,
            expected,
            recorded: m.stockAfter,
            reason: m.reason,
          });
        }
      }
      prev = m.stockAfter;
    }

    const lastStockAfter = v.moves.length ? v.moves[v.moves.length - 1].stockAfter : null;
    const hasMoves = v.moves.length > 0;
    // Σ(delta) ≠ stock is expected exactly when clamps ate the difference.
    const shortfall = hasMoves ? sumDelta - v.stock : 0;

    rows.push({
      id: v.id,
      label: v.label,
      product: v.product,
      stock: v.stock,
      moves: v.moves.length,
      sumDelta,
      lastStockAfter,
      clamps,
      chainBreaks,
      // true when the ledger tail and the counter agree (the authoritative comparison)
      tailMatchesCounter: hasMoves ? lastStockAfter === v.stock : null,
      // true when there is no Σ(delta) gap, or the gap is exactly what clamps ate
      shortfallExplainedByClamps: hasMoves ? shortfall === 0 || shortfall === -clamps : null,
      shortfall,
      firstMoveAt: hasMoves ? v.moves[0].createdAt : null,
      lastMoveAt: hasMoves ? v.moves[v.moves.length - 1].createdAt : null,
      moveList: v.moves,
    });
  }

  const withMoves = rows.filter((r) => r.moves > 0);
  const drift = rows.filter((r) => r.chainBreaks > 0 || r.tailMatchesCounter === false);
  const unexplained = withMoves.filter((r) => !r.shortfallExplainedByClamps);
  const stockWithoutLedger = rows.filter((r) => r.moves === 0 && r.stock !== 0);

  return {
    totals: {
      variants: rows.length,
      variantsWithMoves: withMoves.length,
      moves: moves.length,
      clamps: rows.reduce((a, r) => a + r.clamps, 0),
      chainBreaks: rows.reduce((a, r) => a + r.chainBreaks, 0),
      tailMismatch: withMoves.filter((r) => r.tailMatchesCounter === false).length,
      ledgerShortfall: withMoves.filter((r) => r.shortfall !== 0).length,
      unexplainedShortfall: unexplained.length,
      stockWithoutLedger: stockWithoutLedger.length,
      firstMoveAt: withMoves.length ? withMoves.map((r) => r.firstMoveAt).sort()[0] : null,
      lastMoveAt: withMoves.length ? withMoves.map((r) => r.lastMoveAt).sort().at(-1) : null,
    },
    rows,
    drift: drift.map((r) => ({
      id: r.id,
      label: r.label,
      stock: r.stock,
      lastStockAfter: r.lastStockAfter,
      chainBreaks: r.chainBreaks,
    })),
    unexplained: unexplained.map((r) => ({
      id: r.id,
      label: r.label,
      stock: r.stock,
      sumDelta: r.sumDelta,
      clamps: r.clamps,
      shortfall: r.shortfall,
    })),
    stockWithoutLedger: stockWithoutLedger.map((r) => ({ id: r.id, label: r.label, stock: r.stock })),
    breaks,
    // Real drift = a broken chain or a tail that disagrees with the counter. Clamps are expected.
    consistent: drift.length === 0 && unexplained.length === 0,
  };
}

const short = (id) => String(id ?? '').slice(-6);

export function printReport(report) {
  const t = report.totals;
  const say = (mark, label, value) => console.log(`  ${mark} ${label.padEnd(24)} ${value}`);

  console.log('StockMove ⇄ ProductVariant.stock — read-only reconciliation');
  if (t.moves === 0) {
    console.log('  (no stock moves recorded)');
  } else {
    say('·', 'moves', `${t.moves} across ${t.variantsWithMoves} variant(s)`);
    say('·', 'window', `${t.firstMoveAt} → ${t.lastMoveAt}`);
  }
  say(t.chainBreaks === 0 ? '✔' : '✖', 'chain breaks', t.chainBreaks);
  say('✔', 'clamped voids', `${t.clamps} (delta recorded below zero, counter held at 0)`);
  say(t.tailMismatch === 0 ? '✔' : '✖', 'tail ≠ counter', t.tailMismatch);
  say(
    t.unexplainedShortfall === 0 ? '✔' : '✖',
    'ledger ≠ counter',
    `${t.ledgerShortfall} variant(s)${t.ledgerShortfall ? `; unexplained: ${t.unexplainedShortfall}` : ''}`,
  );
  if (t.stockWithoutLedger) {
    say('⚠', 'stock, no history', `${t.stockWithoutLedger} variant(s) — never logged a move`);
  }

  const interesting = report.rows.filter(
    (r) => VARIANT ? r.id === VARIANT : r.moves > 0 || r.stock !== 0,
  );
  if (interesting.length) {
    console.log('\n  variant    moves  Σdelta  lastAfter  stock  clamps  chain');
    for (const r of interesting) {
      console.log(
        `  ${short(r.id)}  ${String(r.moves).padStart(5)}  ${String(r.sumDelta).padStart(6)}  ` +
          `${String(r.lastStockAfter ?? '—').padStart(9)}  ${String(r.stock).padStart(5)}  ` +
          `${String(r.clamps).padStart(6)}  ${r.chainBreaks === 0 ? '✔' : '✖'}`,
      );
    }
  }

  if (VARIANT) {
    for (const r of report.rows.filter((x) => x.id === VARIANT)) {
      console.log(`\n  ${r.product ? `${r.product} · ` : ''}${r.label} (${r.id})`);
      for (const m of r.moveList) {
        console.log(`    ${m.createdAt}  ${String(m.delta).padStart(4)} → ${String(m.stockAfter).padStart(4)}  ${m.reason}`);
      }
    }
  }

  for (const b of report.breaks) {
    console.log(
      `\n  ✖ ${short(b.variantId)} at ${b.at}: previous ${b.previous} + ${b.delta} = ${b.expected}, ` +
        `recorded ${b.recorded} (${b.reason})`,
    );
  }
  for (const u of report.unexplained) {
    console.log(
      `\n  ✖ ${short(u.id)} ${u.label}: Σ(delta) ${u.sumDelta} vs stock ${u.stock} ` +
        `— ${u.shortfall} off, and ${u.clamps} clamp(s) do not explain it`,
    );
  }
  for (const s of report.stockWithoutLedger) {
    console.log(`\n  ⚠ ${short(s.id)} ${s.label}: stock ${s.stock} with no StockMove history`);
  }

  console.log(`\nRESULT: ${report.consistent ? 'consistent' : 'DRIFT'}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    die(
      'DATABASE_URL is not set — this script reads the live schema, it cannot guess it.\n' +
        '  On the host: npm explore next -- node --env-file=/var/www/vhosts/nongkatistore.com/httpdocs/tmp/nk6/gate.env …/scripts/stock-reconcile.mjs',
    );
  }

  const tunnel = await openTunnel(process.env.DATABASE_URL);
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: tunnel.url } } });
  try {
    // Read-only by construction: two findMany calls, no writes anywhere in this file.
    const variants = await prisma.productVariant.findMany({
      select: {
        id: true,
        label: true,
        stock: true,
        product: { select: { name: true } },
      },
    });
    const moves = await prisma.stockMove.findMany({
      select: {
        id: true,
        variantId: true,
        delta: true,
        stockAfter: true,
        reason: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const report = reconcile({
      variants: variants.map((v) => ({ ...v, product: v.product?.name ?? null })),
      moves,
    });

    if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
    else printReport(report);

    process.exitCode = report.consistent ? 0 : 1;
  } catch (err) {
    die(`query failed: ${err?.message ?? err}`);
  } finally {
    await prisma.$disconnect().catch(() => {});
    tunnel.close();
  }
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) await main();
