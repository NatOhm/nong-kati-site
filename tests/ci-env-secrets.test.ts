/**
 * CI env secrets vs. the minimums the code enforces.
 *
 * The Build job set `NK_JWT_SECRET: ci-test-secret` — 14 characters — while
 * src/lib/jwt.ts refuses to sign or verify anything under 32 and throws
 * JWT_SECRET_TOO_WEAK. Nothing was red, because that job had never run: it
 * sits behind the failing security-audit gate, so it is `skipped` on every
 * push. The build passed only because `next build` never signs a token and
 * so never reached the check. The first time the audit is fixed, that step
 * either passes by luck or starts throwing, and the cause is nowhere near the
 * line that would need changing.
 *
 * That is the shape of bug this file exists to stop: not a wrong value, but a
 * value that is wrong only in a path nothing has exercised yet.
 *
 * WHY A TEXT SCAN AND NOT A YAML PARSE:
 *
 * js-yaml is present only as eslint's transitive dependency — not declared —
 * so parsing with it would bind this gate to npm hoisting, and the repo has a
 * pnpm store alongside it. A regex over the workflow text also asserts a
 * BETTER property: "no bad literal anywhere", rather than "no bad value in
 * the env blocks I happened to think to visit". That distinction is the whole
 * bug — the Build job's secret sits at STEP level, so a job-level walk missed
 * it. Indentation is irrelevant to a line scan.
 *
 * The minimums are READ FROM SOURCE rather than restated here. A gate that
 * hardcodes 32 and the code that moves the floor to 40 would both be "correct"
 * and disagreeing, which is how the next instance of this arrives.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
const WORKFLOW_DIR = path.join(ROOT, '.github', 'workflows');
const JWT_SRC = path.join(ROOT, 'src', 'lib', 'jwt.ts');

/** Values the code shape-checks, and how. Sourced from the modules below. */
const CONSTRAINED: Record<string, { rule: (v: string) => boolean; why: string }> = {
  NK_JWT_SECRET: {
    rule: (v) => v.length >= 32,
    why: 'src/lib/jwt.ts getSecret() throws JWT_SECRET_TOO_WEAK below the floor',
  },
  // src/lib/crypto/giftCode.ts keyForVersion(): must be 64 hex chars.
  NK_GIFT_CODE_ENCRYPTION_KEY: {
    rule: (v) => /^[0-9a-fA-F]{64}$/.test(v),
    why: 'src/lib/crypto/giftCode.ts keyForVersion() refuses anything but 64 hex chars',
  },
};

type Found = { file: string; line: number; key: string; value: string };

/**
 * Every `KEY: value` assignment for a constrained key, across all workflows.
 * Comments are stripped first so a documented bad example does not read as a
 * live secret, and `${{ … }}` expressions are returned for separate handling
 * because their value is not knowable from the file.
 */
function scan(): { literals: Found[]; expressions: Found[] } {
  const literals: Found[] = [];
  const expressions: Found[] = [];

  for (const file of readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f))) {
    readFileSync(path.join(WORKFLOW_DIR, file), 'utf8')
      .split('\n')
      .forEach((raw, i) => {
        const line = raw.replace(/^\s*#.*$/, '');
        for (const key of Object.keys(CONSTRAINED)) {
          const m = new RegExp(`^\\s*${key}:\\s*(.*)$`).exec(line);
          if (!m) continue;
          const value = (m[1] ?? '').trim().replace(/^["']|["']$/g, '');
          const hit: Found = { file, line: i + 1, key, value };
          if (/^\$\{\{/.test(value)) expressions.push(hit);
          else literals.push(hit);
        }
      });
  }

  return { literals, expressions };
}

/** The entropy floor, read from the module that enforces it. */
function jwtSecretFloor(): number {
  const src = readFileSync(JWT_SRC, 'utf8');
  const m = /MIN_SECRET_LENGTH\s*=\s*(\d+)/.exec(src);
  if (!m) {
    throw new Error(
      'MIN_SECRET_LENGTH not found in src/lib/jwt.ts — this gate cannot verify CI secrets without it. ' +
        'Update this test to match the refactor rather than letting it pass silently.',
    );
  }
  return Number(m[1]);
}

describe('CI env secrets satisfy the minimums the code enforces', () => {
  const { literals, expressions } = scan();

  it('found the entropy floor in src/lib/jwt.ts (guards the guard)', () => {
    expect(jwtSecretFloor()).toBeGreaterThanOrEqual(32);
  });

  it('every CI literal for a constrained secret meets its minimum', () => {
    expect(literals.length, 'no CI secret literals found — the scan is broken').toBeGreaterThan(0);

    const floor = jwtSecretFloor();
    const violations = literals
      .filter(({ key, value }) =>
        key === 'NK_JWT_SECRET' ? value.length < floor : !CONSTRAINED[key]!.rule(value),
      )
      .map(({ file, line, key, value }) => {
        const why =
          key === 'NK_JWT_SECRET' ? `shorter than ${floor} characters` : 'not 64 hex chars';
        return `${file}:${line} ${key} is ${why} (${value.length} chars) — ${CONSTRAINED[key]!.why}`;
      });

    expect(
      violations,
      violations.length
        ? 'These CI secrets would throw the moment their code path runs:\n' +
            violations.map((v) => `  - ${v}`).join('\n')
        : '',
    ).toEqual([]);
  });

  it('no constrained secret is a block scalar or empty value', () => {
    // `KEY: |` and `KEY:` parse fine in YAML and produce a runtime surprise
    // instead of a literal, so neither can be length-checked here.
    const unusable = literals
      .filter(
        ({ value }) =>
          value === '' || value === '|' || value === '>' || value === '|-' || value === '>-',
      )
      .map(
        ({ file, line, key, value }) =>
          `${file}:${line} ${key} has no usable literal value (${value || 'empty'})`,
      );
    expect(unusable, unusable.join('\n')).toEqual([]);
  });

  it('reports any expression-valued secret so it is a known blind spot', () => {
    // `${{ secrets.X }}` cannot be checked from the repo. If one appears, it
    // is listed deliberately rather than passing unnoticed.
    const where = expressions.map(
      ({ file, line, key, value }) => `${file}:${line} ${key} = ${value}`,
    );
    expect(
      where,
      where.length
        ? 'expression-valued secrets are uncheckable here:\n  ' + where.join('\n  ')
        : '',
    ).toEqual([]);
  });

  it('the Build job carries a JWT secret at all', () => {
    // The specific hole this gate was written for: the Build job sets its
    // env on the STEP, not the job. Assert it is still there, so deleting it
    // to "fix" the length problem fails loudly instead of silently shipping a
    // build that cannot sign a token.
    const wf = readFileSync(path.join(WORKFLOW_DIR, 'ci.yml'), 'utf8');
    const buildJob = wf.split(/\n  build:\n/)[1] ?? '';
    expect(buildJob).toMatch(/NK_JWT_SECRET:\s*\S{32,}/);
  });
});
