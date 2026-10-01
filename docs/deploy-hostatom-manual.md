# Deploy to Hostatom thsv93 — the working path (as shipped Sep 30, 2026)

This replaces the earlier no-SSH plan (File-Manager upload + `install-hostatom.sh`). That path is
kept as a fallback in [scripts/install-hostatom.sh](../scripts/install-hostatom.sh), but the flow
below is what actually shipped the live build.

> **Preconditions (all done, don't redo):** DNS points at thsv93 (`docs/dns-migration.md`),
> Let's Encrypt cert installed, Node.js panel configured (Node 20.20.2, startup file
> `server.js`, app mode production, app root `/httpdocs`), `node_modules` installed on the server
> (Linux-native Prisma/SWC), Plesk env = 5 × `INFISICAL_*` + `VERCEL_GIT_COMMIT_REF=master`,
> Infisical Production holds the real secrets. `server.js` is fail-closed: no Infisical, no boot.

**Servers:** app = `thsv93.hostatom.com` (**147.50.254.11**), Plesk at
`https://thsv93.hostatom.com:8443` (SSO: clientarea → product 74879 → **Manage Domains**).
Sessions expire in minutes — re-SSO right before each Plesk step.

---

## Step 0 — Build + stage the bundle (local, Git Bash)

> **Automated:** `bash scripts/deploy-artifact.sh` does Step 0 **and** Step 1 in one go, prints
> the BUILD_ID fingerprint, the Step-2 one-liner with the raw URL already filled in, and the
> verification curls. Variants: `SKIP_BUILD=1` (reuse a fresh build), `DRY_RUN=1`
> (build + stage only, no push). The commands below are the same flow spelled out manually —
> use them as fallback or to understand what the script does.

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

Raw URL (used in Step 2):
`https://raw.githubusercontent.com/NatOhm/nong-kati-site/deploy-artifact/deploy-bundle.tar.gz`

Commit the bundle file itself on that branch (this flow is build-artifact-as-branch; the branch
holds only the tarball, force-pushed each deploy).

> **Also update Infisical now** (before the restart in Step 4): Infisical → nong-kati →
> Production → set `GIT_SHA` = the commit you built, `GIT_REF` = branch name. The
> `/api/v1/version` endpoint reads these; a stale value makes verification lie to you.

## Step 2 — Scheduled Task (Run Now, don't save)

Plesk scheduled tasks run **chrooted**: relative paths only (`httpdocs/…`), no `pkill`/`sleep`,
no CA certs (`curl` needs `-k`), absolute `/var/www/...` paths fail.

1. Plesk → **Websites & Domains** → **Scheduled Tasks** → **Add Task** → type **Run a command**.
2. Command (one line, chroot-safe):

```
cd httpdocs && curl -fsSLk -o deploy-bundle.tar.gz https://raw.githubusercontent.com/NatOhm/nong-kati-site/deploy-artifact/deploy-bundle.tar.gz && rm -rf .next && tar -xzf deploy-bundle.tar.gz && rm -f deploy-bundle.tar.gz && touch tmp/restart.txt && echo BUILD_ID_ON_DISK: > extract-check.txt && cat .next/BUILD_ID >> extract-check.txt
```

3. Click **Run Now** (≈6 s). **Do not click OK/Save** — leave the task unsaved so it doesn't fire
   on a schedule later. (If your Plesk build insists on saving, delete the task after the run.)

What it does: fresh-download bundle → wipe old `.next` → extract → drop tarball → touch
`tmp/restart.txt` (Passenger restart signal) → write the on-disk BUILD_ID into
`httpdocs/extract-check.txt` for verification.

## Step 3 — Verify the extract

File Manager → `httpdocs/extract-check.txt` → content must equal the Step-0 BUILD_ID exactly
(current live build as of Oct 1, 2026: `s3L0ijro_1BuotgUhnbfv`, git SHA `13bdf58…` — see the deploy
log in [hostatom-live.md](hostatom-live.md) §5; always trust the BUILD_ID the script just printed
over this line).

**Only if dependencies changed** also run a deps task (this is the slow one, 5–15 min):

```
cd httpdocs && /opt/plesk/node/20/bin/npm ci --omit=dev && /opt/plesk/node/20/bin/npx prisma generate && echo DEPS_OK > extract-check.txt
```

(`node_modules` persists between deploys — skip this on most deploys.)

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
#    → {"gitSha":"<new sha>","gitRef":"master"}     (sha = what you set in Infisical in Step 1)
curl -s https://nongkatistore.com/api/v1/health
#    → {"status":"healthy", ... "database":"ok"}
curl -s -o /dev/null -w "%{http_code}\n" https://nongkatistore.com/api/v1/products   # 200
curl -s https://nongkatistore.com/ | grep -c turbopack    # 0 = new build (old build ~1+)
```

The `turbopack` grep is the fastest build fingerprint: the broken old build (`vXkxrhTAsXOw2NRxcrQ_1`)
loads `turbopack-*.js`; the Turbopack-less production build never does.

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
- **Node.js panel shows env var values in cleartext** — never screenshot that page (this is how a
  secret got burned; rotation checklist: `docs/secret-rotation-checklist.md`).

## Rollback

The extract step wipes `.next` before unpacking, so keep the previous bundle reachable:

1. Before force-pushing a new bundle, preserve the current one:
   `git branch -f deploy-rollback && git push origin deploy-rollback --force` (from the *old*
   bundle's commit) — or keep a tag per release.
2. To roll back: Step 2's task with the raw URL pointing at `deploy-rollback`, then Restart App.
3. Infisical `GIT_SHA` must be set back to the rolled-back sha so `/api/v1/version` tells the truth.

## Migrations

`prisma migrate deploy` cannot run through the pgbouncer pooler URL. Since
`DATABASE_DIRECT_URL` was removed from Infisical, run migrations **locally** against the direct
:5432 URL (session mode) — never from the scheduled task. Deploy the schema change first, then
ship code that uses it.

## Quick reference — full flow per deploy

1. Step 0: build + bundle + note `BUILD_ID` (and update Infisical `GIT_SHA`/`GIT_REF`).
2. Step 1: force-push bundle to `deploy-artifact`.
3. Step 2: Scheduled Task one-liner → **Run Now** (don't save).
4. Step 3: `extract-check.txt` == `BUILD_ID` (add deps task only if deps changed).
5. Step 4: restart if needed (Restart App → console kill fallback).
6. Step 5: version / health / products / turbopack-grep all green.
7. Step 6: delete `extract-check.txt`.
