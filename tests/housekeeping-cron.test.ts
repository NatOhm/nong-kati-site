/**
 * Housekeeping cron wiring — audit finding 2 (2026-10-26).
 *
 * The sweep endpoints (orders/promotions expiry, email-outbox drain, slip
 * retention) existed and were correct but had NO caller anywhere:
 * `pending_payment` rows never expired and the outbox drained only after a
 * confirmation. prod-health-monitor.yml is now their scheduler (GitHub cron
 * is the only always-on scheduler available on shared hosting), pinned here
 * the same way G8 pins the health monitor's own wiring — a refactor must not
 * be able to silently unplug it.
 *
 *  H1 — both schedules exist: the 10-minute sweep tick and the daily
 *       retention tick. (The daily entry caught a real regression while
 *       this gate was being written: the `- cron:` line for it was
 *       dropped while its comment shipped, so retention would never have
 *       run automatically.)
 *  H2 — every internal endpoint is curled with the cron secret header.
 *  H3 — retention is daily-only: it sits inside the github.event.schedule
 *       branch, so the 10-minute tick never scans the settings table.
 *  H4 — an unset NK_CRON_SECRET fails the step loudly (exit 1 + ::error)
 *       instead of letting the endpoints 503 in silence — silent
 *       disablement was the original bug.
 *  H5 — every route the cron calls accepts the `x-cron-token` header the
 *       workflow actually sends. Found on the live server (2026-10-26):
 *       drain read only `x-outbox-token`, so its tick would have 401'd in
 *       production forever while every workflow-side assertion stayed green.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  path.join(process.cwd(), '.github/workflows/prod-health-monitor.yml'),
  'utf8',
);

describe('housekeeping cron wiring (prod-health-monitor.yml)', () => {
  it('H1: keeps both schedules — 10-minute sweeps and the daily retention tick', () => {
    expect(workflow).toContain("- cron: '*/10 * * * *'");
    expect(workflow).toContain("- cron: '17 3 * * *'");
  });

  it('H2: curls every internal endpoint with the cron secret header', () => {
    for (const ep of [
      'internal/orders/expire',
      'internal/promotions/expire',
      'internal/email-outbox/drain',
      'internal/settings/slip-retention',
    ]) {
      expect(workflow, `${ep} must be called by the housekeeping step`).toContain(ep);
    }
    expect(workflow).toContain('-H "x-cron-token: $NK_CRON_SECRET"');
    expect(workflow).toContain('${{ secrets.NK_CRON_SECRET }}');
  });

  it('H3: adds slip retention only off the 10-minute tick', () => {
    const branchAt = workflow.indexOf('if [ "${{ github.event.schedule }}"');
    expect(branchAt, 'schedule branch for endpoint selection missing').toBeGreaterThan(-1);
    expect(workflow.slice(branchAt)).toContain(
      'endpoints="$endpoints internal/settings/slip-retention"',
    );
  });

  it('H4: an unset secret fails the step loudly instead of failing silently', () => {
    const guardAt = workflow.indexOf('if [ -z "$NK_CRON_SECRET" ]');
    expect(guardAt, 'NK_CRON_SECRET guard missing from the housekeeping step').toBeGreaterThan(-1);
    const guardBlock = workflow.slice(guardAt).split('\n').slice(0, 4).join('\n');
    expect(guardBlock).toContain('::error title=NK_CRON_SECRET missing');
    expect(guardBlock).toContain('exit 1');
  });

  it('H5: every called route accepts the x-cron-token header the workflow sends', () => {
    const routes = [
      'internal/orders/expire/route.ts',
      'internal/promotions/expire/route.ts',
      'internal/email-outbox/drain/route.ts',
      'internal/settings/slip-retention/route.ts',
    ];
    for (const r of routes) {
      const src = readFileSync(path.join(process.cwd(), 'src/app/api/v1', r), 'utf8');
      expect(
        src.includes("headers.get('x-cron-token')"),
        `${r} must read x-cron-token — the workflow sends ONLY that header; ` +
          `an endpoint that reads only x-outbox-token 401s in production forever`,
      ).toBe(true);
    }
  });
});
