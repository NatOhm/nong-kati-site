# Hostatom Cutover — Handoff (Sep 30, 2026)

Status: **LIVE on the new server.** Everything in this repo remains **uncommitted** (sponsored-task rules).
This doc records what was done, the current topology, and the ordered to-do list. **No secret values appear in this file.**

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
   │ All other secrets ← Infisical project 80151198-f2df-…, prod  │
   │ Build GwVbcafjEaeLp2mM2mb4d (git SHA 3e236c2f…)              │
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
- Infisical (prod) secrets by name: `DATABASE_URL`, `GIT_REF`, `GIT_SHA`, `NEXT_PUBLIC_SITE_URL`,
  `NK_GIFT_CODE_ENCRYPTION_KEY`, `NK_GIFT_CODE_ENCRYPTION_KEY_V1`, `NK_JWT_SECRET`,
  `NK_PAYMENT_MOCK`, `VERCEL_GIT_COMMIT_REF`. (`DATABASE_DIRECT_URL` was removed — see §4.A.)
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
2. **Database password** (Supabase): rotate in Supabase → update `DATABASE_URL` in Infisical →
   Restart App → health check. ⚠️ `DATABASE_DIRECT_URL` was deleted from Infisical; the app runs fine
   on the pooler URL, but if you ever need schema push/migrations from the server, re-add a direct
   (:5432) URL as the *Prisma* direct URL (panel or Infisical, your choice).
3. **`NK_JWT_SECRET`**: rotate → all user sessions/tokens invalidate (acceptable; announce if needed).
4. **Gift-code keys** (`NK_GIFT_CODE_ENCRYPTION_KEY` / `_V1`): ⚠️ existing gift codes in the DB are
   encrypted with the current key. Confirm the code path supports key versioning before rotating, or
   plan a re-encrypt migration. Do **not** blind-rotate.
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
- Commit this work when the sponsored-task window allows (still **uncommitted**).

---

*Written by Buffy (Codebuff) · Sep 30, 2026 · All work uncommitted per task rules.*
