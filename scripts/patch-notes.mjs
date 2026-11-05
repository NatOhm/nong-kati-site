#!/usr/bin/env node
// ─── patch-notes.mjs — the deploy log is the one owner of release history ───
//
// The admin page /management/patch-notes shows the owner what has actually
// reached production. The record of that is docs/hostatom-live.md's deploy-log
// table: every deploy row already carries date + commit + BUILD_ID + what
// changed, because the runbook requires it. Copying that into a second list by
// hand is exactly how the two drift apart, so this script DERIVES the page's
// data from the log, and tests/patch-notes.test.ts fails when the committed
// JSON is stale.
//
// Usage:
//   node scripts/patch-notes.mjs      # regenerate src/data/patch-notes.json
//   npm run patch-notes               # same thing
//
// Rows without a commit or a BUILD_ID are not builds (DB cleanups, secret
// rotations, repo hygiene) and are skipped: the page is about what was *built
// and pushed*, which those rows are not.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
export const LOG_PATH = path.join(ROOT, 'docs', 'hostatom-live.md');
export const OUT_PATH = path.join(ROOT, 'src', 'data', 'patch-notes.json');

const HEADER = '| Date | Commit (ref) | BUILD_ID | Notes |';

/**
 * Split a markdown table row on unescaped pipes.
 *
 * Escaped pipes are parked on a placeholder before the split: a regex
 * lookbehind for a backslash reads differently depending on how the file was
 * written, and a silently wrong split would mangle every note cell.
 */
const ESCAPED_PIPE = '\u0000PIPE\u0000';
function cells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .replace(/\\\|/g, ESCAPED_PIPE)
    .split('|')
    .map((c) => c.split(ESCAPED_PIPE).join('|').trim());
}

/**
 * `Nov 4, 2026` → `2026-11-04`; null when it is not a date we understand.
 *
 * Not `Date.parse` + `toISOString`: the machine here is UTC+7, so a local
 * midnight becomes the previous day in UTC and every row drifted one day back.
 * The label is calendar text, so it is read as calendar text.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function isoDate(label) {
  const m = label.match(/^([A-Za-z]{3})\w*\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1][0].toUpperCase() + m[1].slice(1, 3).toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

/** Drop inline markdown so the page renders plain text without a parser. */
function plain(md) {
  return md
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const semver = (v) => v.split('.').map(Number);

function newerFirst(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.version && b.version) {
    const x = semver(a.version);
    const y = semver(b.version);
    for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return y[i] - x[i];
  }
  return 0;
}

/** Parse the deploy-log table of docs/hostatom-live.md into patch notes. */
export function parseDeployLog(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().startsWith(HEADER));
  if (start < 0) throw new Error(`patch-notes: deploy-log header not found (${HEADER})`);

  const notes = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith('|')) break;
    const [dateLabel, commitCell = '', buildCell = '', noteCell = ''] = cells(line);
    const sha = commitCell.match(/`([0-9a-f]{7,40})`/)?.[1] ?? null;
    const buildId = buildCell.match(/`([A-Za-z0-9_-]{6,})`/)?.[1] ?? null;
    const date = dateLabel ? isoDate(dateLabel) : null;
    // Not a build (DB cleanup, secret rotation, hygiene note) — nothing shipped.
    if (!sha || !buildId || !date) continue;

    const bold = noteCell.match(/^\*\*([\s\S]+?)\*\*/)?.[1] ?? null;
    const version = bold?.match(/^(\d+\.\d+\.\d+)/)?.[1] ?? null;
    const detail = plain(noteCell);
    const lead = plain(bold ?? noteCell.split(/(?<=\.)\s/)[0] ?? '');

    notes.push({
      version,
      date,
      dateLabel,
      gitSha: sha,
      buildId,
      title: lead
        .replace(/^\d+\.\d+\.\d+\s*—\s*/, '')
        .replace(/^[a-z]/, (c) => c.toUpperCase())
        .trim() || detail.slice(0, 80),
      detail,
    });
  }
  if (!notes.length) throw new Error('patch-notes: deploy-log table parsed to zero builds');
  return notes.sort(newerFirst);
}

export function buildPatchNotes() {
  return parseDeployLog(fs.readFileSync(LOG_PATH, 'utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const notes = buildPatchNotes();
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(notes, null, 2)}\n`);
  console.log(`patch-notes: wrote ${notes.length} releases → ${path.relative(ROOT, OUT_PATH)}`);
  console.log(`patch-notes: newest = ${notes[0].version ?? '(no version)'} · ${notes[0].buildId}`);
}
