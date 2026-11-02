/**
 * Hostatom deploy runbook — the Step-2 one-liner is pinned here (2026-11-02).
 *
 * The line used to run `rm -rf .next` BEFORE it knew the download was usable: a
 * truncated tar left the docroot with no build, and a stale-but-valid CDN copy
 * silently reinstalled the previous build (1.1.1's first Run Now). Nothing in
 * `npm test` read that line, so the regression was invisible.
 *
 * D1 the download is time-boxed and cache-busted
 * D2 no `"` and no `$(…)` — the Plesk runner wraps the command in a double-quoted
 *    string and expands `$(…)` against the wrong working directory
 * D3 verified before the swap, and the live `.next` is never wiped in place
 * D4 matches what stamp-git-sha.mjs writes: `<sha>-dirty` is legal, VERSION optional
 * D5 scripts/deploy-artifact.sh prints that same command
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (p: string): string => readFileSync(path.join(process.cwd(), p), 'utf8');
const doc = read('docs/deploy-hostatom-manual.md');
const script = read('scripts/deploy-artifact.sh');

/**
 * The `cd httpdocs &&` line that stages the bundle. Matched structurally, not by
 * a hardcoded prefix: the nightly compare task also curls the bundle, and a
 * renamed prefix has to fail one named check instead of breaking collection.
 */
function step2Line(text: string): string {
  return (
    text
      .split('\n')
      .find((l) => l.startsWith('cd httpdocs &&') && l.includes('mkdir -p .next-stage')) ?? ''
  );
}

const command = step2Line(doc);
const NO_CMD =
  'Step-2 command not found (want a `cd httpdocs &&` line containing `mkdir -p .next-stage`)';

describe('Hostatom deploy one-liner', () => {
  it('D1: time-boxes the download and busts the CDN cache', () => {
    expect(command, NO_CMD).toContain('--max-time 180');
    expect(command, NO_CMD).toContain('?cb=');
  });

  it('D2: no double quote, no $()', () => {
    expect(command, NO_CMD).not.toContain('"');
    expect(command, NO_CMD).not.toContain('$(');
  });

  it('D3: verifies before the swap and never wipes the live build', () => {
    const extract = command.indexOf('-C .next-stage');
    expect(extract, NO_CMD).toBeGreaterThan(-1);
    expect(extract, 'D3: the swap runs before the bundle is verified').toBeLessThan(
      command.indexOf('mv .next-stage/.next .next'),
    );
    expect(command, 'D3: the live .next is deleted in place').not.toContain('rm -rf .next &&');
  });

  it('D4: accepts a dirty stamp and does not require VERSION', () => {
    expect(command, 'D4: a `<sha>-dirty` build would be refused').toContain('[0-9a-f]{40}(-dirty)?');
    expect(command, 'D4: VERSION is optional in the build but required here').not.toContain(
      'VERSION',
    );
  });

  it('D5: the deploy script prints the same command', () => {
    // The heredoc copy differs from the runbook line in exactly two places: the
    // URL becomes $RAW_URL, and `$` characters are backslash-escaped.
    const BS = String.fromCharCode(92);
    const expected = command
      .split(
        ' https://raw.githubusercontent.com/NatOhm/nong-kati-site/deploy-artifact/deploy-bundle.tar.gz?cb=$$ ',
      )
      .join(' "$RAW_URL?cb=' + BS + '$' + BS + '$" ')
      .split('(-dirty)? ?$' + "'")
      .join('(-dirty)? ?' + BS + "$'");
    expect(step2Line(script), 'D5: the script prints a different command').toBe(expected);
  });
});
