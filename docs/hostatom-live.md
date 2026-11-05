# Hostatom Cutover — Handoff (Sep 30, 2026)

Status: **LIVE on the new server.** Work is committed locally on `master` (5 commits incl. the
Oct 1, 2026 client-feedback deploy `13bdf58`; not pushed to a public remote — the `deploy-artifact`
branch carries only build bundles). This doc records what was done, the current topology, and the
ordered to-do list. **No secret values appear in this file.**

---

## 1. What happened (the short story)

The site appeared "stuck on the old build" for hours. Root cause was **not** a stale process:

- Public DNS resolved `nongkatistore.com` → **14.207.142.11**, a *different* Hostatom node
  (`thsv51.hostatom.com`, a.k.a. `th101.hostatom.com`). That box still ran the **old** Next.js build
  (BUILD_ID `vXkxrhTAsXOw2NRxcrQ_1`, turbopack chunk, every `/api/v1/*` 404).
- The **new** server `thsv93.hostatom.com` (**147.50.254.11**) was actually fine: after a kill sweep +
  Passenger respawn it booted the new build (`GwVbcafjEaeLp2mM2mb4d`) with Infisical secrets and a
  healthy DB — but DNS never pointed at it.
- Discovery: hitting `147.50.254.11` directly with `Host: nongkatistore.com` returned the new app
  (HTTP 200, correct gitSha) while the world saw the old one.

## 2. What was done (this session)

| # | Action | Where |
|---|--------|-------|
| 1 | Proved cache theory wrong (fresh `Date`, no `Age`, Passenger header) → live process | local curl |
| 2 | Kill sweep (`pkill -9 -u nongka` matching `next-server`, `server.js`, bare `node`) → new build booted, Infisical secrets loaded | thsv93 |
| 3 | Deleted Plesk placeholder `index.html` (July 27) that shadowed the app's `/` (homepage served "Domain Default page") | thsv93 httpdocs |
| 4 | Added panel env override `VERCEL_GIT_COMMIT_REF=master` + Restart App → `/api/v1/version` now returns `gitRef: master` | thsv93 Node.js panel |
| 5 | Deleted all debug files from httpdocs: `task-debug.txt`, `task-debug2.txt`, `deploy-extract-log.txt`, `extract-check.txt`, `restart-kill.log`, `env-names.txt`, `infisical-keys.txt` | thsv93 httpdocs |
| 6 | **DNS cutover**: apex A `14.207.142.11 → 147.50.254.11` in the **authoritative** zone (lives on thsv51's Plesk, domain id **1194**); had to click **Update** (changes are staged until then); zone serial `2026072701 → 2026093001`; propagated (TTL 300) | thsv51 Plesk |
| 7 | **TLS**: issued free Let's Encrypt cert on thsv93 (apex + www, HTTP-01, auto-renew, HSTS on) — thsv93 previously served a wrong-principal cert | thsv93 SSL It! |

### Final verification (public hostname, no tricks)

| Check | Result |
|---|---|
| `GET /api/v1/version` | `{"gitSha":"3e236c2f…","gitRef":"master"}` |
| `GET /api/v1/health` | `healthy`, `database: ok` |
| `GET /api/v1/products` | HTTP 200 |
| Homepage | new build (0 turbopack chunks), canonical `https://nongkatistore.com` |
| HTTP→HTTPS | 301 |
| Cert | valid LE chain for apex + www (schannel/Chrome-style verification passes) |

---

## 3. Current topology (access map — names only, no secrets)

```
                    Registrar: PublicDomainRegistry (via Hostatom WHMCS, domain id 86320)
                        │  registry NS: ns1/ns2.nongkatistore.com (glue → 147.50.254.11)
                        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ AUTHORITATIVE DNS ZONE: thsv93 Plesk (domain id 1036)        │
   │ ← MOVED OFF THE OLD BOX (see docs/dns-migration.md)          │
   │ ns1.nongkatistore.com → 147.50.254.11 (glue, new box)        │
   │ ns2.nongkatistore.com → 147.50.254.11 (same box — SPOF!)     │
   │ apex A = 147.50.254.11 · www CNAME → apex                    │
   │ mail/webmail/ipv4 A = 14.207.142.11, MX → mail               │
   │ SPF a:thsv51 · DKIM = old mail key · DMARC quarantine        │
   │ (mail records mirror the old zone so email is unaffected)    │
   └──────────────────────────────────────────────────────────────┘
                        │  apex/www
                        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ NEW APP SERVER: thsv93.hostatom.com (147.50.254.11)          │
   │ WHMCS product id 74879 · Plesk domain id 1036                │
   │ Passenger + nginx · Node 20.20.2 · app root /httpdocs        │
   │ startup server.js (fail-closed Infisical boot-loader)        │
   │ Panel env: 5 × INFISICAL_* + VERCEL_GIT_COMMIT_REF=master    │
   │ Expected INFISICAL_CLIENT_ID prefix: 6be89e56 (see §5 note)  │
   │ All other secrets ← Infisical project 80151198-f2df-…, prod  │
   │ Build s3L0ijro_1BuotgUhnbfv (git SHA 13bdf58…, Oct 1 2026)    │
   │ LE cert: apex + www, auto-renew, HSTS on                     │
   └──────────────────────────────────────────────────────────────┘
                        │  mail/webmail/ns glue
                        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ OLD SERVER: thsv51.hostatom.com (14.207.142.11 = th101)      │
   │ WHMCS product id 74841 (nongkati.com hosting)                │
   │ Old Next build STILL RUNNING + old secrets in its env        │
   │ Now serves only: mail/webmail for nongkatistore.com          │
   │ (no longer authoritative DNS — zone moved to thsv93)         │
   └──────────────────────────────────────────────────────────────┘
```

- Deploy artifact: GitHub `NatOhm/nong-kati-site` branch `deploy-artifact` → `deploy-bundle.tar.gz`.
- Infisical (prod) secrets by name: `DATABASE_URL`, `DATABASE_DIRECT_URL` (re-added), `GIT_REF`,
  `GIT_SHA`, `NEXT_PUBLIC_SITE_URL`, `NK_GIFT_CODE_ENCRYPTION_KEY` (now the version-2 material),
  `NK_GIFT_CODE_ENCRYPTION_KEY_V2` (redundant copy kept as rollback hatch),
  `NK_GIFT_CODE_ENCRYPTION_KEY_V1` (unused duplicate — delete anytime), `NK_JWT_SECRET`,
  `NK_PAYMENT_MOCK`, `NK_SLIP2GO_SECRET` (added Oct 1, 2026 — Slip2Go slip auto-verify;
  `NK_SLIP_OK_*` exist only as local `.env.local` placeholders, not in Infisical),
  `VERCEL_GIT_COMMIT_REF`.
- Useful one-liners:
  ```bash
  curl -s https://nongkatistore.com/api/v1/version
  curl -s https://nongkatistore.com/api/v1/health
  nslookup -type=SOA nongkatistore.com 14.207.142.11     # zone serial on old NS
  curl -s --resolve nongkatistore.com:443:147.50.254.11 https://nongkatistore.com/api/v1/version
  ```

---

## 4. Next steps (ordered)

### A. Rotate exposed secrets — **do first** — checklist: [secret-rotation-checklist.md](secret-rotation-checklist.md)
Several secret values were displayed in clear text during this session (Plesk panel page, Infisical
reveal-all, chat transcript). Treat them as burned. Safe order (site never goes down):

1. **Infisical machine identity** (`INFISICAL_CLIENT_SECRET`, shown in the Node.js panel):
   create a *new* identity/secret in Infisical → paste into Plesk **Custom environment variables** →
   **Restart App** → verify `/api/v1/health` → then disable the old identity.
   ✅ **RESOLVED Oct 2, 2026 — it was a secret rotation, not an identity swap.** Infisical holds
   exactly ONE machine identity, `hostatom-prod` (created Sep 29), and Plesk's `6be89e56-…` client
   ID is *its* client ID — the "old vs new identity" framing was wrong in both the original note
   and the later correction. The real exposure was the repeatedly-displayed client SECRET: rotated
   Oct 2 by adding a second Universal-Auth client secret to `hostatom-prod`, pasting it into the
   Plesk panel env, and Restart App — the fail-closed boot verified green on the new secret (three
   curls + slip-verify + homepage). The burned `2018***` secret is now unused; remove it in
   Infisical after the 24–48 h soak. Details and live status:
   [infisical-identity-swap-plesk.md](infisical-identity-swap-plesk.md).
2. **Database password** (Supabase): rotate in Supabase → update `DATABASE_URL` in Infisical →
   Restart App → health check. ⚠️ `DATABASE_DIRECT_URL` was deleted from Infisical; the app runs fine
   on the pooler URL, but if you ever need schema push/migrations from the server, re-add a direct
   (:5432) URL as the *Prisma* direct URL (panel or Infisical, your choice).
3. **`NK_JWT_SECRET`**: rotate → all user sessions/tokens invalidate (acceptable; announce if needed).
4. **Gift-code key**: ✅ **DONE Oct 1, 2026** — dual-key support shipped (`src/lib/crypto/giftCode.ts`),
   `scripts/re-encrypt-gift-codes.mjs --apply` re-encrypted all 48 rows to `keyVersion 2` in one
   transaction, base key swapped in Infisical, post-verify green (census 2|48, delivered code
   decrypts with the new key). Old key stays in the password manager for the restore-both-vars
   rollback trick documented in the checklist.
5. **Panel passwords**: Hostatom clientarea, both Plesk logins.
6. Hostatom's `git` deployment on the old box may hold a repo token — revoke when decommissioning.

### B. Old server (thsv51) — decommission hygiene, but gently
- The old Next.js app still runs there with **old secrets in its Node.js env vars** and the
  **git deployment** (last commit `69a4da4`). Disable its Node app (or ask Hostatom to remove it)
  once you're stable on the new box.
- ⚠️ **Do not cancel the nongkati.com hosting product (74841)** yet: it currently provides the
  authoritative DNS zone, `ns1`, and mail/webmail for nongkatistore.com. Losing it = losing DNS + email.

### C. Move DNS off the old box — ✅ DONE (see [docs/dns-migration.md](dns-migration.md))
Registry NS now `ns1/ns2.nongkatistore.com` → thsv93 Plesk DNS; mail records mirrored so email is
unaffected. Remaining follow-ups from that doc: a true secondary NS (ns1/ns2 currently the same
machine) or Cloudflare; then old-box decommission below.

### D. Operational hardening
- **Monitoring**: uptime check on `/api/v1/health` (5-min interval is enough).
- **Backups**: enable Plesk scheduled backup for httpdocs + DB; the `backups/` JSON dumps (customer
  PII) are still only on your machine — copy them off-machine encrypted, then remove local copies.
- **SSH on thsv93** is disabled (shell `/bin/false`). Either enable SSH access in Plesk (makes
  `deploy-hostatom.sh` usable) or standardize on the scheduled-task flow below.
- **Future deploys** (current working path, no SSH needed):
  1. Build locally with `NEXT_PUBLIC_SITE_URL=https://nongkatistore.com`, tar the build
     (`next build` output + `server.js` + `prisma` + `package*.json`), push to the
     `deploy-artifact` branch.
  2. Plesk → Scheduled Task → Run Now with the chroot-safe one-liner (relative paths, `curl -k`):
     `cd httpdocs && curl -fsSLk -o bundle.tar.gz <raw-url> && rm -rf .next && tar -xzf bundle.tar.gz && rm -f bundle.tar.gz && touch tmp/restart.txt`
  3. Verify `BUILD_ID` + `/api/v1/version` after first request.

  > `bash scripts/deploy-artifact.sh` automates 1–2 and prints the Run-Now one-liner plus the
  > verification curls — used for the Oct 1, 2026 deploy (`13bdf58`).
- **Plesk console pitfalls** (learned the hard way):
  - "Run Node.js commands" wraps input in `npm exec`; single quotes get mangled — avoid `'` in JS,
    avoid regexes (backslashes get eaten), write results to a file and read via File Manager.
  - Console output truncates long listings; panel env vars do **not** reach the exec runner.
  - `pkill` patterns must include the `next-server (v15.x)` process title, not just `server.js`.
  - DNS record edits are **staged** — must click **Update** to apply.
  - Sessions expire in minutes; re-SSO via clientarea → productdetails → "Manage Domains"/"File Manager".

### E. Nice-to-haves
- Long-poll/CDN layer later (the app is dynamic; consider Cloudflare in front once DNS is moved).
- Update `docs/deploy-hostatom-manual.md` to match the working scheduled-task flow (it predates it).
- ✅ Work committed locally on `master` (5 commits incl. `13bdf58`); not pushed to a public remote.
- ✅ `docs/deploy-hostatom-manual.md` now documents the automated `scripts/deploy-artifact.sh` flow.

---

## 5. Deploy & ops log

> **⚠️ `VERCEL_GIT_COMMIT_REF=master` is required, not a fossil.** It is read by
> `src/app/api/v1/version/route.ts` and `src/app/api/v1/internal/build-info/route.ts`. If it is
> removed from the panel env, `/api/v1/version` returns `gitRef: unknown` and deploy verification
> silently stops telling the truth. The variable name is a leftover from the Vercel era; the value
> is load-bearing. A handoff on Oct 3 wrongly recommended deleting it.

> **Expected `INFISICAL_CLIENT_ID` prefix (single source of truth):** `6be89e56` — as of Oct 1,
> 2026. Every deploy's Step-4 identity check (see deploy-hostatom-manual.md) compares the Plesk
> panel against this line. NOTE: this prefix is the client ID of the one-and-only identity
> `hostatom-prod` and did **not** change in the Oct 2 secret rotation (only the paired secret
> changed). It would only change if a *new identity* were ever created.

| Date | Commit (ref) | BUILD_ID | Notes |
|---|---|---|---|
| Oct 1, 2026 | `13bdf58` on `master` | `s3L0ijro_1BuotgUhnbfv` | Client-feedback fixes: `createOrder` rejects zero-stock variants (HTTP 409 `OUT_OF_STOCK`, probed live), CSP `img-src` gained `blob:` so slip previews render on every bill, Slip2Go auto-verify live (`NK_SLIP2GO_SECRET`; SlipOK kept as fallback; `GET /api/v1/payments/slip-verify` → `{"enabled":true}`); +13 regression tests (`tests/client-feedback-fixes.test.ts`, full suite 276 ✓). Flow: `scripts/deploy-artifact.sh` → Plesk Run-Now (5 s, task not saved) → Restart App. Infisical: `GIT_SHA` → `13bdf58…`, `NK_SLIP2GO_SECRET` added; all seven live checks green. Open: client must whitelist `147.50.254.11` in the Slip2Go dashboard (until then a verify call 401s with `401007` → the adapter falls back to the manual admin path) and should store the key in a password manager; delete `httpdocs/extract-check.txt` via File Manager. |
| Oct 1, 2026 | — (DB cleanup) | — | Client-approved purge of stale test data via `scripts/purge-test-orders.mjs` (dry-run default, one transaction, status guard): orders **NK-2026-000069** (฿25 QA) + **NK-2026-000071** (฿1.00, incl. its private `slip:` SiteSetting image) and the **test-5hxv** product (8 variants, 5 leftover gift codes) hard-deleted; customer accounts kept. Post-verify: both orders 404, catalog healthy, dashboard totals unchanged. NOTE: `.env.local` held the PRE-rotation DB password (same shape, different value — silent auth failures looked like "stale file"). Fixed Oct 1: `.env.local` + the `.env` Prisma-CLI helper re-synced from Infisical; the purge script's env-loader regex also fixed (quoted-only values made bare `.env.local` lines lose to `.env`). |
| Oct 1, 2026 | — (E2E test) | — | **Slip flow E2E on production — PASS.** Created a real ฿25 guest probe order (unpaid), uploaded a generated 8×8 PNG through the real `POST /api/v1/payments/slip-upload` with the checkout capability token (200 `slip_received`, private `slip:` key minted), fetched it back through the authorized `slip-download` route (200, `image/png`, `private, no-store`), and rendered it as a blob `<img>` — the exact mechanism of the admin `SlipImageView` — under the live CSP header: decoded 8×8, **zero `img-src` violations** (the client-reported broken-image bug is confirmed fixed end-to-end). Probe order + its slip + 1 orphaned slip row (left by the morning purge — `slipImageUrl` stores the route path, not the `slip:` key) then purged; script upgraded with `--order`/`--slug`/`--sweep-orphan-slips` and correct route→key mapping. Two notes for the client: deleted order numbers **can be reused** by the allocator (probe reused NK-2026-000069), and hard-deleting an order in SQL must also clean its `slip:` SiteSetting row. |
| Oct 3, 2026 | — (secret re-exposure) | `s3L0ijro_1BuotgUhnbfv` | **⚠️ The Oct 2 client secret was re-exposed.** Reading the Plesk Node.js panel again displayed the NEW secret in clear text into session logs, burning the rotation that had only just landed. Both burns came from the same action: reading the panel. Next step is a third rotation via [infisical-secret-rotation-oct3.md](infisical-secret-rotation-oct3.md) — and from now on **presence checks only, never read that field.** Also delete the burned `2018***` secret, whose soak is long over. No code or deploy changed this day. |
| Oct 3, 2026 | `2ee2ae7` on `master` | `AooEcNd_FJ7wU4oVn3KeE` | **Navbar layout fix — deployed to production.** Fix: header nav links were crushed to one Thai glyph per line between ~768–1150px because the centre `nav` was a plain flex child with no `shrink-0`, so it absorbed the whole width deficit and Thai broke *between glyphs*. Added `shrink-0` to nav + links, `whitespace-nowrap`, `min-w-0`/`flex-1` on the search field, moved the nav breakpoint `md:` → `xl:` (1280px), and added the two missing drawer links (แนะนำ, รายการโปรด). 4 new gates in `tests/navbar-layout-gates.test.ts`; full suite 349 ✓. Live after deploy: nav links 41px single-line at 1280px, nav `display:none` below `xl`, search 224×21px at 768/900px, no horizontal overflow at any width; health `database: ok`, products 200, homepage 0 turbopack. **Deploy was blocked for ~2 days by a Plesk quoting bug, not by the network** — see deploy-hostatom-manual.md pitfalls. Infisical `GIT_SHA` was stale at `13bdf58` and has since been corrected to `2ee2ae7…` (a human-edited Infisical value, not a code change); `/api/v1/version` now reports the live commit. |
| Oct 4, 2026 | — (secret rotation) | `AooEcNd_FJ7wU4oVn3KeE` | **Third Infisical client-secret rotation — DONE and verified.** New client secret added to the existing `hostatom-prod` identity (client ID `6be89e56-…` unchanged); the human copied and pasted it into Plesk (agent deliberately never read the value), Restart App, and the boot was proven by **use-count**: new secret 0 → 1 while `58dc***` stayed at 266. Post-restart: version `2ee2ae7…`/`master`, health `database: ok`, products 200. Also corrected Infisical `GIT_SHA` from the stale `13bdf58` to `2ee2ae7…` (a human-edited value; the agent hit a trailing-newline bug when editing it and caught it before commit). UI path corrected: Machine Identities is at sidebar → **Administration → Access Control**, not "Settings → Access Control" (404) and not **Manage Access** (Pro upsell). ⚠️ **Partially re-exposed:** a 14-char *prefix* of the new secret was surfaced into the session transcript by an agent DOM query on the Plesk Node.js page — the exact burn pattern. Material difference from the Oct 2/3 burns: those captured the *whole* secret; a prefix of a 64-char secret cannot authenticate. Still logged as exposure. **Do not delete `58dc***` until the 24–48 h soak plus one deploy completes** (it is the only rollback). `2018***` was **deleted Oct 4, 2026** after that check: 243 uses, unused for weeks, and `553c***` had already climbed 0 → 4 uses across four boots (idle reaps re-authenticate), proving it was the live credential. Post-delete: version `2ee2ae7…`, health `database: ok`, products 200, homepage 200. Two secrets remain: the live `553c***` and the rollback `58dc***`. |
| Oct 4, 2026 | `4c84ef9` on `master` | `GDePvCSOq-CqxhH6HFX8j` | **Version-endpoint fix + `/search` dropdown fix — deployed to production.** Also carries the TOTP generator fix, navbar popover portals, and the credential-file ignore. Post-deploy, `/api/v1/version` returns a `buildId` read from `.next/BUILD_ID` on disk and it reports the real deployed build; `gitSha` still echoes the stale Infisical value (`2ee2ae7`) and is no longer the verification signal. `deploy-rollback` was repointed to the previous bundle (`gUxcV6SEGUgIp6nFJf8hR`) BEFORE the force-push, so rollback stayed available. Pre-publish secret scan: unpacked the bundle and searched every file for the literal values of `NK_JWT_SECRET`, `NK_GIFT_CODE_ENCRYPTION_KEY`, `DATABASE_URL` and `DATABASE_DIRECT_URL` (plus the postgres user and password substrings) — none present, no `.env*` staged. The 14 grep hits were variable NAMES (`process.env["NK_GIFT_CODE_ENCRYPTION_KEY"]`), not values. Live verification: health `healthy`/`database: ok` with uptime 13s (confirming a real restart, not a stale process), `/`, `/search`, `/management/login`, `/account/login`, `/api/v1/products` all 200, 0 turbopack leaks. Browser-checked on the deployed build at 740x420: the search list is portaled, `position: fixed`, **691px — exactly the search bar's width and left edge**, fully inside the viewport with all 6 options hit-testable (it previously hung 177px past the fold, stranding the last two); clicking the previously-unreachable last option navigates. All three navbar popovers re-checked for regression: portaled, fixed, **zero clipping ancestors**, fully visible (notifications 320x322 at top=60). Plesk: extract ran via Run Now with **no task saved**; `extract-check.txt` deleted; no `probe*`/`restart-watch*`/`deploy-bundle` residue in the docroot. |
| Oct 4, 2026 | `cbbe097` on `master` | `gUxcV6SEGUgIp6nFJf8hR` | Navbar popover portals + TOTP base32 fix deployed; credential-dump files removed from the repo and `.gitignore` extended (this repo is **public**, so `git add -A` would have published `NK_JWT_SECRET` and `NK_GIFT_CODE_ENCRYPTION_KEY`). Health `healthy`, 0 turbopack. This deploy's `/api/v1/version` reported `gitSha: 2ee2ae7` — stale by three commits, which is what motivated the `buildId` fix in the row above. |
| Oct 4, 2026 | — (repo hygiene) | — | **GitHub Pages unpublished.** The repo has no `pages.yml` — the red "pages build and deployment" on every push is GitHub's vestigial auto-generated workflow, which was failing on commits long before this work (`64ff0c9`, `6ed9d62`). Pages was set to *Deploy from a branch → master* on a **public** repo, so it was publishing repo content at `natohm.github.io/nong-kati-site/`; both the Pages API and that URL now return 404. The `pages-build-deployment` workflow itself still exists and is `active` — it no longer has a Pages site to publish to, so it cannot redeploy anything. Production is Hostatom/Plesk and was never affected by any of this. |
| Oct 2, 2026 | — (secret rotation) | — | **Infisical client-secret rotation for Plesk — done.** Discovery: only one machine identity exists (`hostatom-prod`, ID `bcf6ab49-…`; its Universal-Auth client ID IS the panel's `6be89e56-…`). Added a second client secret to `hostatom-prod` (desc: "Plesk thsv93 rotation Oct 2026"), pasted it into Plesk Node.js env (client ID unchanged), Restart App, fail-closed boot verified green (version `13bdf58`, health `database: ok`, products 200, slip-verify enabled, homepage 0 turbopack). Burned `2018***` secret now unused — remove from Infisical after a 24–48 h soak; rollback until then = re-paste the old value. New secret must live in the password manager. |
| Nov 2, 2026 | `4e9dcbf` on `master` | `hBw7TZNRpvt7qoI6MiulS` | **1.1.4 — real public origin + honest drawer categories, deployed to production.** Carries 1.1.3 (`a126c25`, `46CiMm7RsXYLfD_rc-bNe`) and the fixes stacked on it: (a) `publicOrigin()` now treats a loopback `NEXT_PUBLIC_SITE_URL` as unset and falls back to `https://nongkatistore.com`, so the origin inlined at build time can no longer ship localhost; (b) the drawer's category fetch no longer caches a 500 as an empty list, shows skeleton rows while in flight and retries on the next open. Live: `/api/v1/version` → 1.1.4 / #373 / `4e9dcbf`, health `database: ok`; homepage and the Thai-slug product `microsoft-365-30-วัน-ytbr` 200; sitemap has **0** `localhost` and emits `https://nongkatistore.com/product/microsoft-365-30-%E0%B8%A7…`; that product's canonical and `og:url` match; `robots.txt` sitemap points at the real domain; drawer verified at 390px — forced 500 shows the "โหลดหมวดหมู่ไม่สำเร็จ" line with 0 dead links, closing and reopening refetches and renders the three real categories, a cached reopen fires 0 requests. Run Now with a pinned `TARBID` guard (5 s), `extract-check.txt` read then deleted; task left unsaved with the canonical 653-char line. |
| Nov 3, 2026 | `b68bbc6` on `master` | `WGagTETnKgIY7F02yeydr` | **1.1.5 — sellable-stock gate + one-tap drawer, deployed to production.** Carries `391c376` (the resolver now counts available `GiftCode` rows, so a variant sells min(stock, codes) and refuses `OUT_OF_STOCK` below the quantity; the product page shows the deliverable number) and `f322dcd` (drawer category rows point at `/search?category=<slug>` instead of `/category/<slug>`, so the client gets their one tap to a price; the grouped tile page and its ดูทั้งหมด entry points are untouched). Live: `/api/v1/version` → 1.1.5 / #377 / `WGagTETnKgIY7F02yeydr` / `b68bbc6`, health `database: ok` with uptime 4.5s (a real restart, not a stale process), products 200, homepage 0 turbopack. Audited on the deployed build: `/search?category=streaming-app` 19 cards all `หมด` (genuine — every streaming variant is 0 stock / 0 codes); `microsoft-365-30-วัน-ytbr` shows `เหลือ 2` and previews ฿50 (qty 1) / ฿100 (qty 2); qty 3 and both 0-code variants answer `OUT_OF_STOCK`; drawer at 390px lists workspace / streaming-app / Chinese Miniseries with `/search?category=` hrefs and the grouped `/category/streaming-app` still 200. Open: production has no stock>0-with-0-codes variant, so that exact gate stays proven by unit tests only — proving it live needs seeded inventory. |
| Nov 3, 2026 | `09ca46a` on `master` | `_QgNY5emZ375QBUAUW883` | **1.1.6 — the /search landing now announces its category filter.** Audited on 1.1.5: `/search?category=streaming-app` filtered the grid correctly but carried **no** `aria-current` on any chip, while the navbar's `สินค้าทั้งหมด` link announced itself as the current page despite pointing at a different view. Fix: the selected chip renders `aria-current="page"` beside its existing peach active state (and `ทั้งหมด` is current only without a filter), and `/search` passes `searchCategory` through `FacebookLayout` into `FacebookNavbar` so the navbar entry stays inert while filtered. Guard `tests/search-category-chip.test.ts` (C1–C5) + a `docs/quality-gates.md` row/section (`SC`). Live proof on the new build: `/search?category=streaming-app` has **exactly one** `aria-current="page"` — the `streaming app (19)` chip — with `work space (3)` / `Chinese Miniseries (7)` inactive and `ทั้งหมด` unmarked; each drawer destination (`workspace` 3, `streaming-app` 19, `chinese-miniseries` 7) returns 200 with its own chip active; unfiltered `/search` marks `ทั้งหมด`. Unchanged behaviours re-checked: product page `เหลือ 2`, the five preview-order cases (`OUT_OF_STOCK` at 0 codes, ฿50/฿100 for 2 stock/2 codes, qty3 rejected), `/category/streaming-app` 200. |
| Nov 3, 2026 | `11f9929` on `master` | `IfozWtRR1lZBnFJj_XUQg` | **1.1.7 — the payment tab can save its bank account again, deployed to production.** The header save kept ONE saver slot while the payment tab renders two panels, so `PaymentSettings` registered second and overwrote `ManualTransferSettings` — an edited receiver account never left the browser while the button reported success. Panels now register through `useSettingsSaver` and the page runs every registered saver; a refused save reports its reason. Also carries one shared `applyPromotionDiscount` (three copies had drifted apart), a `MAX_CART_ITEMS = 50` guard on `/orders/preview` (the 60/min IP rule already covered flood; the caller-controlled array did not), `cache()` on the two category readers, and the search filter chip. Live: `/api/v1/version` → 1.1.7 / #386 / `IfozWtRR1lZBnFJj_XUQg` / `11f9929`, health `database: ok` with uptime 24s (a real restart), products 200, homepage 0 turbopack, CSP/HSTS/X-Frame-Options/Referrer-Policy all present. Audit on the deployed build: 51 preview items → `400 CART_TOO_LARGE`, 1 item → ฿50 and qty 2 → ฿100 (stock and price agree with the product page's `เหลือ 2`); Thai-slug product 200 in both percent-encoded and raw UTF-8 forms; search `?q=365` returns 2 cards with the query echoed in the heading; `/category/workspace` 200; cart totals 9×฿1 + ฿50 = ฿59; every guest call to `/api/v1/admin/*` answers 401 and `POST` on a GET-only admin route answers 405. Run Now with the canonical 653-char line (task id 250, deactivated, not saved); `extract-check.txt` and the tarball removed by a second Run Now that answered `CLEANED`, then the field restored to the deploy one-liner. Open: the settings-tab fix itself needs an admin login to exercise (not done here, the panel is behind auth); production reports `vatEnabled: false`, so VAT stays switched off; the cart drawer's entrance animation could not be watched because the browser tab was backgrounded (Chromium parks animations at `currentTime 0` when `visibilityState` is `hidden`), so only its markup and totals were checked. |
| Nov 4, 2026 | `d71dc88` on `master` | `asv940_oIRI6rFKVRgObZ` | **1.1.8 — `/management` is a door again, deployed to production.** The audit on 1.1.7 found that `/management/` answered `308 → /management` and `/management` answered **404**: `app/management/` had `layout.tsx` and every sub-route but no root page, while the spec calls that URL the admin entry (02-user-flow "Entry: /management/ → redirect to /management/login/", 03-IA "/management/ … Admin Dashboard"). The fix is a redirect-only page to `/management/login`, which already owns the auth decision and hands a live session to the dashboard, so there is still exactly one gate. `tests/admin-nav-sections.test.ts` now lists `/management` with login and dev-seed as a deliberate non-menu page, and `tests/management-entry.test.ts` (M1–M4) holds the redirect, the absence of admin markup, and the login page's authenticated bounce. Live: `/api/v1/version` → 1.1.8 / #388 / `asv940_oIRI6rFKVRgObZ` / `d71dc88`, health `database: ok` with uptime 81 s. `/management` → 200 and lands on `/management/login` in a clean browser (email + password + remember + submit, `x-robots-tag: noindex`); `/management/` still 308s into it; with a live admin session the same navigation ends on `/management/dashboard`, so "entry, or dashboard when authenticated" is proven both ways. Re-audit on the new build: guest `/management/orders` and `/management/settings` still return the empty shell (0 order numbers, 0 emails), guest admin APIs 401 with 405 on a wrong method, manual-info still `enabled: true` / `199-1-73578-6` / `กนกนาถ โรจนวุฒิ`, slip-verify still 403 `INVALID_UPLOAD_TOKEN` for missing / fake / plausible-64-char tokens, `/orders/preview` still rejects `VARIANT_NOT_FOUND`, `INVALID_QUANTITY` (-2, 1.5) and 51 items as `CART_TOO_LARGE`, security headers present with a CSP nonce, homepage 0 turbopack, product/search/checkout 200. Cleanup Run Now answered `CLEANED` with `.next` + `.next.old` in place; no rollback was needed. |
| Nov 5, 2026 | `dd145cc` on `master` | `um9kUzepqJodcpCTAAy6U` | **1.1.9 — the panel can show what shipped, deployed to production.** The owner was asking for release history every time, because the only record lived in this file. New page `/management/patch-notes` (การดูแลระบบ → บันทึกแพตช์, `settings:read`) lists every build that reached production — version, date, `BUILD_ID`, commit, what changed — and its data is **generated**, not copied: `scripts/patch-notes.mjs` (`npm run patch-notes`) parses this deploy-log table into `src/data/patch-notes.json`, so the page can only show what the runbook actually recorded, and rows that shipped no code (DB cleanups, secret rotations) stay out. `tests/patch-notes.test.ts` P1–P5 fails when the log is edited without regenerating — proven by inserting a fake Nov 5 row, watching P1 go red (`expected [1.1.8…] to deeply equal [1.1.9…]`), then restoring the log. Two parser defects surfaced during the build and were fixed before shipping: dates drifted one day back (local UTC+7 midnight → previous day in UTC) and titles lost their capital. Live: `/api/v1/version` → 1.1.9 / #390 / `um9kUzepqJodcpCTAAy6U` / `dd145cc`; the page renders 9 rows newest-first with the newest detail expanded. |
| Nov 5, 2026 | `164677e` on `master` | `ANp_hPzY4PUJ9hbRpy0Iq` | **1.1.10 — the panel now names the build that is actually serving, deployed to production.** 1.1.9's page was honest about its list but not about "latest": its data is baked into the bundle, so the first build showed "ล่าสุด 1.1.8" while 1.1.9 was live (proven in the real panel). The top card now reads the running build through `useRelease()` — the module that already owns the panel's single cached `/api/v1/version` request, enforced by `tests/release-badge.test.ts`; the first attempt used its own `fetch` and that gate went red, so it was rewritten onto the shared hook. When the running build has no log row the card says so instead of presenting an older release as current. Live: `/api/v1/version` → 1.1.10 / #391 / `ANp_hPzY4PUJ9hbRpy0Iq` / `164677e`; the page shows "build ที่ให้บริการอยู่ตอนนี้ v1.1.10" and 10 logged releases newest-first. |
| Nov 5, 2026 | `55b56ba` on `master` | `Of0v841HVtlWHuQNQx9lE` | **1.1.11 — the last code can no longer be sold twice, deployed to production.** The 5 Nov audit found the money path careful right up to its edges: an unpaid order held nothing (stock checked at creation, code taken at confirmation), so two customers could each buy the last unit, both transfer, and the second slip would verify against stock already gone — parked for a manual refund. `createOrderInner` now subtracts what `pending_payment` orders already hold, inside the same Serializable transaction as the insert, and the 30-minute sweep is the release (derived, no new column, no stock write). Live proof: with 2 units and 1 held, a second order for 2 returned `409 OUT_OF_STOCK` and created nothing. Guest `/orders/lookup`, which hands back the UUID that opens a page of delivered codes, now has per-IP (10/15min) and per-email (5/15min, peeked so a stranger cannot spend a victim's quota) buckets — live: 10×404 then `429 RATE_LIMIT_EXCEEDED`. Also deletes 696 lines of mock reservation/delivery code that production never ran. Live: 1.1.11 / #393 / `Of0v841HVtlWHuQNQx9lE` / `55b56ba`, health `database: ok`. |
| Nov 5, 2026 | `0359c45` on `master` | `d18M2Uu2sTMnqp7_i96lj` | **1.1.12 — an expired order can still be paid, and the lookup cap now counts misses, deployed to production.** A customer who transferred at minute 29 and uploaded the slip at minute 31 got `409` from a shop already holding their money: the claim CAS and both slip guards demanded exactly `pending_payment`. All three now accept `expired`, and a unit that was resold meanwhile still parks as `pending_manual_fulfilment` (existing path, no new code). The per-email lookup bucket was peeked and consumed only on a match, so the guessing it exists to stop never spent it — it now counts every attempt at 10/15 min, which also lets ten junk requests lock one address's lookup for 15 minutes (that customer keeps the order link in their email). Also deletes 1,587 lines of never-imported modules — coupon/loyalty/category APIs, three service wrappers, the cart shell, mega menu, progress ring, CSV parser and a duplicate slug helper — plus the one test that kept the parser alive, and the stock-parser row/section it needed in `docs/quality-gates.md`. Live: 1.1.12 / #397 / `d18M2Uu2sTMnqp7_i96lj` / `0359c45`; lookup 10×404 then `429`; the checkout copy in the deployed chunk reads "ประมาณ 30 นาที" (the old "สูงสุด" is gone). |
| Nov 5, 2026 | `c9f08fd` on `master` | `Yyc-JBjGfuh2D6Xjfz8YT` | **1.1.13 — a hold now expires on its own clock, deployed to production.** Auditing 1.1.12 found order `NK-2026-000190` still holding a unit 100 minutes after its 30-minute window: the GitHub schedule meant to tick every 10 minutes had run at 01:51Z and not since, and the previous day had four runs. A hold that waits for that tick is a hold of unknown length, so the hold query now filters `order.createdAt > now − payment window`, reading the same SiteSetting the sweep reads; the sweep still flips the row to `expired`. Live A/B on the 2-unit variant: under 1.1.12 the stale hold blocked a qty-2 order; after this deploy the same request created `NK-2026-000191`, and the next qty-1 request returned `409 OUT_OF_STOCK` from the fresh hold. Live: 1.1.13 / #398 / `Yyc-JBjGfuh2D6Xjfz8YT` / `c9f08fd`, health `database: ok`. The schedule behind the *status* flip was measured the same day over 12 runs: 4–5 a day, 3–5 hours apart, all green — what that does and does not cost is written up in [production-health-monitoring.md](production-health-monitoring.md) §3b. |
| Nov 5, 2026 | `7a67438` on `master` | `Opp1E9sP7OPnK69ZOE-eU` | **1.1.14 — the boot hands the sweep token to Plesk, deployed to production.** Plesk's scheduler runs outside the Node process, so it can never see `NK_CRON_SECRET`, and its task field renders secrets as plain text on a public repo — which is why the sweeps were still riding GitHub's 4–5 runs a day. `server.js` now mirrors the secret to `tmp/cron-curl.conf` (0600) at boot, from the same env it already injects, so nobody has to copy a secret between panels. Verified live: the file is `-rw------- nongka psacln`, and everything under `/tmp/` answers 403 over HTTPS (Plesk blocks the path whether or not a file exists there, so that 403 is not evidence of the file — the listing is). Live: 1.1.14 / #401 / `Opp1E9sP7OPnK69ZOE-eU` / `7a67438`, health `database: ok`. |
| Nov 5, 2026 | `1192ccd` on `master` | `tc1POEvECsIkfAptXzBIG` | **1.1.17 — the newest card carries a real release's detail, and the page is proven to render, deployed to production.** 1.1.16 verified itself by grepping the served chunk for Thai bytes, which proves the bundle carried them and nothing about whether the page showed them — and its own card still had no detail, because a bundle is always built before the row describing it exists. The card now falls back to the newest *logged* release in full (Thai title, summary, all four sections) under a caption naming it and its version, while the notice still says the running build has no row; `tests/patch-notes-page.test.tsx` (jsdom, D1–D3) mounts the real page with the committed JSON and asserts the four section labels, `5 พ.ย. 2569`, the newest release's detail text, the unlogged fallback, and that exactly one history row is expanded — the running one. D3 also caught that matching rows by text is wrong (a rollback note names another build's ID), so it indexes by position. Verified on the live origin: `/api/v1/version` and `/api/v1/health` report 1.1.17 / #407 / `tc1POEvECsIkfAptXzBIG`, `/management/patch-notes` answers 200, and the served `page-028f206af2badc65.js` (200, 61,081 bytes) contains 1.1.16's Thai title, its first change line, the new caption, and both section labels. Live: 1.1.17. |
| Nov 5, 2026 | `de168e7` on `master` | `C-hiNzGj4ALNiP-mK3I9T` | **1.1.16 — บันทึกแพตช์ speaks Thai and shows the newest build, deployed to production.** The page rendered one long English paragraph per release and its baked JSON stopped at 1.1.13, so the owner saw English and no sign of 1.1.14/1.1.15. Every release now has an authored Thai entry (`src/data/patch-notes-th.json`, keyed by BUILD_ID) split into ปัญหา / สิ่งที่เปลี่ยน / ตรวจสอบแล้ว / หมายเหตุ, dates read `5 พ.ย. 2569`, and the live card carries the newest release's detail instead of only its title. That layer is hand-written, so P6/P7 make a missing (or orphaned) Thai entry a red build rather than English on a Thai panel. Verified on the served chunk `page-47d1d3887e109a18.js` (200, 56,667 bytes): สิ่งที่เปลี่ยน, ตรวจสอบแล้ว and the newest Thai titles are all present. Live: 1.1.16 / #405 / `C-hiNzGj4ALNiP-mK3I9T` / `de168e7`. The page cannot list its own row yet — a bundle is always baked before the row that describes it exists — so it names the running build and shows the previous release under a caption saying whose detail it is. |
| Nov 5, 2026 | `a9c9472` on `master` | `Cvm6k6VOEzORNV_BiJ7QN` | **1.1.15 — the token travels as a curl config, deployed to production.** 1.1.14 wrote the bare token intending `-H x-cron-token:$(cat …)`, and the first live run taught the real constraint: **Plesk's scheduler kills any command containing `$`** — both the inline substitution and a `T=$(cat …)` assignment ended `error` in under a second with empty output, while the identical command without `$` ran fine. The file is now a curl config (`header = "x-cron-token: …"`, 0600) read with `-K`, so the task needs no substitution and no quoting. Task **254** (`*/10 * * * *`, Active) drives the three sweeps; its first run authenticated and returned `{"ok":true,"scanned":2,"expired":2,"timeoutMinutes":30}`, expiring the two audit orders (`NK-2026-000190`, `-000191`) that had been waiting since morning. Three hours later the evidence file had advanced on its own (`cutoff` 07:20Z → 10:10Z, ~18 fires), and `cron-curl.conf` had been rewritten at 10:45Z when Passenger respawned the app — so both the cadence and the boot path hold without attention. `-K` was checked against the live endpoint first with a dummy token (401, not 503), so the header really was sent. Live: 1.1.15 / #402 / `Cvm6k6VOEzORNV_BiJ7QN` / `a9c9472`. |

---

*Written by Buffy (Codebuff) · Sep 30, 2026 · Updated Oct 4, 2026 — deploys `13bdf58`, `2ee2ae7`, `cbbe097` and `4c84ef9` recorded above; verify the live build with `buildId` from `/api/v1/version`, not `gitSha`.*
