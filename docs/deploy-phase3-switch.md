# Phase 3 switch — Run Now, then prove it (2026-11-20)

One sitting, one manual click, then commands whose pass value is written next to each.
Steps 0–1 of [deploy-hostatom-manual.md](deploy-hostatom-manual.md) are already done: the bundle is
built, published and staged.

| Value                  | This release                                                         |
| ---------------------- | -------------------------------------------------------------------- |
| Target `BUILD_ID`      | `_7_wbXgAa0uZw_jLrpCcP`                                              |
| Target git sha         | `3bcdb6b14a23101357392bb69a514cfcc8083ac3`                           |
| Artifact commit (URL)  | `14e957caa1a6b75f94217a5ac81140882f5e4074`                           |
| Artifact branch tip    | `14e957c` — `deploy bundle _7_wbXgAa0uZw_jLrpCcP (git 3bcdb6b14a2…)` |
| Live before the switch | `sXlN595fgEXujyWRQth6p` / `206a6a2` / v1.2.5                         |
| Rollback lives in      | `httpdocs/.next.old` (the `sXlN595…` build)                          |

## 1 — The click

1. Hostatom clientarea → Web Hosting → _Web Hosting Go PL nongkatistore.com_ (74879) →
   การดำเนินการ → **Login to Plesk Control Panel**. SSO sessions expire in minutes; if a page
   bounces to `login_up.php`, re-SSO before continuing.
2. Plesk → **Websites & Domains** → `nongkatistore.com` → **Scheduled Tasks** →
   **Add Task** → type **Run a command**.
3. Paste this line — it is the repo's canonical Step-2 command, and it must keep **no `"` and no
   `$()`** (the runner wraps it in double quotes; an inner quote truncates it and the run dies in
   0 s with `unexpected EOF`):

```
cd httpdocs && rm -rf .next-stage && curl -fsSLk --max-time 180 -o deploy-bundle.tar.gz https://raw.githubusercontent.com/NatOhm/nong-kati-site/14e957caa1a6b75f94217a5ac81140882f5e4074/deploy-bundle.tar.gz?cb=$ && mkdir -p .next-stage && tar -xzf deploy-bundle.tar.gz -C .next-stage && grep -Fxq _7_wbXgAa0uZw_jLrpCcP .next-stage/.next/BUILD_ID && grep -Fxq 3bcdb6b14a23101357392bb69a514cfcc8083ac3 .next-stage/.next/GIT_SHA && rm -rf .next.old && if test -d .next; then mv .next .next.old; fi && mv .next-stage/.next .next && cp -a .next-stage/. . && rm -rf .next-stage deploy-bundle.tar.gz && { cat .next/BUILD_ID; echo; cat .next/GIT_SHA; echo; } > extract-check.txt && touch tmp/restart.txt
```

After pasting, scroll the field to the end and confirm it still ends `touch tmp/restart.txt`. The
field is one line with a length cap nobody has measured (this line is 695 chars, the longest pasted
so far), and a silently truncated command fails the same way the stripped quotes did: 0 s, or half
a swap.

4. File Manager → delete `httpdocs/extract-check.txt` if it is there. The control run below
   proves itself by _absence_, so a leftover from an earlier attempt would read as a pass.
5. **Active** stays unticked. Click **Run Now**, give it a minute, reload File Manager.
   **PASS** = there is still no `extract-check.txt`. That is the whole point of the control:
   unticked, Plesk accepts Run Now and does nothing, then shows a _stale_ "successfully completed"
   toast from an earlier session — which looks exactly like success. Nothing on disk is the only
   honest signal that an unticked task did not run.
6. Only now tick **Active**, then click **Run Now** a second time. **PASS** = `extract-check.txt`
   appears. Go straight to step 2.

Never click OK/**Save**, and never tick **Active** before step 5 has passed. Neither click needs a
Save, and once **Active** is ticked a Save is exactly what arms the cron — which would then re-fire
this command on every schedule: re-downloading the bundle, moving the live `.next` aside and
restarting the app. If a Save happens by accident, reopen the task, untick **Active**, OK/Save, and
confirm it is gone from Scheduled Tasks.

The page stays on the form after the click, so confirm the run at `/smb/task/task-progress` or just
go straight to step 2. Earlier runs on this box finished in seconds; the 180 s `--max-time` is the
ceiling, not the expectation.

## 2 — The extract, on disk

File Manager → `httpdocs/extract-check.txt` → exactly two lines:

- line 1 = `_7_wbXgAa0uZw_jLrpCcP`
- line 2 = `3bcdb6b14a23101357392bb69a514cfcc8083ac3`

**PASS** = exactly those two lines. The command downloads from the commit pinned in its URL and
compares both stamps to these literals (`grep -Fxq`) _before_ the swap, so a tarball from any other
release — including a well-formed stale one, the failure that used to need a rollback — is refused
with nothing moved.

Everything else is “no swap happened”:

- **No `extract-check.txt`** = refused before the swap. In the order worth checking: the field was
  truncated (the paste check after step 3); the pinned commit no longer resolves, so `curl -f`
  exits non-zero (each publish force-pushes the orphan branch); the download was cut off inside
  180 s; or one stamp did not match. The live `.next` was never moved, the shop still serves
  `sXlN595…`, and `.next-stage` is kept for inspection — nothing to undo, so read the run's
  notification line and fix that cause before clicking again.
- **Any other content** cannot come from this command — the greps run first and the swap copies
  those same files — so it means something outside the task wrote `.next`, or the file is a leftover
  from an earlier attempt (why step 4 deletes it first). Check `/api/v1/version` and roll back from
  `.next.old` before retrying.

The stamps and the pinned commit belong to one release. Pasting a previous release's line refuses
before the swap — that is the check working, not a broken run; take both values from the table at
the top (or from `scripts/deploy-artifact.sh`, which prints this line filled in).

If `package.json` dependencies or `prisma/schema.prisma` changed in this bundle, see
deploy-hostatom-manual.md §Step 3 (Run Node.js commands: `npm ci --omit=dev` /
`npm run postinstall`).

## 3 — Post-switch, in order (each line states its pass value)

```bash
B=https://nongkatistore.com

curl -s "$B/api/v1/version?cb=$RANDOM"
# PASS: "buildId":"_7_wbXgAa0uZw_jLrpCcP" AND "gitSha":"3bcdb6b14a2…
# Both, not either — a cached response can satisfy the buildId alone.

curl -s "$B/api/v1/health?cb=$RANDOM"
# PASS: "status":"healthy" and "checks":{"database":"ok", …}   (HTTP 200)

curl -s -o /dev/null -w '%{http_code}\n' "$B/api/v1/products?limit=2"   # PASS: 200
curl -s -o /dev/null -w '%{http_code}\n' "$B/"                         # PASS: 200
```

Four reads 30 s apart — a single green health read proves nothing on this host, where the failure
mode is a Passenger respawn every 45–90 s:

```bash
for i in 1 2 3 4; do curl -s "$B/api/v1/health?cb=$RANDOM"; echo; [ $i -lt 4 ] && sleep 30; done
```

**PASS** = `database: ok` in all four, and `uptime` climbs **past 90 s** with no reset.
**FAIL** = `database: error`, or a 503 whose uptime keeps cycling in the 25–90 s band. That is the
app holding an old secret: **Replace** `DATABASE_URL` and `DATABASE_DIRECT_URL` again on
Plesk → Node.js → Environment → **Secrets** (each row's own Replace button, never the bulk
textarea) and re-read. Do not touch the database.

### 3b — The gate

```bash
gh workflow run postswitch-gate.yml --ref master \
  -f build-id=_7_wbXgAa0uZw_jLrpCcP -f check-only=true
gh run list --workflow=postswitch-gate.yml --limit 3
```

**PASS today** = the job exits 0 and its log says _check-only: the release is live. The database
half of the gate was not run._ That is the honest ceiling here: Actions holds only
`HEALTHCHECKS_PING_URL` and `NK_CRON_SECRET`, so a full dispatch (`-f check-only=false`) passes its
wait and then fails at `TARGET_DATABASE_URL is not set, so the gate cannot certify` — a red run
that says _not certified_, not a broken release.

**Full certification** (needs `POSTSWITCH_TARGET_DATABASE_URL`, `PLESK_SSH_KEY`, `PLESK_SSH_HOST`
as repo secrets) has exactly one pass value: **`RESULT: 22/22 checks passed`**.

## 4 — Cleanup, and the way back

- File Manager → delete `httpdocs/extract-check.txt`. Keep `tmp/restart.txt`.
- **Rollback** if step 3 fails and a Secrets Replace does not fix it:
  `cd httpdocs && rm -rf .next && mv .next.old .next && touch tmp/restart.txt` — then
  `/api/v1/version` must read `sXlN595fgEXujyWRQth6p` again.
