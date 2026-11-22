# Production health & restart monitoring

**Status (Oct 3–4, 2026):** live. Monitor at `scripts/monitor-health.mjs`, scheduled by
[`.github/workflows/prod-health-monitor.yml`](../.github/workflows/prod-health-monitor.yml),
gates in `tests/prod-health-monitor.test.ts` (inventory id `HM`).

Production is Hostatom/Plesk (`docs/hostatom-live.md`). The *check* runs externally
against the public hostname; the *ping* runs on the server itself as a Plesk
scheduled task — see [§3a](#3a-the-plesk-pinger-primary-watchdog). GitHub's `*/10`
cron is retained as a secondary ping source.

---

## 1. The unexplained restart — what it actually was

After the Oct 3 navbar deploy, `/api/v1/health` reported `uptime: 7s`. That reads like
a crash: the app had been restarted with no deploy, no panel restart, and an empty
Apache `error_log`. It was **not** a crash. It was **Passenger reaping an idle
process**.

### Evidence

| Observation | Result |
|---|---|
| Apache `error_log` (vhost `logs/`) | **0 bytes** since 06:45 — nothing ever errored |
| Uptime during **continuous** traffic (16 polls @ 15 s) | strictly monotonic, 37 s → 286 s, **zero resets** |
| Uptime after a **multi-minute gap** | reset to a small value every time (4 s, 7 s, 3 s) |
| File created in `httpdocs` **during** continuous polling | uptime kept climbing 27 s → 122 s, **no restart** |
| Cold-boot latency right after an idle gap | **6006 ms** vs ~350 ms warm — a fresh process |

That last row is the clincher: the first request after a quiet period costs ~6 s
because the whole Next.js boot (including the Infisical auth in `server.js`) runs
again. A crash would not leave a *fast, healthy* process behind.

### Ruled out along the way

- **A crash / OOM.** Empty `error_log`, and the app is healthy immediately after.
- **File changes in the app root.** Tested directly — writing a file into `httpdocs`
  during continuous traffic did **not** restart the app. (This was the leading theory
  because the first reset happened right after deleting files via File Manager.)
- **A periodic restart.** 16 consecutive polls over 4 minutes never reset.
- **The scheduled task.** None was active; the leftover diagnostic task was
  deactivated and later deleted.

### Why it matters

The site is low-traffic, so **most uptime resets are this harmless reap.** A monitor
that alerts on every reset would cry wolf several times a day. That is the whole
reason the classifier below exists, and why a naive "uptime went backwards" check is
the wrong tool.

---

## 2. What the monitor does

```
node scripts/monitor-health.mjs [--url …] [--state …] [--history …] …
```

One check of `GET /api/v1/health`, compared against the previous check:

| Verdict | Meaning | Alerts? |
|---|---|---|
| `ok` | healthy, uptime not going backwards | no |
| `idle-reap` | uptime reset after ≥ `--idle-reap-seconds` (180) of no checks — the expected Passenger behaviour | **no** |
| `restart` | uptime reset while the app was recently active — a real unexpected restart | **yes** |
| `unreachable` | DNS/TLS/timeout, or a non-200 | only after `--failure-threshold` (3) in a row |
| `unhealthy` | HTTP 503, `status != healthy`, or `database: error` | only after 3 in a row |

**Exit codes are the alerting contract:** `0` ok · `1` alert · `2` the monitor itself
is misconfigured. `2` is deliberately distinct so "the monitor is broken" is never
mistaken for "production is down".

State persists to `--state` (JSON: `lastCheckAt`, `lastUptime`, `consecutiveFailures`,
capped `restarts` log) and every check appends a line to `--history` (NDJSON).
A missing or corrupt state file re-baselines rather than failing — a monitor that
stops because its state file is ugly has silently stopped monitoring.

Uptime jitter is absorbed by `--uptime-tolerance-seconds` (5): the two readings happen
at different instants, so uptime never rises by exactly the elapsed time.

### Run it by hand

```bash
npm run monitor:health                    # against production, default paths
node scripts/monitor-health.mjs --help
```

### 2a. Is anything actually for sale?

`/api/v1/health` answers "can the app reach the database", not "is there something
to buy". On 2026-11-19 the shop served **29 published products with a sellable total
of 0** while health reported `database: ok` on every check: every variant was out of
stock and the last **13** `available` GiftCodes had no variant (`variantId IS NULL`),
so they counted as inventory, appeared in no product row and could never be
delivered. The storefront looked normal and nothing could be bought — and no check
looked at it.

`scripts/check-sellable.mjs` now runs on every monitor tick against
`GET /api/v1/internal/sellable-health` (read-only, `x-cron-token`, fail-closed `503`
when `NK_CRON_SECRET` is unset). The endpoint sums, over every active variant of
every published product, `sellableStock(stock, availableCodes)` — the same number
`src/lib/data.ts` serves the catalog and the pricing resolver accepts — and counts
`available` GiftCodes with no variant.

It fails (`exit 1`, red run, `::error` annotation, optional webhook) when either rule
breaks:

| Condition | Why it matters |
|---|---|
| `sellableUnits < 1` | Nothing in the shop can be handed over: every published variant is out of stock, has no deliverable code, or both. |
| `detachedAvailableCodes > 0` | An `available` code belonging to no variant is inventory that can never ship. Migration `20261117093000_giftcode_available_requires_variant` blocks new ones; this catches rows that predate the trigger or arrive by a path it does not see. |

Exit codes match the health monitor: **0** sellable · **1** not sellable · **2** the
check could not run (no token, 401/503, a 404 because the deployed build predates the
route, unreadable payload). `2` must never be read as a shop outage.

The numbers are gross: units held by a `pending_payment` order are not subtracted,
because a hold lasts minutes while this question is whether the catalog can sell at
all. Run it by hand with `npm run monitor:sellable` and `NK_CRON_SECRET` in the env.

---

## 3. Alerting

The scheduled workflow runs the check every 10 minutes and alerts by **failing the
job**, which notifies the repo owner by email and leaves a red run.

Optional extras, both opt-in via repo secrets:

| Secret | Effect |
|---|---|
| `PRODUCTION_ALERT_WEBHOOK` | also POSTs `{"text": …}` to Slack / Discord / Line |
| `HEALTHCHECKS_PING_URL` | tells [healthchecks.io](https://healthchecks.io) the run's verdict: pings the check as **up** when the job is green, and `<url>/fail` when any step failed — the alerting path that works with no webhook |

The healthchecks ping is the **dead-man's switch**: a green job says nothing about
whether the *schedule* is alive. GitHub disables scheduled workflows after 60 days
of repo inactivity and silently delays them under load, and only an external
watchdog notices "nothing has pinged in 20 minutes".

> **The GitHub cron is not a reliable 10-minute pinger.** Measured Oct 4: scheduled
> runs arrived 148 and 343 minutes apart, against a healthchecks window of 30 minutes
> (period 10 + grace 20). That is why the primary pinger is now a Plesk task — see
> [§3a](#3a-the-plesk-pinger-primary-watchdog).

State travels between runs through the Actions cache (`restore-keys` picks the most
recent entry), because every runner is ephemeral. History is uploaded as an artifact
(30-day retention).

### Setting up the dead-man's switch

Requires your accounts — an agent cannot create either one. About two minutes.

1. **Create the check** at [healthchecks.io](https://healthchecks.io/) (Sign Up →
   *Add Check*). Name it `nongkatistore health monitor`.
2. **Set the period to 10 minutes** to match the cron (`*/10 * * * *`), and give it
   a **grace period of about 20 minutes**. This is the setting people get wrong:
   healthchecks defaults to a 24 h period with no grace, so a 10-minute cron would
   either never alert or fire constantly. Period = 10 min, grace = 20 min, alert if
   no ping for 30 minutes.
3. Choose an alert channel (email is enough to start).
4. **Copy the ping URL** — it looks like `https://hc-ping.com/<uuid>`. Use the bare
   ping URL; the workflow already appends nothing to it.

   > **Never commit the real ping URL to this repository.** `nong-kati-site` is a
   > **public** repo, and anyone who has the URL can mark the check "up". A ping URL in
   > git would silently disarm the dead-man's switch it is supposed to provide — the
   > failure would look like a healthy system. It belongs in the repo *secret* only,
   > and in whatever password manager holds it.
5. **Add it as a repo secret**: GitHub → repo → Settings → Secrets and variables →
   Actions → *New repository secret*, name **`HEALTHCHECKS_PING_URL`**, paste the
   URL. The exact name matters; the workflow reads that key.
6. **Confirm it works**: Actions → *Production Health Monitor* → *Run workflow*. The
   step logs `job green — pinging the check as up`, and the check flips green within a
   minute; a wrong URL logs `ping failed (non-fatal)`. If the log says
   `::error no alert channel`, the secret name is wrong (it is `HEALTHCHECKS_PING_URL`).

**A red run alerts through this ping, not through a webhook.** The step reads the job's
own verdict: green pings the check as up, and **any** failing step pings `<url>/fail`,
which is what makes healthchecks send the notification immediately rather than waiting
for the watchdog window. One configured check therefore covers site health, the
housekeeping sweeps and the sellable-stock check, with `PRODUCTION_ALERT_WEBHOOK` unset.
The ping used to be unconditional, so a failed run reported a healthy check and nothing
could page anyone (2026-11-21: 11 red runs in 12). Prove delivery once with *Send test
notification* on the check's email integration instead of waiting for a real outage.

Verify by absence, not presence: once wired, the failure this protects against is a
check going **quiet**, which looks identical to a healthy system from inside GitHub.

### 3a. The Plesk pinger (primary watchdog)

The dead-man's switch needs *reliable* pings, and GitHub's shared-runner cron is
not reliable. A Plesk scheduled task pings healthchecks.io from the production
server every 10 minutes.

**Why this shape.** The task is chrooted into the vhost: no `date`, no absolute
paths, and `curl` needs `-k` because the chroot has no CA bundle. The command field
**must contain zero double-quote characters** — the runner wraps the command in
double quotes, and an inner `"` truncates it silently.

```
cd httpdocs && curl -fsSLk https://hc-ping.com/<uuid>
```

Plesk → **Scheduled Tasks** → *Add Task*: type *Run a command*, run *Cron style*,
`*/10 * * * *`, **Active** ticked, description `healthchecks.io watchdog ping (10 min)`.

> **The "Active" checkbox gates Run Now.** Unticked, Plesk accepts the click and
> does nothing — and shows a *stale* "successfully completed" toast from an earlier
> session, which looks exactly like success. Verify a ping actually arrived rather
> than trusting the toast.

**Measured (Oct 4, server local ICT):**

| Time | Event | Source |
|---|---|---|
| 13:18 | `OK` | `20.64.204.241` curl/8.5.0 — GitHub runner |
| 13:48 | **`up ➔ down`** | 30 min with no ping — **false alert**, site was serving 200s |
| 14:18 | `OK` | `147.50.254.11` curl/7.88.1 — Plesk (manual *Run Now*) |
| 14:18 | `down ➔ up` | cleared by that ping |
| 14:20 | `OK` | `147.50.254.11` — Plesk, **unattended cron fire** |
| 14:30 | `OK` | `147.50.254.11` — Plesk, second unattended cron fire |

Two consecutive unattended fires, each landing exactly on a `:10` boundary, with no
status flip in between. The 13:48 row is the whole argument for this task: a
fabricated outage, caused by a scheduler skipping, on a site that never stopped
answering.

**Verify the ping without reading the URL.** Check the check's *Events* log in
healthchecks.io: a cron fire appears as a new `OK` line from the server's IP on the
`:00/:10/:20…` boundary. Read the log, never the task field — the ping URL is a
credential (§3) and the Plesk task list renders it as plain text.

**Limitation, stated plainly.** This task runs on the server it monitors. If the
server dies, the ping dies with it and healthchecks correctly alerts *"ping
missing"* — but no path reports *"site is down"*. That is why the GitHub cron is
kept: it is the only pinger with an independent vantage point.

---

### 3b. The housekeeping sweeps (expiry, outbox drain) are NOT 10-minute

The GitHub workflow also calls the internal sweep endpoints. It asks for
`*/10 * * * *` and gets **4–5 runs a day, 3–5 hours apart** — measured
2026-11-05 over 12 runs (`01:51Z`, `21:49Z`, `16:00Z`, `10:53Z`, `07:56Z`, …),
every one of them green. GitHub treats `schedule` on a public repo as best
effort; this repo is public. The endpoints are fine, the *cadence* is not.

What the lag actually costs, checked one at a time rather than assumed:

| Thing | Depends on the tick? |
|---|---|
| Stock held by an unpaid order | **No** — v1.1.13 filters holds by `createdAt`, so a hold expires on its own clock. This is why the audit ordered 1.1.13. |
| Customer mail (codes, confirmations) | **No** — the outbox drains through `after()` on enqueue; the cron is recovery for a crash or provider outage. |
| A `pending_payment` row reading "awaiting payment" | **Yes** — `NK-2026-000190` (created 04:31Z, window closed 05:01Z) still said so when read at 06:38Z. |
| The order-expired notice | **Yes** — late by up to a tick. |
| Expired promotions staying redeemable | **Yes** — up to a tick. |
| Slip-evidence retention (30 days) | No, daily either way. |

Paying late is safe (v1.1.12 accepts a slip after expiry), so the honest
summary is: **tidiness and a few late-day coupons, not money.** That is why
there is no scheduler in the codebase for this.

**The sweeps now tick on their own — Plesk task 254** (`*/10 * * * *`, Active,
`housekeeping sweeps (10 min)`), which calls `internal/orders/expire`,
`internal/promotions/expire` and `internal/email-outbox/drain`. It is a
*separate* task from the §3a pinger on purpose: editing the pinger would mean
handling its ping URL, which is a credential.

```
cd httpdocs && curl -fsSk --max-time 30 -K tmp/cron-curl.conf -X POST -o tmp/sweep-last.json https://nongkatistore.com/api/v1/internal/orders/expire && curl -fsSk --max-time 30 -K tmp/cron-curl.conf -X POST -o /dev/null https://nongkatistore.com/api/v1/internal/promotions/expire && curl -fsSk --max-time 30 -K tmp/cron-curl.conf -X POST -o /dev/null https://nongkatistore.com/api/v1/internal/email-outbox/drain
```

**Why `-K` and not `-H`.** Measured on this server, 2026-11-05: Plesk's
scheduler **kills any command containing `$`**. `-H x-cron-token:$(cat
tmp/cron-token)` and a `T=$(cat …) && curl -H …$T …` both ended `error` in
under a second with empty output, while the identical command without `$` ran.
So the header cannot be built from a file in the shell at all. `server.js`
writes `tmp/cron-curl.conf` — a curl config holding `header = "x-cron-token:
…"`, mode 0600 — at boot, from the env it already injected from Infisical, and
the task reads it with `-K`. No substitution, no quoting, no parser to fight.

**Why a file and not the task field.** The task field is rendered as plain
text in the task list, and this repo is public. `tmp/` is Passenger's restart
directory, not the web root, and Plesk answers 403 for everything under it.
Careful: that 403 is *path*-based, not existence-based — `/tmp/does-not-exist`
also answers 403 — so it proves the file is not served, never that it exists.
Confirm a real file by listing (`ls -l tmp/`) through the task.

**What this does not fix.** `internal/settings/slip-retention` is daily and
stays on the GitHub cron (`17 3 * * *`); GitHub still runs the whole workflow
4–5 times a day, so its housekeeping step is now redundant rather than load
bearing. The media-orphan sweep (`internal/media/sweep?apply=1`) sits on the
same daily branch for the same reason — it reads a directory, not a row.

**Media orphans by hand.** `POST /api/v1/internal/media/sweep` with the cron
header and no `apply` is a **report only**: it answers `scanned`, `orphans`
(names, capped at 50, with `truncated` when there are more) and `deleted: 0`,
so a first look costs nothing.
Add `?apply=1` to delete. Both only consider files whose name is a valid image
key and which are older than 24 hours, and a file any product or non-`image:`
setting points at is never touched.

**Verify by effect.** `tmp/sweep-last.json` holds the last orders sweep's
counters (`scanned`, `expired`, `cutoff`, `timeoutMinutes`); `cutoff` advancing
is proof an unattended fire happened, since Plesk does **not** log
scheduler-initiated runs in `/smb/task/task-progress` (only Run Now attempts
appear there).

#### Without `NK_CRON_SECRET` (audited 2026-11-15)

**It is set** — Plesk → Node.js → Environment holds 12 variables including
`NK_CRON_SECRET` (next to `NK_SLIP2GO_SECRET`, `NK_SLIP2GO_BASE`,
`NK_DISCORD_WEBHOOK_URL`, the four `INFISICAL_*`, `NEXT_PUBLIC_SITE_URL`,
`VERCEL_GIT_COMMIT_REF`, `NODE_OPTIONS`), and the live endpoints confirm it: with
no token and with a wrong token, `internal/orders/expire`,
`internal/promotions/expire`, `internal/email-outbox/drain` and
`internal/settings/slip-retention` all answer **`401 UNAUTHENTICATED`**. A
missing secret answers **`503`** instead, so 401 *is* the proof it is loaded.

If it ever disappears, the behaviour is not "sweeps run unauthenticated" or
"sweeps 401" — each route short-circuits **before** any auth check, so the whole
endpoint is closed, admin or not:

| Route | Answer with no `NK_CRON_SECRET` |
| --- | --- |
| `POST /api/v1/internal/orders/expire` | `503 {"error":"SWEEP_DISABLED"}` |
| `POST /api/v1/internal/promotions/expire` | `503 {"error":"SWEEP_DISABLED"}` |
| `POST /api/v1/internal/media/sweep` | `503 {"error":"SWEEP_DISABLED"}` |
| `POST /api/v1/internal/email-outbox/drain` | `503 {"error":"OUTBOX_DISABLED"}` |
| `POST /api/v1/internal/settings/slip-retention` | `503 {"error":"RETENTION_DISABLED"}` |

Note the consequence that is easy to miss: the admin-JWT fallback those routes
also accept is **unreachable**, because the `if (!secret)` return happens first. A
signed-in admin cannot trigger a sweep by hand either.

And `server.js` writes no header file — it logs
`[cron-token] NK_CRON_SECRET absent — no curl config written` and returns, so
Plesk task 254's `-K tmp/cron-curl.conf` fails on a missing file rather than on
a bad token. Two places would go quiet at once: the schedule and the manual
route.

What stops happening, in customer terms: `pending_payment` orders stop flipping
to expired (and stop notifying), expired promotions stay redeemable, queued mail
loses its recovery path, orphan image files accumulate, and **slip evidence is
never pruned** — the 30-day retention the PDPA note depends on stops being
enforced while the files keep accruing.

`tmp/sweep-last.json` ages out as the tell-tale: if its `cutoff` stops advancing
while orders keep being created, check the variable before the task.

#### `NK_INTERNAL_TOKEN` (audited 2026-11-15)

Not set in Plesk (neither the Environment list nor the Secrets store), and not in
Infisical. Only two endpoints read it — `internal/build-info` and
`internal/ops-health` — and both fall back to an admin JWT, so the effect is
narrow: **machine access to those two is disabled; a signed-in admin still reads
them**. Anonymous callers get `401 UNAUTHENTICATED` (measured on
`/api/v1/internal/ops-health` on 2026-11-15).

Nothing in this repo calls either endpoint with that token (no workflow, no
script), so its absence breaks no automation today. Set it only when something
machine-side actually needs to read build info or ops health without an admin
session — and then put it in Plesk **Secrets**, not the plain Environment list.

---

### Optional third-party uptime service

[UptimeRobot](https://uptimerobot.com) (free tier) was evaluated as an external
availability check. **It cannot replace this monitor:** it only sees up/down, so it
cannot distinguish an idle reap from an unexpected restart, which is precisely the
signal this setup exists to provide. It would be a reasonable *second* opinion on
plain downtime from a different network vantage point.

---

## 4. Tuning

| Flag | Default | Raise it when… |
|---|---|---|
| `--idle-reap-seconds` | `180` | you see false restart alerts from a legitimately quiet site; lower it if real crashes are being excused as idleness |
| `--failure-threshold` | `3` | the site flaps on deploys; lower it if you want faster paging and tolerate noise |
| `--uptime-tolerance-seconds` | `5` | the poll interval drops well below 10 s |

The workflow interval (10 min) is independent of `idleReapSeconds`: the classifier
compares against *measured* idle time, not the schedule.

---

## 5. Operational notes

- **A red "Production Health Monitor" run is actionable.** The step prints
  `::error title=nongkatistore.com health::…` with the actual verdict. Workflow
  commands only render from **stdout** — the monitor emits the annotation there
  deliberately, because the same line on stderr is silently dropped by GitHub.
- **A deploy legitimately trips nothing.** Restarting the app is expected after a
  deploy; the classifier sees a reset, and whether it alerts depends only on how long
  the app had been idle. If a deploy-restart pages you, lower the threshold
  consciously or pause the schedule for the deploy window.
- **`gitSha` is not checked by this monitor.** It reads Infisical's `GIT_SHA`, which
  can lag the deployed build (it still said `13bdf58` while `2ee2ae7` was live).
  Deploy verification still has to read `extract-check.txt` — see
  [deploy-hostatom-manual.md](deploy-hostatom-manual.md).
- **Never snapshot the Plesk Node.js page.** It renders the Infisical client secret
  in clear text (see [secret-rotation-checklist.md](secret-rotation-checklist.md)).