# Secret Rotation Checklist — concrete click-paths (site stays up at every step)

Turns §4.A of [hostatom-live.md](hostatom-live.md) into executable steps. Facts verified in code
before writing (Oct 1, 2026):

- **Prisma uses only `DATABASE_URL`** (`prisma/schema.prisma` datasource). `DATABASE_DIRECT_URL` was
  deleted from Infisical on Sep 30 and the app boots + passes health checks — nothing needs it today.
- **JWT**: `src/lib/jwt.ts` — min 32 chars, throws in production if missing (fail-closed). Rotation
  invalidates every existing session (admin + customers) — announced, expected.
- **Gift codes**: `src/lib/crypto/giftCode.ts` reads **one** key (`NK_GIFT_CODE_ENCRYPTION_KEY`) via
  `getKey()`; every `GiftCode` row stores `keyVersion` (default 1). `NK_GIFT_CODE_ENCRYPTION_KEY_V1`
  exists only in Infisical — **no code reads it**. ⚠️ Therefore you CANNOT blind-rotate the gift
  key: all stored ciphertexts decrypt with the current key. The safe path is the paired re-encrypt
  script in `scripts/` (below).
- Slips: `NK_SLIP_TOKEN_SECRET` falls back to `NK_JWT_SECRET`; it is not set separately in Infisical,
  so rotating JWT covers it.**Progress — Oct 3, 2026:** Step 1 ⚠️ **RE-EXPOSED — rotate again.**
The Oct 2 rotation succeeded, but on Oct 3 the Plesk Node.js panel was read again and the
**new** client secret was displayed in clear text into session logs. So the Oct 2 secret is now
burned too. This is the second burn of the same credential, both times caused by reading the panel.
Execute [infisical-secret-rotation-oct3.md](infisical-secret-rotation-oct3.md) — same method, and
**never read the panel's value field again**; check presence, never contents.

Also still outstanding from Oct 2: the burned `2018***` secret is **past its 24–48 h soak** and can
now be deleted from `hostatom-prod`.

Step 4 ✅ gift key rotated end-to-end. **Still open: Steps 2, 3, 5** and the remaining
Step-6 hygiene items (audit-log glance, backups off-machine).

> **⚠️ `VERCEL_GIT_COMMIT_REF` is load-bearing — do not delete it.** A later handoff called it "a
> fossil from the Vercel era" and recommended removing it. It is read by
> `src/app/api/v1/version/route.ts` and `src/app/api/v1/internal/build-info/route.ts`. Removing it
> makes `/api/v1/version` report `gitRef: unknown` and silently breaks deploy verification. The
> *name* is a fossil; the variable is required.

> **Resolution — Oct 2, 2026:** the Oct 1 "correction" below was itself mistaken. Opening
> `hostatom-prod` in Infisical showed its Universal-Auth **Client ID = `6be89e56-…`** — the very
> value the panel displays. There was never an old/new identity pair; the burned material was the
> client SECRET (shown in panel screenshots/chat). Rotated Oct 2 via Infisical's multi-secret
> support: added a new client secret to the same identity → pasted into Plesk → Restart App →
> verified. See hostatom-live.md §4.A/§5.
>
> **Historical correction — Oct 1, 2026:** an earlier entry claimed the identity swap was done
> and only old-identity deletion remained; at that time the panel genuinely showed the old
> secret (`2018…`) and the identity detail page had not been checked. Lesson recorded: verify
> identity↔client-ID mapping on the identity page before declaring a mismatch.

**Where things live:** secrets = Infisical project `nong-kati` (id `80151198-…`), environment
**Production** → app reads them at boot via machine identity (server.js). Only the 5 `INFISICAL_*`
bootstrap vars + `VERCEL_GIT_COMMIT_REF=master` sit in Plesk. After ANY change below:
Plesk → Node.js → **Restart App** → verify before moving on.

**Verify after every step:**
```bash
curl -s https://nongkatistore.com/api/v1/version      # {"gitSha":"13bdf58…","gitRef":"master"}
curl -s https://nongkatistore.com/api/v1/health       # healthy + database ok
curl -s -o /dev/null -w "%{http_code}\n" https://nongkatistore.com/api/v1/products   # 200
```

---

## Step 0 — Snapshot (before touching anything)

1. **Export Infisical secrets list (names only)**: Infisical → project **nong-kati** → Production →
   ⋯ menu → nothing to export for names; just screenshot the name column (values stay hidden).
2. **DB backup**: Supabase dashboard → project → **Database → Backups** → note the latest automatic
   backup timestamp. (PITR, if enabled, covers you for point-in-time restore.)
3. Confirm current site is green: run the three curl checks above.

---

## Step 1 — Rotate Infisical machine identity (the burned one)

This is the credential that was displayed in the Plesk panel and chat. Highest priority.

**Infisical:**
1. app.infisical.com → org → project **nong-kati** → **Settings → Access Control → Machine Identities**
   (left nav under project settings).
2. Find the old identity (the one whose client ID is `6be89e56-…` — shown in Plesk). **Do not delete
   it yet.** Click **⋯ → Edit role** → set role to **No Access** (or remove it from the project
   members) — this instantly cuts its ability to read secrets.
3. **Create → Machine Identity** → name `hostatom-thsv93-app` → Add to project **nong-kati** →
   role **Secrets Reader** (read-only) → Universal Auth → **Create**. Copy the **Client ID** and
   **Client Secret** now (shown once) into your password manager.

**Plesk (thsv93):**
4. clientarea → product 74879 → **Manage Domains** (SSO) → **Node.js** → Dashboard → Custom
   environment variables → **specify** → change `INFISICAL_CLIENT_ID` + `INFISICAL_CLIENT_SECRET`
   to the new values → **OK**.
5. **Restart App**. Verify: the three curls + homepage. If boot fails (fail-closed), re-check the
   two values — the app exits rather than serving without secrets.

**Infisical (cleanup):**
6. Once verified, delete the old identity (Machine Identities → ⋯ → Delete).

> **Status Oct 2, 2026:** rotation executed via a SECOND client secret on the single existing
> identity (steps 4–5 done and verified); remaining cleanup = delete the burned `2018***` secret
> from `hostatom-prod` after the soak. Details: [infisical-identity-swap-plesk.md](infisical-identity-swap-plesk.md).

> Rollback: set role of old identity back and/or paste old values into Plesk. Both credentials
> remain valid until the old one is deleted, so you can flip back at any time before deletion.

---

## Step 2 — Rotate the database password (Supabase)

Prisma uses only `DATABASE_URL` (pooler :6543). No staging, no second consumer.

**Supabase:**
1. supabase.com/dashboard → your project (the one `DATABASE_URL` points at) → **Project Settings → Database →
   Database password** → **Reset database password** → generate → copy.
   ⚠️ This instantly invalidates the old password; the live app keeps its pooled connections
   (open connections survive), but new connections fail until step 4 — do 2–4 quickly.
2. Copy the **Connection string (pooler, port 6543)** and substitute the new password.

**Infisical:**
3. Project **nong-kati** → Production → `DATABASE_URL` row → pencil icon → paste the new full URL
   (keep `?pgbouncer=true`) → **Save commit**.

**Plesk:**
4. Node.js → **Restart App** → verify the three curls **and** log in as a test customer / open
   `/products` (exercises real queries).

> If anything stalls: reset the password back in Supabase (set it to the previous value — you kept
> it in your password manager) → restart → investigate calmly.

---

## Step 3 — Rotate `NK_JWT_SECRET`

Consequence: **every user session dies** (all logged-in customers + admin). Expect support pings.
Do it in a low-traffic window.

1. Generate: `openssl rand -hex 32` (or your password manager's generator). 64 hex chars ≥ 32-char
   minimum. Store in password manager.
2. Infisical → Production → `NK_JWT_SECRET` → edit → paste → save.
3. Plesk → Node.js → **Restart App**.
4. Verify: three curls; then **log in as admin** (2FA prompt will appear since sessions reset) and
   as a test customer; confirm `/dashboard` renders.
5. Users simply log in again — no data loss (sessions only).

> Slip tokens (`NK_SLIP_TOKEN_SECRET`) fall back to this value in code; rotation covers them.

---

## Step 4 — Rotate the gift-code key (requires re-encrypt — script provided)

**Never just swap the secret.** All existing `GiftCode` rows were encrypted with the current key
and decrypt with it. The safe pattern: introduce a new key as `keyVersion 2`, re-encrypt every row,
then make version 2 the active key — with a dry-run first.

**Shipped tooling (in code since Oct 1, 2026):** `src/lib/crypto/giftCode.ts` now supports a
two-version key ring, and `scripts/re-encrypt-gift-codes.mjs` does the rotation:

- **App changes:** `decryptCode` uses the row's `keyVersion` (1 → `NK_GIFT_CODE_ENCRYPTION_KEY`,
  2 → `NK_GIFT_CODE_ENCRYPTION_KEY_V2`, which **falls back to the base variable when unset** —
  that makes the final Infisical swap seamless). `encryptCode` stamps new rows with
  `NK_GIFT_CODE_ACTIVE_KEY_VERSION` (default 1) and returns the version for inserts; every
  insert path (bulk paste, dev-seed, CSV import) persists it.
- **Script:** dry-runs by default (decrypt V1 → re-encrypt V2 → roundtrip-verify → report,
  writes nothing), applies everything in **one transaction** with `--apply` (any failure aborts
  the whole pass — never half-rotated), and is **idempotent** (rows already at keyVersion 2 are
  skipped, so re-running is safe). `codeHash` is untouched (key-independent). Refuses to start
  if V2 == V1, if keys are malformed, or if a probe row fails to decrypt with the local keys.

Run order:

```bash
# 0. Generate the new key FIRST and store it in your password manager:
#      openssl rand -hex 32

# 1. Dry run (no writes) — needs the current key in .env.local and the new one passed in:
NK_GIFT_CODE_ENCRYPTION_KEY_V2=<new key> node scripts/re-encrypt-gift-codes.mjs

# 2. Deploy this build to the server (dual-key support must be live before the swap):
#      docs/deploy-hostatom-manual.md  (or: bash scripts/deploy-artifact.sh)

# 3. Add the new key to Infisical as NK_GIFT_CODE_ENCRYPTION_KEY_V2 → Restart App → 3 curls.
#    (Adding V2 to Infisical is safe any time — the app only reads it for keyVersion-2 rows.)

# 4. Real pass — one transaction, idempotent:
NK_GIFT_CODE_ENCRYPTION_KEY_V2=<new key> node scripts/re-encrypt-gift-codes.mjs --apply

# 5. Swap: Infisical NK_GIFT_CODE_ENCRYPTION_KEY = <the same new value> → Restart App →
#    3 curls + spot-check a delivered code on /account (โค้ดที่ซื้อ) + one guest order page.
#    After this swap the app needs only the base variable (V2 falls back to it);
#    NK_GIFT_CODE_ENCRYPTION_KEY_V2 can then be DELETED from Infisical.
#    Optional during the window before the swap: NK_GIFT_CODE_ACTIVE_KEY_VERSION=2 so new
#    uploads are stamped 2 — after the swap, leave it unset (default 1 = the same key material).
```

> **Rollback before the swap (step 5):** nothing to do — the old key still decrypts everything
> (`keyVersion` 1 rows are untouched, and the V1 value is still in Infisical + your manager).
> **Rollback after the swap:** restore BOTH Infisical vars — base = old key,
> `NK_GIFT_CODE_ENCRYPTION_KEY_V2` = new key — then restart. Version-2 rows decrypt via the V2
> variable again, new rows go back to version 1, and no re-encryption is needed. Keeping the V2
> var in Infisical costs nothing (the app ignores it for version-1 rows); deleting it is the
> final cleanup step once you're confident the rotation is permanent.

**Supabase (SQL Editor) fallback — verification query after any rotation:**
```sql
SELECT keyVersion, count(*) FROM "GiftCode" GROUP BY keyVersion;
-- Expect: 2 | <total rows>  (0 rows left at version 1 after the pass)
```

---

## Step 5 — Panel passwords & other credentials

| Credential | Where | How |
|---|---|---|
| Hostatom clientarea | support.hostatom.com → Hello menu → **Change Password** (or Security settings) | rotate, store in manager |
| Plesk thsv93 login | Via clientarea SSO or direct login → **My Profile → Change Password** | rotate |
| Plesk thsv51 login | Same path on the old panel (also its `nongka` system user password if it has one) | rotate |
| Supabase account | supabase.com → Account → Password | rotate |
| Infisical account | app.infisical.com → avatar → **Settings → Security** → change password (+ review active sessions/devices) | rotate |
| Git deploy key on old box | thsv51 Plesk → **Git** (last commit `69a4da4`) → repo settings → remove/revoke the deploy key | revoke — this is the leftover CI credential |
| SSH key `natnithichai.s@gmail.com` | Only in thsv93 `~/.ssh/authorized_keys` (SSH shell is disabled anyway). Leave or remove from Plesk → **Websites & Domains → SSH Access** if unused | optional |

---

## Step 6 — Post-rotation hygiene

1. Re-run the three curls + login test one final time.
2. Infisical → **Audit Log** (project view): confirm the last events are only your rotations.
3. Plesk → Node.js → Dashboard: confirm env list contains only the 6 expected vars (5 × INFISICAL_*
   + VERCEL_GIT_COMMIT_REF) — new identity values, no leftovers.
   ⚠️ As of Oct 1, 2026 this check **fails by design** until Step 1 is finished: the panel still
   shows the old `6be89e56-…` client ID. Completing Step 1 steps 4–6 (swap + restart + verify)
   is what makes this pass. The single source of truth for the expected client-ID prefix is the
   §5 note in hostatom-live.md — every deploy's Step-4 identity check reads that line, so update
   it as part of this swap.
4. `backups/` (customer PII JSONs): copy off-machine encrypted (§4.D of hostatom-live.md), then
   delete local copies.
5. Mark this checklist done in hostatom-live.md §4.A (link to this doc).
