/**
 * Gate-inventory completeness (2026-10-03).
 *
 * `docs/quality-gates.md` is the map from test file → what it enforces →
 * which CI job runs it. That map had drifted badly: 31 files existed under
 * `tests/` and only 17 appeared in the doc. Twelve committed gates had no
 * row and no section — including `client-docs-consistency`, the very gate
 * added to CI in a10d14e. The overview table had also rotted structurally:
 * its separator row carried 12 pipes for 5 columns, and the `P` row was
 * jammed onto the end of the `A` row, so everything after it rendered as
 * part of one broken line.
 *
 * Two directions, because the doc can be wrong either way:
 *
 *   G1  every tests/*.test.ts must be referenced by the doc. A gate nobody
 *       documents is a gate nobody knows to run, and reads as an absence
 *       from the project's guarantees when it is actually present.
 *   G2  every tests/*.test.ts the doc claims must exist on disk. A renamed
 *       or deleted suite leaves a confident-looking entry pointing at
 *       nothing, which is worse than no entry.
 *
 * Deliberately NOT checked here: `e2e/*.spec.ts`. Those are documented
 * under E1–E5 and the browser-smoke job, several are driven only in CI
 * rather than `npm test`, and the vitest glob never sees them. Folding them
 * in would assert a mapping this file cannot honestly make.
 *
 * Matching is by basename (`foo.test.ts`), so a doc entry works whether it
 * is written `tests/foo.test.ts` or just `foo.test.ts`.
 *
 * "Documented" means a row in the overview table or a section heading — NOT
 * merely a mention in prose. An earlier draft of G1 matched anywhere in the
 * file and passed `password-reset` / `staff-audit-hardening` on the strength
 * of a single cross-reference line inside the audit-atomicity section, while
 * neither file had any row or section of its own. That is precisely the
 * silent omission this gate exists to prevent, so it counts only structured
 * mentions.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
const TESTS_DIR = path.join(ROOT, 'tests');
const DOC = path.join(ROOT, 'docs', 'quality-gates.md');

const docText = readFileSync(DOC, 'utf8');
const lines = docText.split('\n');

const FILE_RE = /[A-Za-z0-9-]+\.test\.ts/g;

/** Any mention at all — used for ghost detection (G2). */
const mentioned = new Set(docText.match(FILE_RE) ?? []);

/** The overview table's rows, header/separator excluded. */
const tableStart = lines.findIndex((l) => /^\|\s*#\s*\|/.test(l));
const tableRows: string[] = [];
for (let i = tableStart + 1; i < lines.length; i++) {
  const line = lines[i]!;
  if (!line.trim().startsWith('|')) break;
  tableRows.push(line);
}

/** Structured mentions only: a table row or a section heading. */
const documented = new Set(
  [...tableRows, ...lines.filter((l) => /^#{1,6}\s/.test(l))].flatMap(
    (l) => l.match(FILE_RE) ?? [],
  ),
);

const onDisk = readdirSync(TESTS_DIR)
  .filter((f) => f.endsWith('.test.ts'))
  .sort();

const pipes = (l: string): number => (l.match(/\|/g) ?? []).length;

describe('docs/quality-gates.md ↔ tests/ inventory', () => {
  it('G1: documents every test file that exists', () => {
    const missing = onDisk.filter((f) => !documented.has(f));
    expect(
      missing,
      missing.length
        ? `Add a row to the quality-gates.md overview table and a section for each:\n` +
            missing.map((f) => `  - tests/${f}`).join('\n')
        : '',
    ).toEqual([]);
  });

  it('G2: every test file the doc claims actually exists', () => {
    const ghosts = [...mentioned].filter((f) => !onDisk.includes(f)).sort();
    expect(
      ghosts,
      ghosts.length
        ? `These are documented but not present under tests/ — remove or rename them:\n` +
            ghosts.map((f) => `  - tests/${f}`).join('\n')
        : '',
    ).toEqual([]);
  });

  it('G3: the overview table is well-formed (one row per gate, consistent columns)', () => {
    // A separator row whose column count differs from the header silently
    // swallows every row after the break in rendered markdown.
    expect(tableStart, 'overview table header not found in quality-gates.md').toBeGreaterThan(-1);

    const headerPipes = pipes(lines[tableStart]!);

    const bad = tableRows
      .map((line, idx) => ({ rowNo: idx + 1, line, pipes: pipes(line) }))
      .filter((r) => r.pipes !== headerPipes);
    expect(
      bad.map((r) => r.rowNo),
      `overview table rows disagree with the header's ${headerPipes} pipes:\n` +
        bad.map((r) => `  row ${r.line} has ${r.pipes}: ${r.line.slice(0, 90)}`).join('\n'),
    ).toEqual([]);
  });

  it('G4: the doc exists where the gate expects it (guards the guard)', () => {
    expect(existsSync(DOC)).toBe(true);
    expect(onDisk.length).toBeGreaterThan(0);
  });
});
