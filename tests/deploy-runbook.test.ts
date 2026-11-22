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
 * D4 both stamps are compared to the literal release the line names, not to a
 *    shape — a shape accepts a stale tarball of any older release
 * D5 scripts/deploy-artifact.sh prints that same command
 * D6 that printed summary stays literal (unquoted heredoc: a backtick runs)
 * D7 the pack step refuses a dirty or mismatched bundle before publishing
 * D8 the phase-3 runbook pastes that same line, and its value table repeats the
 *    three values the line is pinned to
 * D9 the post-switch verifier's uptime rule follows the window the reads actually
 *    had — a healthy Passenger respawn cannot demand a climb the window no longer
 *    has room for (it did, live, on the first run against hG0R…)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// @ts-expect-error -- untyped .mjs helper (deploy tooling runs it under bare `node`)
import { judgeClimb } from '../scripts/lib/stability.mjs';

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

/** The literal a `grep -Fxq <literal> .next-stage/.next/<file>` check compares against. */
function literalFor(file: string): string {
  const match = new RegExp(`grep -Fxq (\\S+) \\.next-stage/\\.next/${file}`).exec(command);
  return match?.[1] ?? '';
}

const buildId = literalFor('BUILD_ID');
const gitSha = literalFor('GIT_SHA');
const artifactRef =
  (/nong-kati-site\/([^/]+)\/deploy-bundle\.tar\.gz/.exec(command) ?? [])[1] ?? '';

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

  it('D4: stages only the release it names, by literal stamp', () => {
    // A shape check (`^[0-9a-f]{40}(-dirty)?$`) passes for ANY 40-hex sha, so a
    // stale tarball of an earlier release sailed through it and was swapped in —
    // the one failure that needs `.next.old` to undo. A literal matches this
    // release or nothing, so there is no `-dirty` variant left to tolerate.
    expect(buildId, 'D4: BUILD_ID is not compared to a literal').toMatch(/^[A-Za-z0-9_-]{8,}$/);
    expect(gitSha, 'D4: GIT_SHA is not compared to a literal').toMatch(/^[0-9a-f]{40}$/);
    expect(command, 'D4: a shape-only grep is back in the line').not.toMatch(/grep -E/);
    expect(command, 'D4: VERSION is optional in the build but required here').not.toContain(
      'VERSION',
    );
  });

  it('D5: the deploy script prints the same command', () => {
    // Two things differ by design: the URL is the $RAW_URL the script just built,
    // and the stamps are the build it just made — D8 holds the runbook to its own
    // table. Everything else has to match, quotes included: the token has to start
    // where a URL legitimately starts, so a quote or a stray word before `?cb=` is
    // drift (a quoted URL is the failure D2 exists to prevent), not normalisation.
    const normalize = (line: string): string =>
      line
        .replace(/(^|\s)(https?:\/\/\S*|\$RAW_URL)\?cb=\S+/g, '$1URL')
        .replace(/grep -Fxq \S+/g, 'grep -Fxq STAMP');
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

  it('D8: the phase-3 runbook pastes this exact line and repeats its values', () => {
    const runbook = read('docs/deploy-phase3-switch.md');
    expect(step2Line(runbook), 'D8: the runbook copy drifted from the manual').toBe(command);

    // The line is release-pinned, so the one page the operator reads while
    // clicking has to name the same three values it is about to paste — the line
    // alone would agree with itself and still document the wrong release.
    expect(artifactRef, 'D8: the URL does not pin one full commit').toMatch(/^[0-9a-f]{40}$/);
    const outsideTheCommand = runbook.split(command).join('');
    for (const value of [buildId, gitSha, artifactRef]) {
      expect(outsideTheCommand, `D8: ${value} is not in the runbook outside the command`).toContain(
        value,
      );
    }
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

/**
 * The verifier's uptime rule lives in scripts/lib/stability.mjs rather than in the
 * CLI itself: it is arithmetic, and a test that spawned the real script would have
 * to spend the actual 90 s window to prove anything.
 */
describe('Post-switch verifier — uptime rule (Phase 3)', () => {
  const sample = (at: number, uptime: number): { at: number; uptime: number } => ({ at, uptime });
  const window4 = { reads: 4, interval: 30 };

  it('D9: a healthy respawn cannot be failed by a climb the window no longer has', () => {
    // A respawn before read 1 leaves the whole window ahead of the new process, so the
    // ordinary 90 s bar is reachable — this is the "respawn at the start" case.
    const reapedBeforeRead1 = [sample(0, 0.4), sample(30, 30.4), sample(60, 60.4), sample(90, 90.4)];
    expect(judgeClimb(reapedBeforeRead1, window4)).toMatchObject({
      ok: true,
      respawned: false,
      maxUptime: 90.4,
    });

    // Live 2026-11-21 against hG0RHiUSkpldDxCrlAXQl: the run reaped at read 3/4, so
    // only 30 s of window remained while the rule still asked for 2 x 30 = 60 s.
    const reapedAtRead3 = [sample(0, 8.5), sample(30, 38.5), sample(60, 0.4), sample(90, 30.4)];
    const late = judgeClimb(reapedAtRead3, window4);
    expect(late).toMatchObject({ ok: true, respawned: true, availableSpan: 30 });
    expect(late.bestSpan).toBeCloseTo(30, 5);

    // One read earlier it was a knife-edge: 60 s of window against a 60 s bar, so a
    // few hundred ms of request jitter decided pass or fail on a healthy app.
    const reapedAtRead2 = [sample(0, 8.5), sample(30, 0.4), sample(60, 30.2), sample(90, 59.8)];
    expect(judgeClimb(reapedAtRead2, window4)).toMatchObject({ ok: true, respawned: true });
  });

  it('D9b: the looser bar still refuses a process that stopped ticking', () => {
    const stuckAfterReap = [sample(0, 50), sample(30, 1), sample(60, 1.1), sample(90, 1.2)];
    expect(judgeClimb(stuckAfterReap, window4).ok).toBe(false);

    // No respawn to blame: uptime never moved, so nothing explains the missing climb.
    const neverMoved = [sample(0, 40), sample(30, 40.2), sample(60, 40.1), sample(90, 40.3)];
    expect(judgeClimb(neverMoved, window4)).toMatchObject({ ok: false, respawned: false });
  });

  it('D9c: a clean window still has to show 90 s of uptime', () => {
    const clean = [sample(0, 8.5), sample(30, 38.5), sample(60, 68.5), sample(90, 98.5)];
    expect(judgeClimb(clean, window4)).toMatchObject({
      ok: true,
      respawned: false,
      maxUptime: 98.5,
    });
  });
});
