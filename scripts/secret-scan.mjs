#!/usr/bin/env node
/**
 * Secret scan — the INDEX tree plus the whole git history, via gitleaks.
 *
 * Two things this deliberately does differently from a bare `gitleaks dir .`:
 *
 * 1. It scans the INDEX, not the working directory. `git write-tree` snapshots
 *    what a commit would contain, so gitignored material (local `.env*`,
 *    `backups/`, `.next/`, `.worktrees/`, `tmp/`) is never scanned-and-then-
 *    suppressed — it simply is not part of a commit. That keeps `.gitleaks.toml`
 *    free of "ignore this directory" entries that would also hide a forced
 *    `git add -f`, and it means the scan can run BEFORE committing (staged
 *    files included) rather than only in CI.
 * 2. It always scans history too, because a secret that reached a commit stays
 *    in the clone even after `git rm`. CI runs with `fetch-depth: 0` for the
 *    same reason: a shallow clone would only scan the tip.
 *
 * Usage:
 *   node scripts/secret-scan.mjs            # index + all history
 *   node scripts/secret-scan.mjs --staged   # index only (fast, pre-commit)
 *   node scripts/secret-scan.mjs --history  # history only
 *   node scripts/secret-scan.mjs --range=origin/master..HEAD   # PR/CI range
 *
 * Binary: `gitleaks` on PATH, or `GITLEAKS_BIN=/path/to/gitleaks`. Version is
 * pinned in .github/workflows/secret-scan.yml (v8.30.1).
 *
 * Exit codes: 0 clean, 1 findings (reported, redacted), 2 could not run.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const CONFIG = path.join(ROOT, '.gitleaks.toml');

const args = process.argv.slice(2);
const has = (flag) => args.some((a) => a === flag || a.startsWith(`${flag}=`));
const rangeArg = args.find((a) => a.startsWith('--range='));

// Reject flags this script does not handle instead of ignoring them: passing
// gitleaks' own `--report-path` here would silently write nothing, and a silent
// no-op in a security gate is worse than a loud failure.
const KNOWN = new Set(['--staged', '--history']);
const unknown = args.filter((a) => !KNOWN.has(a) && !a.startsWith('--range='));
if (unknown.length) {
  console.error(`✖ unknown flag ${unknown.join(' ')}.\n  usage: secret-scan [--staged] [--history] [--range=<git-log-range>]`);
  process.exit(2);
}

const run = (bin, argv, opts = {}) =>
  spawnSync(bin, argv, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts });

/**
 * Findings collected across both phases, as `{ rule, file, line }`.
 *
 * gitleaks' console output only says "leaks found: N" and points at a JSON
 * report for the detail; a gate that cannot name the file and the rule sends
 * the reader back to the docs to reconstruct what failed. The report is written
 * OUTSIDE the scanned tree and only these three fields are ever printed — the
 * secret itself must never reach the terminal, a log or CI.
 */
const findings = [];

function collect(reportPath, phase) {
  if (!existsSync(reportPath)) return;
  let rows;
  try {
    rows = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    return; // a malformed report must not turn a finding into a pass
  }
  for (const r of rows) {
    findings.push({ phase, rule: r.RuleID ?? 'unknown', file: r.File ?? '?', line: r.StartLine ?? 0 });
  }
}

const reportPathFor = (phase) => path.join(tmpdir(), `nk-secret-report-${process.pid}-${phase}.json`);

/** gitleaks from PATH, or an explicit GITLEAKS_BIN. */
function resolveBinary() {
  const explicit = process.env['GITLEAKS_BIN'];
  // Absolute, because the tree scan runs with cwd inside the export — a
  // relative `./gitleaks` would resolve there and vanish.
  const candidate = explicit ? path.resolve(explicit) : 'gitleaks';
  const probe = run(candidate, ['version']);
  if (probe.status === 0) return candidate;
  console.error(
    [
      '✖ gitleaks not found.',
      '  Install it (https://github.com/gitleaks/gitleaks/releases) or point at a',
      '  binary with GITLEAKS_BIN=/path/to/gitleaks.',
      explicit ? `  Tried: ${explicit}` : '  Looked for "gitleaks" on PATH.',
    ].join('\n'),
  );
  process.exit(2);
}

/** The tree a commit would create right now — staging included. */
function indexTree() {
  const out = run('git', ['write-tree']);
  if (out.status !== 0) {
    console.error(`✖ git write-tree failed: ${out.stderr.trim()}`);
    console.error('  (Run this inside the repository; unresolved conflicts block it.)');
    process.exit(2);
  }
  return out.stdout.trim();
}

function scanIndex(bin) {
  const scratch = mkdtempSync(path.join(tmpdir(), 'nk-secret-scan-'));
  try {
    const archive = execFileSync('git', ['archive', '--format=tar', indexTree()], {
      cwd: ROOT,
      maxBuffer: 512 * 1024 * 1024,
    });
    // Windows tar (bsdtar) mis-reads a backslash path after `-C`, and needs an
    // explicit stdin member: forward slashes + `-f -` work on every platform.
    const untar = spawnSync('tar', ['-x', '-f', '-', '-C', scratch.replaceAll('\\', '/')], {
      input: archive,
      stdio: 'pipe',
    });
    if (untar.status !== 0) {
      console.error(`✖ could not unpack the index tree: ${String(untar.stderr)}`);
      process.exit(2);
    }
    console.log(`▸ index tree: scanning ${scratch}`);
    const report = reportPathFor('tree');
    // Run INSIDE the export and scan `.`: gitleaks reports paths relative to
    // the process CWD, so scanning an absolute directory would prefix every
    // finding and silently stop .gitleaks.toml's `^docs/…` allowlists matching.
    const status = run(
      bin,
      [
        'dir',
        '.',
        '--config',
        CONFIG,
        '--redact',
        '--exit-code',
        '1',
        '--report-format',
        'json',
        '--report-path',
        report,
      ],
      { stdio: 'inherit', cwd: scratch },
    ).status;
    collect(report, 'tree');
    rmSync(report, { force: true });
    return status;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function scanHistory(bin) {
  const logOpts = rangeArg ? rangeArg.slice('--range='.length) : '--all';
  console.log(`▸ history: git log ${logOpts}`);
  const report = reportPathFor('history');
  const status = run(
    bin,
    [
      'git',
      ROOT,
      `--log-opts=${logOpts}`,
      '--config',
      CONFIG,
      '--redact',
      '--exit-code',
      '1',
      '--report-format',
      'json',
      '--report-path',
      report,
    ],
    { stdio: 'inherit' },
  ).status;
  collect(report, 'history');
  rmSync(report, { force: true });
  return status;
}

const bin = resolveBinary();

const statuses = [];
if (!has('--history')) statuses.push(scanIndex(bin));
if (!has('--staged')) statuses.push(scanHistory(bin));

if (statuses.every((s) => s === 0)) {
  console.log('✓ no secrets found (values above are redacted by gitleaks)');
  process.exit(0);
}
console.error('✖ secret scan failed — rotate the credential, purge it from history, then rerun.');
if (findings.length) {
  console.error(`  ${findings.length} finding(s), redacted:`);
  for (const f of findings) {
    console.error(`    ${f.rule.padEnd(28)} ${f.phase.padEnd(8)} ${f.file}:${f.line}`);
  }
} else {
  // Non-zero exit with no parseable report still has to say something useful.
  console.error('  (gitleaks reported findings but wrote no readable report — rerun it directly for detail.)');
}
process.exit(1);
