# Deploy to Hostatom thsv93 — the working path (as shipped Sep 30, 2026)

This replaces the earlier no-SSH plan (File-Manager upload + `install-hostatom.sh`). That path is
kept as a fallback in [scripts/install-hostatom.sh](../scripts/install-hostatom.sh), but the flow
below is what actually shipped the live build.

> **Use `scripts/deploy-artifact.sh` for every deploy** — it automates Step 0 and Step 1, prints the
> BUILD_ID and the Run-Now one-liner, and never touches your working tree. The steps below are the
> same flow spelled out manually; keep them as the fallback and as the explanation of what the
> script does. This file predates the script.

> **Current live build (Nov 13, 2026): `d731fa1`, v1.2.0 #425, BUILD_ID `cd-f9HRtjjej-SFkkmc3X`.** Repo HEAD is
> level with live: 1.2.0 ships the client's eight-item list (bank top-ups with admin approval,
> refund-to-credit, cart re-pricing and package labels, dashboard auto-refresh, the 1.1.21
> stacked-chrome fix, and the VAT/query speed work). See the deploy log in
> [hostatom-live.md](hostatom-live.md) §5. The `3cfd380..HEAD` range has **no `prisma/` changes**, so no
> migration is needed, and `package.json` only bumps its version — the slow `npm ci` deps task can be skipped.

> **⛔ Never read the `INFISICAL_CLIENT_SECRET` value in the Plesk panel.** It renders in clear text
> and reading it has now burned that credential twice (Sep 30 and Oct 3). Presence checks only.

> **Preconditions (all done, don't redo):** DNS points at thsv93 (`docs/dns-migration.md`),
> Let's Encrypt cert installed, Node.js panel configured (Node 20.20.2, startup file
> `server.js`, app mode production, app root `/httpdocs`), `node_modules` installed on the server
> (Linux-native Prisma/SWC), Plesk env = 5 × `INFISICAL_*` + `VERCEL_GIT_COMMIT_REF=master`
> (**required — two routes read it; do not "clean it up"**),
> Infisical Production holds the real secrets. `server.js` boots from Infisical, falls back to the
> last good set cached in `tmp/infisical-cache.json` (0600, ≤ 24 h) when Infisical is unreachable,
> and still refuses to boot when `DATABASE_URL` or `NK_JWT_SECRET` is missing — fail-closed on a
> partial set, not on a transient outage (2026-11-18).
> **There is no `.env` on the server** — a deploy that omits the `INFISICAL_*` vars breaks prod.

**Servers:** app = `thsv93.hostatom.com` (**147.50.254.11**), Plesk at
`https://thsv93.hostatom.com:8443` (SSO: clientarea → product 74879 → **Manage Domains**).
Sessions expire in minutes — re-SSO right before each Plesk step.

---

## Step 0 — Build + stage the bundle (local, Git Bash)

> **One command for the whole path: `bash scripts/deploy-manual.sh`.** It publishes the bundle
> (Step 0 + 1), prints the Run-Now instruction, waits until the live site serves the BUILD_ID it
> just published (Steps 2–5 happen while it watches), and then **certifies the release automatically**
> with the post-switch gate (Step 5b). A failed certification prints the ❌ banner and exits 3; a
> switch that never lands exits 1. You click Run Now once and type one command.
>
> `bash scripts/deploy-artifact.sh` is the publish-only half (Step 0 **and** Step 1): it prints the
> BUILD_ID fingerprint, the Step-2 one-liner and the verification curls. Variants: `SKIP_BUILD=1`
> (reuse a fresh build), `DRY_RUN=1` (build + stage only, no push — and nothing gets certified).
> The commands below are the same flow spelled out manually — use them as fallback or to
> understand what the scripts do.

```bash
cd "<project root>"                       # webapp/nong-kati/nong-kati
export NEXT_PUBLIC_SITE_URL=https://nongkatistore.com   # baked at build time — required
npm run build

rm -rf .deploy-stage deploy-bundle.tar.gz && mkdir .deploy-stage
cp -r .next .deploy-stage/.next && rm -rf .deploy-stage/.next/cache
cp -r public prisma .deploy-stage/
cp package.json package-lock.json next.config.js server.js .deploy-stage/
tar -czf deploy-bundle.tar.gz -C .deploy-stage .
du -h deploy-bundle.tar.gz                # ~31 MB

# Fingerprint it now — this string is the ground truth for every later check:
cat .next/BUILD_ID
```

## Step 1 — Publish the bundle to GitHub

The server can't upload via File Manager reliably at 31 MB and has no SFTP; instead it **pulls**
the bundle from a GitHub raw URL. Keep a dedicated branch. `scripts/deploy-artifact.sh` does this
via a temporary git index (orphan commit containing **only** the tarball) — it never touches your
working tree, index or current branch. Manual equivalent:

```bash
git add -f deploy-bundle.tar.gz && \
git commit -m "deploy bundle <BUILD_ID>" && \
git push origin 'HEAD:deploy-artifact' --force && \
git reset HEAD~1                       # unstage from your working branch again
```

Raw URL — pin the **artifact commit**, never the branch (used in Step 2):
`https://raw.githubusercontent.com/NatOhm/nong-kati-site/<artifact-commit-sha>/deploy-bundle.tar.gz`

`<artifact-commit-sha>` is the orphan commit just force-pushed to `deploy-artifact`;
`scripts/deploy-artifact.sh` prints the filled-in line. A commit can only ever serve the bytes it
was pushed with, so no CDN copy of a _different_ release can arrive — the branch ref can serve one,
which is how 1.1.1 reinstalled its predecessor. Re-pin at every release: each publish force-pushes
the orphan branch, and an old sha eventually stops resolving — which `curl -f` turns into a refusal
before anything is swapped, not a half-deploy.

Commit the bundle file itself on that branch (this flow is build-artifact-as-branch; the branch
holds only the tarball, force-pushed each deploy).

> **Infisical `GIT_SHA` is now optional.** `/api/v1/version` reads `buildId` from
> `.next/BUILD_ID` on disk — the build actually serving requests — so verification can no
> longer be fooled by a stale hand-set value. Setting `GIT_SHA`/`GIT_REF` still populates
> the legacy `gitSha`/`gitRef` fields for the audit trail, but they are informational
> only; do not treat them as the verification signal. (They lied: on Oct 4 they reported
> `2ee2ae7` while production served `cbbe097`.)

## Step 2 — Scheduled Task (Run Now, don't save)

Plesk scheduled tasks run **chrooted**: relative paths only (`httpdocs/…`), no `pkill`/`sleep`,
no CA certs (`curl` needs `-k`), absolute `/var/www/...` paths fail. **`tr` is not installed
there** (2026-11-02: a `cat … | tr … | grep` stamp check died with `tr: command not found` and
took the deploy with it) — `grep`, `cat`, `tar`, `cp`, `mv`, `rm` all work.

1. Plesk → **Websites & Domains** → **Scheduled Tasks** → **Add Task** → type **Run a command**.
2. Command (one line, chroot-safe). It names **one** release — the artifact commit in the URL and
   both stamps literally — so it can only ever stage that build; refill both values from
   `scripts/deploy-artifact.sh`'s output when the target bundle changes:

```
cd httpdocs && rm -rf .next-stage && curl -fsSLk --max-time 180 -o deploy-bundle.tar.gz https://raw.githubusercontent.com/NatOhm/nong-kati-site/7bc1c753b89cf7ad1fba1833337c004884463778/deploy-bundle.tar.gz?cb=$$ && mkdir -p .next-stage && tar -xzf deploy-bundle.tar.gz -C .next-stage && grep -Fxq hG0RHiUSkpldDxCrlAXQl .next-stage/.next/BUILD_ID && grep -Fxq 5a70a0e777676df05228244789d6e7dfe5df9175 .next-stage/.next/GIT_SHA && rm -rf .next.old && if test -d .next; then mv .next .next.old; fi && mv .next-stage/.next .next && cp -a .next-stage/. . && rm -rf .next-stage deploy-bundle.tar.gz && { cat .next/BUILD_ID; echo; cat .next/GIT_SHA; echo; } > extract-check.txt && touch tmp/restart.txt
```

> **⚠️ The command must contain ZERO double-quote characters.** The runner wraps it in a
> double-quoted string before handing it to the shell, so any inner `"` truncates the command.
> Symptom: `-: -c: line 1: unexpected EOF while looking for matching '"'`, reported as
> *"completed with error in 0 seconds"* — the shell dies before `curl` ever runs, so the server
> never touches GitHub and no file appears. This silently ate two days of deploys on Oct 3.
> Corollary: never use `curl -w "code=%{http_code}"` here. Put the value in a file instead
> (`-o head.txt`, or `-w` output appended with a plain `echo`), or drop `-w` entirely.

3. Click **Run Now**. **Do not click OK/Save** — leave the task unsaved so it doesn't fire
   on a schedule later. (If your Plesk build insists on saving, delete the task after the run.)

What it does: download the bundle (180 s timeout) from the pinned commit into `.next-stage` —
**nothing live is touched yet** → compare both stamps to these literal values (`grep -Fxq`: the whole
line must be exactly this `BUILD_ID` and exactly this 40-hex `GIT_SHA`); a truncated tarball, a
stale CDN copy, a different release, or a `<sha>-dirty` build all fail HERE and exit before the
swap → move the live `.next` aside to `.next.old`, move the staged one in, copy
the rest over in place → drop the tarball → write both stamps into `httpdocs/extract-check.txt` →
touch `tmp/restart.txt` (Passenger restart signal). `VERSION` is deliberately NOT required:
`stamp-git-sha.mjs` only warns when it cannot stamp one, so demanding it here would block a deploy
the build itself allows.

> **Why staging (2026-11-02).** The old line deleted the live build before it knew the download was
> usable: a truncated tar left no `.next` at all, and a stale-but-valid CDN copy silently
> reinstalled the previous build (1.1.1's first Run Now). Two guards now stand in front of that:
> the URL names a commit, and the stamps are compared by value, so a stale bundle cannot pass the
> greps. `?cb=$$` stays as the cache-buster — the wrapper expands `$$` to the run's PID, so even a
> ref-based URL would be fetched fresh. Swap is last, and `.next.old`
> stays as the on-disk rollback (`cd httpdocs && rm -rf .next && mv .next.old .next && touch
> tmp/restart.txt`). The `rm -rf .next.old` stays BEFORE the rename on purpose: `mv .next .next.old`
> would nest `.next` inside an existing `.next.old`. A refused bundle leaves `.next-stage` and the
> tarball for inspection; the next Run Now clears both.

### The nightly task — guarded compare-before-extract (2026-10-27)

A pre-existing task at **00:51** used to run `npm ci; npx prisma generate; npm run build`
inside `httpdocs`. That tree carries the COMPLETE OLD SOURCE (`src/`, `tsconfig.json`,
`node_modules/next`; no `.git`), so on the nights it succeeded it rebuilt `.next` from stale
source and **reverted whatever had just been deployed**. It is the revert vector this whole
provenance work exists to kill.

Its command is now a guarded re-extract of the artifact branch instead — automated runs may
only confirm they match, never pick a different commit:

```
cd httpdocs && curl -fsSLk -o deploy-bundle.tar.gz https://raw.githubusercontent.com/NatOhm/nong-kati-site/deploy-artifact/deploy-bundle.tar.gz && tar -xzf deploy-bundle.tar.gz -O .next/GIT_SHA > incoming-sha.txt; if test -f .next/GIT_SHA && cmp -s .next/GIT_SHA incoming-sha.txt; then echo UP-TO-DATE > nightly-check.txt && cat .next/GIT_SHA >> nightly-check.txt && rm -f deploy-bundle.tar.gz incoming-sha.txt; else echo MISMATCH > nightly-check.txt && cat .next/GIT_SHA >> nightly-check.txt 2>/dev/null; echo ARTIFACT-SAYS: >> nightly-check.txt && cat incoming-sha.txt >> nightly-check.txt && rm -f deploy-bundle.tar.gz incoming-sha.txt && exit 1; fi
```

Design notes — do not "simplify" these away:

- **Two one-liners on purpose.** The Step-2 command above names one release and nothing else: it
  fetches that commit and refuses unless both stamps are exactly that build, so a human deploy
  cannot stage anything but the release the line was written for. It never _reads_ the artifact
  branch, so it also cannot be surprised by what the branch holds. Only the nightly compares the
  artifact to what is live, because there "artifact differs from production" always means something
  is wrong (a deploy landed without updating the artifact branch, or the branch was force-pushed
  with something else).
- **No `"` and no `$(...)` in the command.** The Plesk runner wraps it in a double-quoted
  string: an inner `"` truncates it (see the warning above), and a `$(...)` would be expanded
  by the wrapper's shell against the wrong working directory BEFORE the chroot shell runs.
  The comparison is therefore `cmp -s` on the two GIT_SHA files (exit code, no substitution).
  `cmp` missing from the chroot fails CLOSED — the extract half never runs. The Step-2 line obeys
  the same rule: `$$` is the only `$` in it (a cache-buster, not a substitution), and no variable
  assignment is used there because the wrapper would expand `$NAME` to empty before the chroot
  shell ever saw it.
- **Equal → `UP-TO-DATE`, exit 0, `.next` untouched.** Mismatch → `MISMATCH` + both SHAs in
  `httpdocs/nightly-check.txt`, exit 1 so the failure is visible in the task log. A human
  resolves it by running the normal Step-2 deploy, after which the nightly goes green again.
- **Never let this task run `npm run build` again.** The bundle is built locally from a
  committed tree and shipped whole; the server's source copy is a stale snapshot that has no
  business producing builds.

Panel state as of 2026-10-27 `[V]`: the 00:51 nightly task (id 236) was **deactivated and its
command rewritten to an inert `echo` banner** — it can no longer rebuild or revert anything.
If a nightly build is ever wanted again, restore a command here, never the old
`npm ci; npx prisma generate; npm run build` line.

**Two dead tasks seen only in toasts, NOT deletable from this panel `[V]` (2026-10-27):**
`ext-git-task\deployment` (fails: `could not read Username for 'https://github.com'`) and
`export NEXT_PUBLIC_SITE_URL=... && bash deploy-hostatom.sh` (fails in 0 s). They do not appear
in this subscription's Scheduled Tasks list (5 entries: watchdog ping, bundle pull, PROBE3,
RESTORE, and the now-disabled nightly), so they are not crontab rows here and the panel's
Remove control cannot reach them. They surface only as stale run-result toasts. **Do not burn
session time hunting them** — they cannot fire from this scheduler and pose no deploy risk.
(If they are ever confirmed harmful, remove them from whatever module owns that scope — Plesk
> Tools & Settings, not the domain scheduler.)

## Step 3 — Verify the extract

File Manager → `httpdocs/extract-check.txt` → two lines: BUILD_ID, then git SHA — the first must
equal the Step-0 BUILD_ID exactly, the second the `git sha` the script printed. Both are the same
literals the task compared before it swapped anything, so a `<sha>-dirty` build (or any other
release) never reaches this point. **No file at all** means the task refused before the swap: the
previous build is still live and `httpdocs/.next-stage` holds the refused bundle for inspection.
A stale artifact used to be visible here even when its stamps were well-formed; the literal compare
now refuses it upstream, before the swap. (Last recorded live build, 2026-11-03:
`Cvm6k6VOEzORNV_BiJ7QN`, git SHA `a9c9472…`, v1.1.15 / #402 — see the deploy log in
[hostatom-live.md](hostatom-live.md) §5; always trust the BUILD_ID the script just printed over
that line.)

**Only if dependencies changed** also install them (this is the slow one, 5–15 min).

**Do not try this from a Scheduled Task.** The task chroot for this domain contains no `node`
binary at all — `/opt/plesk/node/<major>/bin` does not exist inside it, and
`find / -name node -type f` returns nothing. Use Plesk → Node.js → **Run Node.js commands**,
which runs with the panel's own Node (20.20.2):

| What changed | Command to run there |
|---|---|
| `package.json` dependencies | `npm ci --omit=dev` |
| `prisma/schema.prisma` | `npm run postinstall` (the repo already defines this as `prisma generate`) |

The second row is **required** whenever a schema change ships, and skipping it is not cosmetic:
the extracted bundle deliberately carries no `node_modules`, so the server keeps its existing
Prisma Client — which was generated from the *old* schema. Every query touching a model whose
columns changed then throws. (Adding a nullable column that is only ever read, never selected
explicitly, degrades more quietly: the column simply comes back `undefined`.)

(`node_modules` persists between deploys — skip all of this on most deploys.)

## Step 4 — Restart the app

Usually `tmp/restart.txt` already did it on first request. Escalate only if Step 5 shows the old
build.

> **Identity check (do this while you're on the Node.js dashboard for the restart):** in
> "Custom environment variables", the `INFISICAL_CLIENT_ID` value must start with the prefix
> recorded in [hostatom-live.md](hostatom-live.md) §3 ("Expected INFISICAL_CLIENT_ID prefix").
> - **Matches** → proceed with the restart.
> - **Differs** → STOP before restarting: someone edited the panel env (or you're on the wrong
>   subscription). Confirm the change is intentional (e.g. the identity swap in
>   [infisical-identity-swap-plesk.md](infisical-identity-swap-plesk.md) landed and the doc wasn't
>   updated) — then update the §3 line and continue. An unexpected identity in the panel means the
>   app's next boot will authenticate as whatever that identity can read; never deploy on top of
>   an unexplained env change.

- **A.** Plesk → **Node.js** → Dashboard → **Restart App** (first request after restart is slow).
- **B. Console kill** (when A doesn't take): Plesk → Node.js → **Run Node.js commands**, run:
  `exec -c "touch httpdocs/tmp/restart.txt; pkill -9 -u nongka -f next-server; echo K1; pkill -9 -u nongka -f server.js; echo K2; pkill -9 -u nongka -x node; echo K3"`
  The K3 line kills the runner itself — that's expected (`K3` just won't print). Passenger
  respawns from the new disk on the next request.

## Step 5 — Verify live (public hostname, no `-k`, no tricks)

```bash
curl -s https://nongkatistore.com/api/v1/version
#    → {"buildId":"<BUILD_ID>","gitSha":"…","gitRef":"…"}
#    buildId MUST equal the BUILD_ID printed by deploy-artifact.sh in Step 1.
#    gitSha/gitRef are Infisical echoes and may be stale — they are not the check.
curl -s https://nongkatistore.com/api/v1/health
#    → {"status":"healthy", ... "database":"ok"}
curl -s -o /dev/null -w "%{http_code}\n" https://nongkatistore.com/api/v1/products   # 200
curl -s https://nongkatistore.com/ | grep -c turbopack    # 0 = new build (old build ~1+)
```

The `turbopack` grep is the fastest build fingerprint: the broken old build (`vXkxrhTAsXOw2NRxcrQ_1`)
loads `turbopack-*.js`; the Turbopack-less production build never does.

## Step 5b — Certify (the post-switch check)

"Live" is not "working": the steps above prove the right bytes are being served, not that the shop
runs against its database. `scripts/postswitch-check.mjs` is the 22-check Phase 7 gate — health, a
real table query through the app's schema, migrations applied, a restarted process, catalogue
counts against MariaDB, admin password + 2FA + cookie, one real order, one code redemption, media
and the storefront HTML. It writes fixtures and restores them, so two runs leave the shop
identical.

**Certification is not a step you remember — it is part of the deploy.**

```bash
bash scripts/make-gate-env.sh        # hidden prompt → tmp/nk6/gate.env (0600, gitignored)

export SITE_URL=https://nongkatistore.com
bash scripts/deploy-manual.sh        # publish → you click Run Now → wait → certify
```

`make-gate-env.sh` never echoes a value and never puts one on a command line: it
prompts with `read -s`, writes `TARGET_DATABASE_URL` + `NK_JWT_SECRET` into
`tmp/nk6/gate.env` (mode 0600, under the ignored `tmp/` — never inside the
checkout's tracked files) and prints only the parsed shape: user, host, port,
database name and both lengths. The shop's MariaDB user is created `@'localhost'`
with **Allow remote access unchecked**, so this workstation cannot reach
`thsv93.hostatom.com:3306` with it however right the password is (checked
2026-11-19: TCP 3306 answers, Prisma answers `P1000`). Open the forward first —
`ssh -N -L 3307:localhost:3306 nongka@thsv93.hostatom.com` — and paste the shop
URL rewritten to `127.0.0.1:3307`, with any password character outside
`[A-Za-z0-9]` percent-encoded (`@`→`%40`, `:`→`%3A`, `#`→`%23`, `%`→`%25`,
`&`→`%26`, `?`→`%3F`, `/`→`%2F`), keeping `?connection_limit=5`. `certify.sh`
sources that file by itself when `TARGET_DATABASE_URL` is unset, so both deploy
paths find it. And because `scripts/postswitch-check.mjs` prefers `.env.local` / `.env`
over the environment, a gate failure at `admin login` means that file's
`NK_JWT_SECRET` — not the panel.

That one command does Steps 0–5b. It refuses to start if `TARGET_DATABASE_URL` is missing (exit 2,
before it publishes anything) **and, just as hard, if the route that credential names does not
answer**: `scripts/lib/gate-reach.mjs` opens it and runs one read-only `SELECT 1`, so a closed SSH
forward — the default state of `127.0.0.1:3307` — refuses here with exit 2 and prints the
unreachable `host:port/database`, instead of publishing a bundle that only fails the gate later.
A URL that parses is not a working route; this is the step that makes the difference. It then
waits up to `DEPLOY_WAIT_SECONDS` (default 900) for the live site to
answer with the BUILD_ID it published, then runs the gate. `bash scripts/deploy-full.sh` (the SSH
loop) runs the same gate as its own last step — both paths source `scripts/lib/certify.sh`, so the
checks, the banners and the exit codes are the same code.

| exit | meaning |
| --- | --- |
| `0` | the live release passed the gate, or `SKIP_POSTSWITCH=1` said so out loud |
| `1` | the switch never landed — the site still serves another build |
| `2` | nothing could certify it (`TARGET_DATABASE_URL` missing); refused before publishing |
| `3` | **live but not certified** — the ❌ banner names the failing check |

**It fails loudly.** A failing check exits non-zero and names itself (`catalogue`, `admin login`,
`order`, …), followed by the ❌ DEPLOY IS LIVE BUT NOT CERTIFIED box. The release stays live but is
not done — treat it as broken until the gate passes. The uptime bound is derived from how long the
deploy took, so a process older than the deploy fails the restart check.

After fixing the cause, re-run just the gate: `bash scripts/deploy-full.sh --postswitch-only`.

### Re-running the gate from the Plesk console (the host has no bash)

`bash scripts/deploy-full.sh --postswitch-only` is the workstation form. Do **not** paste it into
Plesk → Node.js → **Run Node.js commands**: that console runs `npm <input>` in `httpdocs`, strips
every quote and has no bash, so the wrapper cannot start. Its final step is the gate itself
(`certify_release` ends in `scripts/postswitch-check.mjs`), so run that directly — one line, no quotes:

```
explore next -- node --env-file=/var/www/vhosts/nongkatistore.com/httpdocs/tmp/nk6/gate.env /var/www/vhosts/nongkatistore.com/httpdocs/scripts/postswitch-check.mjs --base=https://nongkatistore.com --max-uptime=600
```

`npm explore next -- …` is the only shell on that box with Node 20 on PATH (the panel prepends the
`npm`). `--max-uptime` is what lets the `restart` check accept a fresh process: it must be **larger
than the app's current `uptime`**, so run this within ten minutes of Run Now or raise it to `86400`.
Omit it and the gate fails `restart` by design (it demands `--restart-cmd` or `--max-uptime`).

**The file it reads** — `httpdocs/tmp/nk6/gate.env`, mode `0600`, two lines, no quotes:

```
TARGET_DATABASE_URL=mysql://nongka_nongkati_nongkatistore:<current password>@localhost:3306/nongka_nongkati_nongkatistore?connection_limit=5
NK_JWT_SECRET=<32+ chars>
```

The host needs the **host's** route: `localhost:3306`, never `127.0.0.1:3307` (that port is the
workstation's SSH forward and means nothing on the host). Where the two values come from:

- **`TARGET_DATABASE_URL`** — the URL pasted into the Node.js **Secrets** at the 2026-11-18 rotation.
  Shortest path is to rewrite the workstation copy and copy it over, which prints nothing:

  ```
  ssh nongka@thsv93.hostatom.com "mkdir -p httpdocs/tmp/nk6 && chmod 700 httpdocs/tmp/nk6"
  sed 's#@127.0.0.1:3307/#@localhost:3306/#' tmp/nk6/gate.env > /tmp/gate.host.env
  scp /tmp/gate.host.env nongka@thsv93.hostatom.com:httpdocs/tmp/nk6/gate.env
  ssh nongka@thsv93.hostatom.com "chmod 600 httpdocs/tmp/nk6/gate.env" && rm -f /tmp/gate.host.env
  ```

- **`NK_JWT_SECRET`** — untouched by the rotation (it signs admin sessions, not the database); the
  same copy that the `sed`/`scp` above carries. No separate errand.
- **Do not rebuild this file from Infisical.** Since the rotation, Infisical's `DATABASE_URL` row
  still holds the **pre-rotation** password (phase 4 deletes it), so a gate built from that value
  authenticates nowhere and fails `database`/`catalogue` for the wrong reason.

**Reading the result.** The last line is the verdict:

```
RESULT: 22/22 checks passed                     → exit 0, the live release is certified
RESULT: 21/22 checks passed — 1 FAILED          → exit non-zero, then ✖ <check>: <detail>
```

Every check prints its own `✔`/`✖` line above it and names itself on failure (`database`,
`migration`, `restart`, `catalogue`, `admin login`, `order`, `redeem`, `media`). Fix that cause and
re-run the same line. If `admin login` is the one that fails, look at `httpdocs/.env.local` first:
`postswitch-check.mjs` prefers that file's `NK_JWT_SECRET` over the environment, so a stale copy
there wins over `gate.env`. If the console swallows the output, append
`> /var/www/vhosts/nongkatistore.com/httpdocs/tmp/nk6/gate-out.txt 2>&1` to the command and read
that file in File Manager. Delete `tmp/nk6/` once the phase is done.

`SKIP_POSTSWITCH=1` skips it and prints `this release is live but UNVERIFIED` — the only legitimate
use is a pre-cutover deploy whose database does not exist yet. Do not make it the habit: without
the gate a green deploy means only that the bundle extracted.

## Step 6 — Cleanup

File Manager → delete `extract-check.txt` (and any debug files the run created). Keep
`tmp/restart.txt` (it's the Passenger signal file). Re-SSO'd out? Everything above survives.

---

## Plesk console pitfalls (all hit in practice — don't rediscover them)

- **"Run Node.js commands" wraps input in `npm exec`.** `exec -c "<shell>"` for shell; for Node:
  `exec -- node -e '<js>'` — and **single quotes in the JS get mangled**. Write quote-free JS
  (`String.fromCharCode(10)` instead of `"\n"` literals is overkill, but no `'` inside).
- **Backslashes in JS regexes get eaten** by the quoting layers. Avoid regexes in console one-liners;
  use `indexOf`/`split`.
- **Console output truncates long listings and sometimes shows `exit code 'undefined'` with the
  output swallowed.** Never rely on console output: have the script **write results to a file**
  (`httpdocs/<name>.txt`) and read it via File Manager.
- **Panel env vars do NOT reach the exec runner.** A `node -e` probe sees no `INFISICAL_*` — that's
  the runner, not a broken app.
- **`pkill` patterns must match `next-server`** — Next.js rewrites its process title
  (`next-server (v15.x)`), so `pkill -f server.js` alone misses the app.
- **DNS record edits are staged** — the zone doesn't change until you click **Update** (banner:
  "changes … not saved yet").
- **Sessions expire in minutes** — re-SSO via clientarea → productdetails → "Manage Domains".
- **File Manager opens at the home dir**, not httpdocs, when entered from some deep links — click
  the `httpdocs` row.
- **Node.js panel shows env var values in cleartext** — never screenshot that page, and **never
  read it by text content** (see the next bullet). Rotation checklist:
  `docs/secret-rotation-checklist.md`.
- **⚠️ Reading the Node.js page by TEXT CONTENT leaks every secret on it.** The panel does not put
  the env list in form inputs — it renders one plain-text leaf per row, `- NAME: value`. So a
  "harmless" inspection like `document.querySelectorAll('*')` filtered on the row text returns the
  whole value, and returning `e.textContent` puts `INFISICAL_CLIENT_SECRET` into your transcript.
  This burned a prefix of a freshly rotated secret on Oct 4, 2026, three days after a rotation
  meant to undo the previous burn.
  - **Safe:** select by attribute and return only names, counts, and booleans —
    `input[name^="INFISICAL_"]`, `button[aria-label="Restart App"]`. For the client ID the runbook
    sanctions, return `value.startsWith('6be89e56')`, never the value itself.
  - **Unsafe:** anything matching on rendered text — `textContent`, `innerText`, a `body` dump,
    `page.text()`, or a selector whose text contains `INFISICAL_`.
  - This applies to screenshots and snapshots too: both capture whatever is rendered. Navigate by
    **locator** (`button:has-text("Restart App")`), which resolves and clicks without serialising
    the page into the conversation.
  - Corollary: on a panel you must inspect, prefer the **public API** for anything secret-adjacent.
    Verifying a rotation needs no panel read at all — compare the identity's client-secret
    **use-count** before and after a restart (see `docs/infisical-secret-rotation-oct3.md`).
- **The scheduled-task "OK" button does not always submit** (the panel's JS binds
  `plesk.form.submit`, which is missing on some Obsidian builds). Symptom: you edit the command,
  click OK, land back on the list, and the stored command is *unchanged*. Workaround: set the
  value, then submit the form directly — append a hidden `send=1` input and call `form.submit()`
  (the form already carries `forgery_protection_token`). Always re-read the task row afterwards
  to confirm the command actually changed.
- **Deleting a scheduled task: the control is `#buttonRemoveTask`, an `<a>`, not a `<button>`**,
  and it opens a `#modalDialogBox` confirmation whose button is `button[data-action="yes"]`.
  Selecting rows needs the checkboxes checked *and* the `<tr>` to carry class `selected`.
- **The chroot has no `date`.** A `cmd1 && date && cmd2` chain silently skips everything after
  `date`; use `;` separators between probe steps instead of `&&`.

## Rollback

The extract step wipes `.next` before unpacking, so keep the previous bundle reachable:

1. Before force-pushing a new bundle, preserve the current one:
   `git branch -f deploy-rollback && git push origin deploy-rollback --force` (from the *old*
   bundle's commit) — or keep a tag per release.
2. To roll back: Step 2's task with the raw URL pointing at `deploy-rollback`, then Restart App.
3. `/api/v1/version` needs no correction: `buildId` comes off disk, so re-running the
   extract makes it report the restored bundle's own BUILD_ID automatically. If you want
   `gitSha` to agree as well, set Infisical `GIT_SHA` back to the rolled-back sha.

## Migrations

`prisma migrate deploy` cannot run through the pgbouncer pooler URL, so in the Postgres days
migrations ran **locally** against the direct `:5432` URL (session mode) — never from the scheduled
task. Deploy the schema change first, then ship code that uses it.

⚠️ **The live database has been MariaDB on this host since 2026-11-15**, and both URLs exist there
as Plesk **Secrets** (write-only). The two paths that work now: the deploy script's `DO_MIGRATE=1`,
which runs `npx prisma migrate deploy` on the server with `DATABASE_DIRECT_URL`; or by hand in the
Run Node.js console, `npm explore next -- node --env-file=…/gate.env
…/node_modules/prisma/build/index.js migrate deploy --schema=…/prisma/schema.prisma` (that env
file needs **both** URLs — `schema.prisma` declares `directUrl`). From a workstation, through the
tunnel `ssh -N -L 3307:localhost:3306 nongka@thsv93.hostatom.com` with both variables pointed at
`127.0.0.1:3307`. Still never from the scheduled task.

## Quick reference — full flow per deploy

**The short version (one command, one click):**

```bash
bash scripts/make-gate-env.sh                 # hidden prompt → tmp/nk6/gate.env
bash scripts/deploy-manual.sh                 # publish → wait → certify
# → Run Now in Plesk when it asks; it continues by itself
# exit 0 = certified · 1 = never landed · 2 = cannot certify · 3 = live but NOT certified
```

**What that command does, step by step:**

1. Step 0: build + bundle + note `BUILD_ID` (and update Infisical `GIT_SHA`/`GIT_REF`).
2. Step 1: force-push bundle to `deploy-artifact`.
3. Step 2: Scheduled Task one-liner → **Run Now** (don't save) — the only manual click.
4. Step 3: `extract-check.txt` == `BUILD_ID` (add deps task only if deps changed).
5. Step 4: restart if needed (Restart App → console kill fallback).
6. Step 5: version / health / products / turbopack-grep all green.
7. **Step 5b: the post-switch gate runs automatically** — 22 checks against the live site and the
   target database; failure is exit 3 and the ❌ banner, never a silent pass.
8. Step 6: delete `extract-check.txt`.

---

## Certification in CI — the release also has to go green on GitHub

Step 5b certifies from the machine running the deploy. `.github/workflows/postswitch-gate.yml`
certifies the same release a second time, from GitHub, so a deploy that is live-but-broken leaves a
red run on the repo instead of only a terminal somebody closed.

**Trigger:** a push to `deploy-artifact` — the orphan branch `deploy-artifact.sh` force-pushes the
bundle to. Its commit subject is `deploy bundle <BUILD_ID> (git <sha>)`, which is the only record CI
has of *what* was shipped. `scripts/ci-postswitch-gate.sh` reads that subject, waits for the live
site to serve that exact `BUILD_ID` (`scripts/wait-for-build.mjs`), and only then runs
`scripts/postswitch-check.mjs` — so the window where Plesk has pulled but not restarted is never
certified by mistake. A `--max-uptime` derived from the artifact commit's age makes a stale process
fail the run.

**What it needs, once:**

| Name | Kind | Value |
| --- | --- | --- |
| `POSTSWITCH_TARGET_DATABASE_URL` | secret | `mysql://<user>:<pass>@localhost:3306/nongka_nongkati_nongkatistore` — the URL *as the server* sees it |
| `PLESK_SSH_KEY` | secret | private key whose public half is in the account's `~/.ssh/authorized_keys` |
| `PLESK_SSH_HOST` | secret | `thsv93.hostatom.com` |
| `PLESK_SSH_USER` | variable (optional) | defaults to `nongka` |

The tunnel is not optional: Phase 5 creates the database user with **local connections only**, so a
runner cannot reach MariaDB directly. CI opens `ssh -N -L 3306:127.0.0.1:3306` and rewrites only the
host of the URL.

**Until those secrets exist the job fails**, naming the missing one — it does not skip itself. That
is deliberate: a release nobody certified must not look green. To check the live build alone without
a database, dispatch the workflow with `check-only: true`; by hand it is
`bash scripts/ci-postswitch-gate.sh --check-only --build-id=<BUILD_ID>`.

### The same tunnel, by hand, for the stock reconciler

`scripts/stock-reconcile.mjs` needs the same forward, because the shop's MariaDB user is
`@localhost` and refuses a workstation even though 3306 answers. It reads the same three
variables as the gate, so nothing new has to be configured:

```bash
PLESK_SSH_HOST=thsv93.hostatom.com \
PLESK_SSH_KEY="$HOME/.ssh/plesk_ci" \
PLESK_SSH_USER=nongka \
DATABASE_URL='mysql://nongka:<pass>@localhost:3306/nongka_nongkati_nongkatistore' \
node scripts/stock-reconcile.mjs
```

The URL is also a flag, exactly as in the sibling `scripts/db-report.mjs`:

```bash
PLESK_SSH_HOST=thsv93.hostatom.com \
node scripts/stock-reconcile.mjs --url='mysql://nongka:<pass>@localhost:3306/nongka_nongkati_nongkatistore'
```

so a one-off read needs no env prefix — `DATABASE_URL` still works and is what the host's
`--env-file` invocation uses. The value must ride on the `=`: a bare `--url <value>` is refused as
`✖ unknown flag --url.`, and any other unknown flag dies the same way rather than silently falling
back to whatever `DATABASE_URL` happens to hold. (Added 2026-11-17 after a live run had to wrap the
script in an env-var prefix to work around the missing flag.)

| Variable | Default | Notes |
| --- | --- | --- |
| `PLESK_SSH_HOST` | — | set it to `thsv93.hostatom.com`; with no host the script dials `DATABASE_URL` directly |
| `PLESK_SSH_KEY` | `~/.ssh/plesk_ci` **when a host is set** | the gate workflow's own filename, so a workstation holding that file needs no extra wiring; never used just because a stray file exists |
| `PLESK_SSH_USER` | `nongka` | |
| `PLESK_SSH_BIN` | `ssh` | only for a host whose client is not on `PATH` |

What it does: spawns `ssh -i <key> -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o
ExitOnForwardFailure=yes -N -L 127.0.0.1:<free port>:<db host>:<db port>`, waits until that port
actually accepts (15 s cap), then dials it. The port is chosen by the OS, so a hand-run and a gate
run cannot collide on 3306, and only the host and port of the URL are rewritten — user, password,
database and query string survive, and the URL itself is never printed (the one line it emits is
`tunnel : 127.0.0.1:<port> → nongka@thsv93.hostatom.com 127.0.0.1:3306`). The ssh child is killed on
normal exit, on `SIGINT`/`SIGTERM` and on every error path.

Exit codes match the gate's contract: `0` consistent, `1` real drift, `2` cannot run (no
`--url`/`DATABASE_URL`, tunnel refused, database unreachable). A refused key prints the Plesk SSH-Access
fix, not a bare `Permission denied`.

One sharp edge until it is fixed: a host set with **no readable key** currently falls back to a
direct connection, so the failure you see is Prisma's "Can't reach database server" rather than the
missing key. If that happens, check `PLESK_SSH_KEY` / `~/.ssh/plesk_ci` before the database.
