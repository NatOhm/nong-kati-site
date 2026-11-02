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
 * D6 that printed summary stays literal (unquoted heredoc: a backtick runs)
 * D7 the pack step refuses a dirty or mismatched bundle before publishing
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
    // The heredoc copy differs in exactly two ways: the URL becomes $RAW_URL,
    // and every `$` is backslash-escaped for the unquoted heredoc.
    const BS = String.fromCharCode(92);
    const normalize = (line: string): string =>
      line
        .replace(/"[^"]*\?cb=[^"]*"/, 'URL')
        .replace(/https:\/\/\S*deploy-bundle\.tar\.gz\?cb=\S+/, 'URL')
        .split(BS + '$')
        .join('$');
    expect(normalize(step2Line(script)), 'D5: the script prints a different command').toBe(
      normalize(command),
    );
  });

  it('D6: the printed summary has no backticks', () => {
    // `cat <<SUMMARY` is UNQUOTED so `$RAW_URL` expands — which also means a
    // backtick in that block is command substitution. One around `.next.old`
    // ran it as a command and killed the handoff on the 1.1.2 dry run.
    const summary = script.slice(script.indexOf('cat <<SUMMARY'), script.lastIndexOf('SUMMARY'));
    expect(summary, 'D6: a backtick in the summary runs as a command').not.toContain('`');
  });

  it('D7: the pack step refuses a dirty or mismatched bundle', () => {
    // Same rule .verify-bundle.ps1 enforces for the zip route, read off the
    // tar. Refusing here (before the push) is the last cheap checkpoint.
    const guard = script.slice(script.indexOf('TAR_BUILD_ID='), script.indexOf('Pushing bundle'));
    expect(guard, 'D7: the bundle BUILD_ID is never compared to the build').toContain(
      'TAR_BUILD_ID" = "$BUILD_ID',
    );
    expect(guard, 'D7: a `<sha>-dirty` bundle would ship').toContain('*-dirty');
    expect(script.indexOf('TAR_GIT_SHA='), 'D7: stamps checked after the push').toBeLessThan(
      script.indexOf('git push'),
    );
  });
});
