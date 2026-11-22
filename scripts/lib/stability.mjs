/**
 * ─── Nong-Kati — lib/stability.mjs ───────────────────────────────────────────
 *
 * The uptime rule behind scripts/postswitch-verify.mjs, as a pure function so it
 * can be pinned without spending a real 90 s window.
 *
 * WHY IT IS NOT "uptime must reach 90 s"
 * Passenger reaps an idle process and respawns it, so a healthy app can enter the
 * window at uptime 8 s, and one that reaped at read 3 of 4 has only 30 s of window
 * left. The first live run against hG0RHiUSkpldDxCrlAXQl showed the old rule asking
 * for a fixed 2 x interval = 60 s climb after any respawn: arithmetically impossible
 * in a 30 s remainder, so a fine release went red. The bar therefore follows the
 * time the window actually had — the climb available since the respawn, less the
 * same 5 s of jitter tolerance the rest of the check uses.
 *
 * A reset is uptime going backwards by more than the tolerance. A respawn *before*
 * read 1 needs no special case: the whole window is still ahead of it, so the
 * ordinary 90 s bar is reachable — and a fresh process that never climbs still fails.
 *
 * Read-only and dependency-free: deploy tooling runs it under bare `node`.
 */

/** A clean window has to show one process alive for this long. */
export const REQUIRED_UPTIME_SECONDS = 90;

/**
 * @param {Array<{ at: number, uptime: unknown }>} samples reads in order; `at` is
 *   seconds since the window opened, `uptime` is the health payload's uptime.
 * @param {{ reads?: number, interval?: number, tolerance?: number }} options
 * @returns {{
 *   ok: boolean, maxUptime: number, bestSpan: number, windowSpan: number,
 *   availableSpan: number, requiredSpan: number,
 *   respawned: boolean, resetSeen: boolean,
 * }}
 */
export function judgeClimb(samples, { reads, interval, tolerance = 5 } = {}) {
  const list = Array.isArray(samples) ? samples : [];
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
  const uptime = list.map((sample) => num(sample?.uptime));
  const at = list.map((sample, i) => num(sample?.at) ?? i * interval);

  const known = uptime.filter((value) => value !== null);
  const maxUptime = known.length ? Math.max(...known) : NaN;

  let bestSpan = 0;
  let streakStart = 0;
  let resetSeen = false;
  for (let i = 1; i < list.length; i += 1) {
    const prev = uptime[i - 1];
    const cur = uptime[i];
    if (prev === null || cur === null) continue;
    if (cur < prev - tolerance) {
      streakStart = i;
      resetSeen = true;
    }
    const base = uptime[streakStart];
    if (base !== null) bestSpan = Math.max(bestSpan, cur - base);
  }

  const lastAt = at.length ? at[at.length - 1] : 0;
  const windowSpan = at.length ? lastAt - at[0] : 0;
  // The stretch the current process was actually observed in: what a reap leaves.
  const availableSpan = Math.max(0, lastAt - (at[streakStart] ?? 0));
  // Only an observed backward step is a respawn: uptime at read 1 says nothing about
  // whether the process started inside the window or seconds before it.
  const respawned = resetSeen;

  const requiredSpan = respawned
    ? Math.max(0, availableSpan - tolerance)
    : (reads - 1) * interval - tolerance;

  const ok =
    Number.isFinite(maxUptime) &&
    (maxUptime >= REQUIRED_UPTIME_SECONDS || bestSpan >= requiredSpan);

  return {
    ok,
    maxUptime,
    bestSpan,
    windowSpan,
    availableSpan,
    requiredSpan,
    respawned,
    resetSeen,
  };
}
