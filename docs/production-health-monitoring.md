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

---

## 3. Alerting

The scheduled workflow runs the check every 10 minutes and alerts by **failing the
job**, which notifies the repo owner by email and leaves a red run.

Optional extras, both opt-in via repo secrets:

| Secret | Effect |
|---|---|
| `PRODUCTION_ALERT_WEBHOOK` | also POSTs `{"text": …}` to Slack / Discord / Line |
| `HEALTHCHECKS_PING_URL` | pings [healthchecks.io](https://healthchecks.io) after every run |

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
   ping step logs `ping failed (non-fatal)` if the URL is wrong, and the check's
   status flips to green within a minute. If the job log says
   `HEALTHCHECKS_PING_URL not set — skipping`, the secret name is wrong.

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