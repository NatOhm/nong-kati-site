# Phase 3 switch — Run Now, then prove it (2026-11-20)

One sitting, one manual click, then commands whose pass value is written next to each.
Steps 0–1 of [deploy-hostatom-manual.md](deploy-hostatom-manual.md) are already done: the bundle is
built, published and staged.

| Value                  | This release                                                         |
| ---------------------- | -------------------------------------------------------------------- |
| Target `BUILD_ID`      | `hG0RHiUSkpldDxCrlAXQl`                                              |
| Target git sha         | `5a70a0e777676df05228244789d6e7dfe5df9175`                           |
| Artifact branch tip    | `7bc1c75` — `deploy bundle hG0RHiUSkpldDxCrlAXQl (git 5a70a0e7776…)` |
| Live before the switch | `sXlN595fgEXujyWRQth6p` / `206a6a2` / v1.2.2                         |
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
cd httpdocs && rm -rf .next-stage && curl -fsSLk --max-time 180 -o deploy-bundle.tar.gz https://raw.githubusercontent.com/NatOhm/nong-kati-site/deploy-artifact/deploy-bundle.tar.gz?cb=$$ && mkdir -p .next-stage && tar -xzf deploy-bundle.tar.gz -C .next-stage && grep -Eq '^[A-Za-z0-9_-]{8,}$' .next-stage/.next/BUILD_ID && grep -Eq '^[0-9a-f]{40}(-dirty)?$' .next-stage/.next/GIT_SHA && rm -rf .next.old && if test -d .next; then mv .next .next.old; fi && mv .next-stage/.next .next && cp -a .next-stage/. . && rm -rf .next-stage deploy-bundle.tar.gz && { cat .next/BUILD_ID; echo; cat .next/GIT_SHA; echo; } > extract-check.txt && touch tmp/restart.txt
```

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

The page stays on the form after the click — the toast is not the result. Watch the run at
`/smb/task/task-progress`, or just go straight to step 2. Earlier Run Now runs on this box finished
in seconds; the 180 s `--max-time` is the ceiling, not the expectation.

## 2 — The extract, on disk

File Manager → `httpdocs/extract-check.txt` → exactly two lines:

- line 1 = `hG0RHiUSkpldDxCrlAXQl`
- line 2 = `5a70a0e777676df05228244789d6e7dfe5df9175`

**PASS** = both lines match exactly. Anything else is **not** one failure mode, and this file is
written _after_ the swap. The two greps in the command check only the stamp's **shape**
(`^[A-Za-z0-9_-]{8,}$` and `^[0-9a-f]{40}(-dirty)?$`), never its value, so they cannot tell this
release from an older one:

- **No `extract-check.txt`** (or a run that dies in 0 s with `unexpected EOF`) = the run refused
  _before_ the swap: curl or tar failed, or a shape grep rejected the staged bundle. The live
  `.next` was never moved, so the shop is still serving `sXlN595…`. Fix the cause and re-run the
  click — this is the safe failure.
- **Well-formed but wrong lines** = the swap did happen, and something other than
  `hG0RHiUSkpldDxCrlAXQl` is now live. A stale `deploy-bundle.tar.gz` from an earlier release
  sails through both greps and is swapped in silently. Re-running the click would just swap the
  same wrong bundle again: restore first with the rollback in step 4 (`mv .next.old .next`, until
  `/api/v1/version` reads `sXlN595…`), then fetch the tarball by hand and compare its
  `.next/BUILD_ID` and `.next/GIT_SHA` with the table at the top before retrying.

If `package.json` dependencies or `prisma/schema.prisma` changed in this bundle, see
deploy-hostatom-manual.md §Step 3 (Run Node.js commands: `npm ci --omit=dev` /
`npm run postinstall`).

## 3 — Post-switch, in order (each line states its pass value)

```bash
B=https://nongkatistore.com

curl -s "$B/api/v1/version?cb=$RANDOM"
# PASS: "buildId":"hG0RHiUSkpldDxCrlAXQl" AND "gitSha":"5a70a0e7776…
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
  -f build-id=hG0RHiUSkpldDxCrlAXQl -f check-only=true
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
