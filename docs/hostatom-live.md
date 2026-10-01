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
| Oct 2, 2026 | — (secret rotation) | — | **Infisical client-secret rotation for Plesk — done.** Discovery: only one machine identity exists (`hostatom-prod`, ID `bcf6ab49-…`; its Universal-Auth client ID IS the panel's `6be89e56-…`). Added a second client secret to `hostatom-prod` (desc: "Plesk thsv93 rotation Oct 2026"), pasted it into Plesk Node.js env (client ID unchanged), Restart App, fail-closed boot verified green (version `13bdf58`, health `database: ok`, products 200, slip-verify enabled, homepage 0 turbopack). Burned `2018***` secret now unused — remove from Infisical after a 24–48 h soak; rollback until then = re-paste the old value. New secret must live in the password manager. |

---

*Written by Buffy (Codebuff) · Sep 30, 2026 · Updated Oct 1, 2026 — deploy `13bdf58` recorded above; work committed locally on `master`.*
