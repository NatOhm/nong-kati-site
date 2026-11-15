#!/usr/bin/env node
/**
 * scripts/cutover-window.mjs — the pre-switch half of docs/PLESK-CUTOVER.md §3, in order.
 *
 * The dangerous part of a cutover is not any single command, it is running them out of
 * order — an ETL before a verified backup, a build before the data exists, a gate before the
 * build. This script runs the sequence the runbook prescribes and refuses to continue past a
 * failure, so "did we actually do it in the right order" stops being a memory question.
 *
 * The ETL step empties every target table before copying, so the app must already be stopped
 * when this runs — the driver does not stop it and cannot tell whether you did.
 *
 * What it does NOT do: it never touches the running shop. Stopping the app, writing the two
 * DATABASE_URL panel variables, restarting, and the real Slip2Go slip stay human steps
 * (runbook §3 Steps 3 and 6–7). Everything here is idempotent or read-only against the source.
 *
 * Usage
 *   TARGET_DATABASE_URL="mysql://nk_app:…@127.0.0.1:3307/nong_kati" \
 *     node scripts/cutover-window.mjs --yes
 *
 *   --yes                 required for a non-loopback target (this writes to a real database)
 *   --skip-backup         the backup+verify step (only when a verified fresh backup already exists)
 *   --skip-etl            schema only (target already has the data)
 *   --skip-images         skip scripts/extract-images-to-files.mjs --apply
 *   --skip-build          skip `npm run build` (the gate needs a build of the target schema)
 *   --skip-check          skip the 32-check gate
 *   --backup-dir=DIR      where backup-supabase-db.mjs should write (default: ./db-backups)
 *   --from=STEP           start at a named step (backup|schema|etl|verify|images|build|check)
 *   --allow-dirty         let the window run from a dirty working tree (not advised)
 *
 * Every step prints the exact command it runs, its duration and its exit code, and the run
 * stops at the first non-zero exit with the rollback pointer for that point.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const arg = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};

function readDotenv() {
  const out = {};
  for (const file of ['.env.local', '.env']) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !(m[1] in out)) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

const dotenv = readDotenv();
const TARGET = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL_TARGET || '';
const BACKUP_DIR = path.resolve(arg('backup-dir', path.join(ROOT, 'db-backups')));
const FROM = arg('from', null);
const STEPS = ['backup', 'schema', 'etl', 'verify', 'images', 'build', 'check'];

if (!TARGET) {
  console.error('✖ TARGET_DATABASE_URL is required (mysql://user:pass@host:3306/nong_kati)');
  process.exit(2);
}
if (!/^mysql:\/\//i.test(TARGET)) {
  console.error(`✖ TARGET_DATABASE_URL must be a mysql:// URL — got ${TARGET.split('://')[0]}://…`);
  console.error('  Postgres is the source, never the target.');
  process.exit(2);
}
if (/supabase|pooler/i.test(TARGET)) {
  console.error('✖ refusing a Supabase target: this writes into the database it points at');
  process.exit(2);
}
const loopback = /@(127\.0\.0\.1|localhost|\[::1\])(:|\/)/.test(TARGET);
if (!loopback && !flag('yes')) {
  console.error('✖ target is not loopback. Re-run with --yes once the window is actually open.');
  console.error('  This is the acknowledgement that production is being changed, not a formality.');
  process.exit(2);
}
if (FROM && !STEPS.includes(FROM)) {
  console.error(`✖ --from must be one of: ${STEPS.join(', ')}`);
  process.exit(2);
}

// Working tree: a window run from uncommitted code makes "which build is live" unanswerable.
const status = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
const dirty = (status.stdout || '').trim();
if (dirty && !flag('allow-dirty')) {
  console.error('✖ the working tree is dirty — commit or stash first (or pass --allow-dirty):');
  console.error(dirty.split('\n').slice(0, 5).map((l) => `   ${l}`).join('\n'));
  process.exit(2);
}

const run = (label, command, args, env = {}) => {
  const started = Date.now();
  console.log(`\n▶ ${label}`);
  console.log(`  $ ${command} ${args.join(' ')}`.replace(/:([^:@/]+)@/g, ':***@'));
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.status !== 0) {
    console.error(`\n✖ ${label} failed (exit ${result.status ?? 'signal'}) after ${seconds}s — stopping here.`);
    console.error('  Nothing has been switched. See docs/PLESK-CUTOVER.md §4 Rollback A.');
    process.exit(result.status || 1);
  }
  console.log(`  ✔ ${label} (${seconds}s)`);
};

const stepEnabled = (step) => {
  if (FROM && STEPS.indexOf(step) < STEPS.indexOf(FROM)) return false;
  if (step === 'backup' && flag('skip-backup')) return false;
  if (step === 'etl' && flag('skip-etl')) return false;
  if (step === 'images' && flag('skip-images')) return false;
  if (step === 'build' && flag('skip-build')) return false;
  if (step === 'check' && flag('skip-check')) return false;
  return true;
};

const envForTarget = {
  DATABASE_URL: TARGET,
  DATABASE_DIRECT_URL: TARGET,
};

// Windows has no bare `npx`/`npm` executable (they are .cmd shims) and spawnSync does not go
// through a shell, so the CLIs are invoked as JS entry points instead — same tools, no shell.
const PRISMA_CLI = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');
const NEXT_CLI = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
const STAMP_SCRIPT = path.join(ROOT, 'scripts', 'stamp-git-sha.mjs');
for (const [label, file] of [['prisma', PRISMA_CLI], ['next', NEXT_CLI]]) {
  if (!fs.existsSync(file)) {
    console.error(`✖ ${label} CLI not found at ${file} — run npm ci first`);
    process.exit(2);
  }
}

console.log('Cutover pre-switch sequence — docs/PLESK-CUTOVER.md §3');
console.log(`target: ${TARGET.replace(/\/\/[^@]*@/, '//***@')}`);
console.log(`steps:  ${STEPS.filter(stepEnabled).join(' → ') || '(none)'}`);

// ── 1. backup + verify ─────────────────────────────────────────────────────
if (stepEnabled('backup')) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const before = new Set(fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.dump')));
  run('backup the source database', process.execPath, ['scripts/backup-supabase-db.mjs', `--out-dir=${BACKUP_DIR}`]);
  const fresh = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.dump') && !before.has(f));
  if (fresh.length !== 1) {
    console.error(`✖ expected exactly one new dump in ${BACKUP_DIR}, found ${fresh.length}`);
    process.exit(1);
  }
  const dump = path.join(BACKUP_DIR, fresh[0]);
  run('verify the backup restores', process.execPath, ['scripts/verify-supabase-backup.mjs', `--dump=${dump}`]);
}

// ── 2. schema on the target ────────────────────────────────────────────────
if (stepEnabled('schema')) {
  run('apply the baseline migration to the target', process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], envForTarget);
  run('confirm the target is up to date', process.execPath, [PRISMA_CLI, 'migrate', 'status'], envForTarget);
}

// ── 3–4. ETL, then reconcile ───────────────────────────────────────────────
if (stepEnabled('etl')) {
  run('copy every row from the source into the target', process.execPath, ['scripts/migrate-supabase-to-mariadb.mjs'], {
    TARGET_DATABASE_URL: TARGET,
  });
}
if (stepEnabled('verify')) {
  run('reconcile the copy against the source', process.execPath, ['scripts/migrate-supabase-to-mariadb.mjs', '--verify-only'], {
    TARGET_DATABASE_URL: TARGET,
  });
}

// ── 5. images off the database ─────────────────────────────────────────────
if (stepEnabled('images')) {
  run('move base64 image rows onto disk', process.execPath, ['scripts/extract-images-to-files.mjs', '--apply'], {
    DATABASE_URL: TARGET,
  });
}

// ── 6. build the artifact the switch will serve ────────────────────────────
if (stepEnabled('build')) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || dotenv.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    console.error('✖ NEXT_PUBLIC_SITE_URL is not set (needed at build time; fulfilment fails closed without it)');
    process.exit(2);
  }
  // `npm run build` is `next build && node scripts/stamp-git-sha.mjs`; run the two directly so
  // this works on Windows without a shell.
  const buildEnv = { ...envForTarget, NEXT_PUBLIC_SITE_URL: siteUrl };
  run('build against the target database', process.execPath, [NEXT_CLI, 'build'], buildEnv);
  run('stamp the build with the commit it came from', process.execPath, [STAMP_SCRIPT], buildEnv);
}

// ── 7. the gate ────────────────────────────────────────────────────────────
if (stepEnabled('check')) {
  run('run the 32-check cutover gate', process.execPath, ['scripts/precutover-check.mjs'], {
    TARGET_DATABASE_URL: TARGET,
  });
}

console.log('\n✅ pre-switch sequence complete.');
console.log('   Next (human steps, runbook §3):');
console.log('   1. freeze writes — Plesk → Node.js → Stop');
console.log('   2. add DATABASE_URL + DATABASE_DIRECT_URL to the panel, Restart App');
console.log('   3. verify: /api/v1/health, /api/v1/version, one real Slip2Go slip');
console.log('   Rollback if any of that fails: §4 Rollback B.');
