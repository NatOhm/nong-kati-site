# Plesk cutover — the exact Phase 5–8 runbook

This is the **authoritative, executable** version of Phases 5–8. The phase plan, the reasons for
each design choice and the rehearsal evidence live in
[db-migration-hostatom-mariadb.md](db-migration-hostatom-mariadb.md); the backup artifacts and the
restore procedure live in [db-backup-restore.md](db-backup-restore.md). Where this file gives a
command, that command has been run on branch `db/mariadb-port` against a MariaDB 10.11 copy of
production (see "What is already verified" below).

Nothing here has been executed against production. The database, the secrets and the Supabase
project are untouched, and this branch is not pushed.

---

## What is already verified (so you are not the first to try it)

| Claim | How it was verified |
| --- | --- |
| The schema targets MySQL | `prisma/schema.prisma`: `provider = "mysql"`, `url = env("DATABASE_URL")`, `directUrl = env("DATABASE_DIRECT_URL")` |
| One baseline migration, no Postgres history | `prisma/migrations/20261115000000_baseline/`; old 34 migrations in `prisma/migrations-archive-postgres/` |
| `migrate deploy` builds the schema from empty | applied to a fresh `mariadb:10.11` → **39 tables** (38 models + `_prisma_migrations`) |
| The ETL copies everything | `38 tables, 2576 rows, every count matches` on a pristine target |
| The write paths work on MariaDB | `scripts/precutover-check.mjs` → **27/27** (last run 2026-11-14 on `:3307`) |
| Gift codes decrypt after the move | 170 rows on the copy: **139 at `keyVersion 1`, 31 at `keyVersion 2`**, all decrypted with the current `NK_GIFT_CODE_ENCRYPTION_KEY` and each plaintext's SHA-256 equalled the stored `codeHash` |
| Nightly backup tooling | `scripts/backup-mariadb.sh`, restore-verified (39 tables, matching counts), retention proven |

---

## 1. Provision the database (Plesk)

**Where:** Hostatom clientarea → Web Hosting → Web Hosting Go PL `nongkatistore.com` (product
74879) → การดำเนินการ → **Login to Plesk Control Panel** → Websites & Domains →
`nongkatistore.com` → **Databases** → **Add Database**.

The panel offers MariaDB `localhost:3306` only (v10.11.18) — there is no Postgres on this server,
which is the whole reason for this migration.

**Values to use**

| Field | Value |
| --- | --- |
| Database name | `nong_kati` |
| Server | `localhost:3306 (default for MariaDB)` |
| User name | `nk_app` (dedicated — never reuse the subscription's own login) |
| Password | see the rule below |

**Password rule:** generate an **alphanumeric-only** password (16–24 chars, no `:/?#[]@%&`).
Every consumer places it in a URL — `DATABASE_URL`, `scripts/backup-mariadb.sh`, the ETL — and a
raw `@` or `/` in a password silently truncates the host or the database name. If you must use a
symbol, it has to be percent-encoded everywhere, which is a needless trap.

**Collation:** the database must be `utf8mb4`. Plesk creates MariaDB databases `utf8mb4` by
default, but check it in phpMyAdmin:

```sql
SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = 'nong_kati';
-- expect utf8mb4 / utf8mb4_general_ci or utf8mb4_unicode_ci
-- if it is not utf8mb4:
ALTER DATABASE `nong_kati` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**Least-privilege grants.** Plesk's default for a database user is "all rights, on this database
only", which is already scoped but broader than the app needs. `prisma migrate deploy` requires
DDL rights, so the minimum that still works is:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE,
      CREATE, ALTER, DROP, INDEX, REFERENCES,
      CREATE TEMPORARY TABLES, LOCK TABLES
  ON `nong_kati`.* TO 'nk_app'@'localhost';
FLUSH PRIVILEGES;
```

Notes that matter in practice:

- No `GRANT`/`CREATE USER` right, no rights on `mysql.*`, no rights on any other database.
- `CREATE`/`ALTER`/`DROP`/`INDEX` are only needed by migrations. After the cutover has soaked you
  can revoke them and re-grant for the next release; leaving them granted is what every Prisma
  deploy needs, so most shops leave them.
- Plesk may have created the user as `'nk_app'@'localhost'` already; the `GRANT` above then only
  narrows it. If you instead connect over TCP as `127.0.0.1` and get `P1001`, add
  `'nk_app'@'127.0.0.1'` with the same grant — MariaDB treats the two as different hosts.

**Connection strings the app expects** (both are required; the schema reads `directUrl` for
migrations):

```dotenv
DATABASE_URL="mysql://nk_app:DBPASS@localhost:3306/nong_kati"
DATABASE_DIRECT_URL="mysql://nk_app:DBPASS@localhost:3306/nong_kati"
```

- `mysql://`, not `postgresql://` — a leftover `postgresql://` makes every query fail.
- **No `?schema=store`.** On Postgres that selected a schema; on MariaDB the database *is* the
  schema, and Prisma rejects the parameter on MySQL.
- `?connection_limit=5` is accepted and harmless (Prisma pools per process; with one Passenger
  process it changes nothing). Omit it unless you are tuning.
- Same-host Plesk MariaDB ⇒ host `localhost`, port `3306`, plain TCP. There is no pooler and no
  second port to worry about, so both variables carry the identical string.

**Where the strings go — two allowed places, and one is better for the cutover**

`server.js` boots with a fail-closed Infisical loader, and in doing so it applies one rule:

> **Panel-provided variables always win; Infisical only fills what is missing.**

So both of these work, and they have very different rollback costs:

| Option | How | Rollback |
| --- | --- | --- |
| **A — Plesk panel override (recommended for the window)** | Node.js → **Custom environment variables** → add `DATABASE_URL` and `DATABASE_DIRECT_URL` with the MariaDB strings | delete those two rows → Restart App → Infisical's Supabase values are back in force |
| B — Infisical | Project `80151198-f2df-…`, env `prod` → edit `DATABASE_URL` / `DATABASE_DIRECT_URL` | edit them back, Restart App |

Option A is recommended precisely because rollback is "delete two rows"; edits in Infisical are
harder to un-do accurately under pressure and affect anything else that reads that project.

`src/lib/db.ts` constructs the single `PrismaClient` from `DATABASE_URL` at process start, so
**Restart App** (Node.js panel) is part of the switch, not an optional extra.

---

## 2. Environment and secrets checklist

The panel holds only `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_PROJECT_ID`,
`INFISICAL_ENV` (+ `VERCEL_GIT_COMMIT_REF`); everything else arrives from Infisical at boot. That
is why column "today" says Infisical.

| Variable | Read by | Today | At cutover | Supplied by |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Prisma runtime (every query) | Supabase pooler URL (Infisical prod) | `mysql://nk_app:DBPASS@localhost:3306/nong_kati` | **you** (password is yours) |
| `DATABASE_DIRECT_URL` | `prisma migrate deploy`, `directUrl` | Supabase direct `:5432` (Infisical) | the identical MariaDB URL | **you** |
| `NK_GIFT_CODE_ENCRYPTION_KEY` | `src/lib/crypto/giftCode.ts` → `keyForVersion(1)`, and `keyForVersion(2)` when `_V2` is absent | 64-hex, Infisical prod (the v2 material) | **copy it byte-for-byte** — do not regenerate | **you** (agent does not hold it) |
| `NK_GIFT_CODE_ENCRYPTION_KEY_V2` | `keyForVersion(2)` | Infisical (same material as above, kept as a hatch) | copy or omit — either is correct | **you** |
| `NK_GIFT_CODE_ACTIVE_KEY_VERSION` | `activeKeyVersion()` | unset ⇒ 1 | **leave unset** (1). Setting `2` only makes sense mid-rotation | — |
| `NK_JWT_SECRET` | admin/customer tokens (`HS256`) | Infisical prod | unchanged | **you** |
| `NK_SLIP2GO_SECRET` | `slip-verify` → `Authorization: Bearer` | Infisical prod | unchanged | **you** |
| `NK_SLIP2GO_BASE` | Slip2Go base URL | unset ⇒ `https://connect.slip2go.com` | leave unset in production | — |
| `NK_SLIP_TOKEN_SECRET` | slip status tokens (falls back to `NK_JWT_SECRET`) | unset ⇒ JWT secret | leave as is | — |
| `NEXT_PUBLIC_SITE_URL` | **build-time**, and `src/lib/fulfilment.ts` fails closed in production without it | `https://nongkatistore.com` | same, exported before `npm run build` | **you** (build env) |
| `NK_RESEND_API_KEY` / `NK_RESEND_FROM_EMAIL` | `src/lib/email/config.ts` | Infisical prod | unchanged (mail does not touch the DB path) | **you** |
| `NK_CRON_SECRET`, `NK_INTERNAL_TOKEN` | cron/internal routes | Infisical prod | unchanged | **you** |
| `INFISICAL_CLIENT_ID` / `_SECRET` / `_PROJECT_ID` / `INFISICAL_ENV` | `server.js` boot loader | Plesk panel | unchanged | **you** |

Only the first three rows actually *change*. Everything else must simply survive the restart
unchanged — a missing `NK_GIFT_CODE_ENCRYPTION_KEY` or `NEXT_PUBLIC_SITE_URL` is the realistic
way this cutover breaks, not the database itself.

### The 170 gift codes and that one key

Verified on the migrated copy (not assumed):

- Distribution: **139 rows `keyVersion 1`, 31 rows `keyVersion 2`**.
- `keyForVersion(2)` falls back to `NK_GIFT_CODE_ENCRYPTION_KEY` when `_V2` is absent, and the
  base variable currently holds the material all 170 rows were encrypted with. Both versions
  decrypted, and each plaintext's SHA-256 equals the stored `codeHash`.
- Consequence: **one 64-hex value is load-bearing for every sold code.** Copy
  `NK_GIFT_CODE_ENCRYPTION_KEY` from Infisical prod (`prod`) exactly.

Failure mode if it is regenerated (e.g. someone runs `openssl rand -hex 32` "for the new server"):

- Decryption is AES-256-GCM with an auth tag, so a wrong key throws
  `Unsupported state or unable to authenticate data` from `decipher.final()`.
- That hits **`GET …/codes/:id/reveal`** (admin), **fulfilment** (`src/lib/fulfilment.ts` and
  `src/lib/delivery/customerCodes.ts` both decrypt before delivering) and customer code pages —
  so a paid order confirmation would 500 and deliver nothing.
- Recovery is impossible from the database alone: `GiftCode` stores ciphertext, nonce, key
  version and a **SHA-256 hash of the plaintext** — a hash cannot be reversed. The plaintext
  exists only in the original supplier files. The Postgres backup does **not** contain the key
  (it is an env secret, not a row), which `docs/db-backup-restore.md` records explicitly.
- A malformed key fails earlier and louder: `keyForVersion` refuses anything that is not exactly
  64 hex chars ("refusing to derive a weak key").

So: before the window, open Infisical prod and confirm all three of `NK_GIFT_CODE_ENCRYPTION_KEY`,
`NK_GIFT_CODE_ENCRYPTION_KEY_V2`, `NK_JWT_SECRET` still exist. After the cutover, revealing one
code in admin is a mandatory checkpoint, not a nice-to-have.

---

## 3. The cutover window (~30–40 min, 02:00–03:00 ICT)

Assumed working machine: this checkout, `node_modules` installed, **Docker available** (the
backup scripts and the ETL read Postgres through `postgres:17-alpine`), SSH to the vhost
(`nongka@thsv93.hostatom.com`, key or password).

The server's MariaDB listens on `localhost` only, so the workstation reaches it through an SSH
tunnel on `127.0.0.1:3307`. Do **not** enable remote database access in Plesk for this.

### Pre-flight (T−60 min)

```bash
git -C webapp/nong-kati/nong-kati status --short          # must be clean
node -v                                                   # 20.x
docker info >/dev/null && echo "docker ok"
ssh -N -L 3307:localhost:3306 nongka@thsv93.hostatom.com  # keep open in one terminal
```

In a second terminal, prove the tunnel reaches MariaDB (you will be prompted for the DB password):

```bash
mysql -h 127.0.0.1 -P 3307 -u nk_app -p -e "SELECT 1" nong_kati
```

`mysql` need not exist locally — the path is exercised for real two steps later.

### Step 1 — fresh backup, and prove it (T−40)

```bash
node scripts/backup-supabase-db.mjs --out-dir="E:/งานนะจ๊ะ/2569/Nong-kati/db-backups"
node scripts/verify-supabase-backup.mjs --dump="E:/งานนะจ๊ะ/2569/Nong-kati/db-backups/<new dump>.dump"
```

**Checkpoint:** the verify run restores into a scratch `postgres:17-alpine` on `:5544` and prints
per-table reconciliation. Expect every populated table to match count **and** fingerprint, and
only `vault.secrets` skipped (the `supabase_vault` extension is absent in a stock image). Do not
proceed on a mismatch.

### Step 2 — schema on the target (T−30)

```bash
DATABASE_URL="mysql://nk_app:DBPASS@127.0.0.1:3307/nong_kati" \
DATABASE_DIRECT_URL="mysql://nk_app:DBPASS@127.0.0.1:3307/nong_kati" \
  npx prisma migrate deploy

DATABASE_URL="mysql://nk_app:DBPASS@127.0.0.1:3307/nong_kati" npx prisma migrate status
```

**Checkpoint:** `migrate deploy` applies exactly one migration
(`prisma/migrations/20261115000000_baseline`),
`migrate status` says up to date, and
`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='nong_kati'` returns **39**.

### Step 3 — freeze writes, then ETL (T−20)

Freeze: Plesk → Node.js → **Stop** (or the equivalent), so no order lands between export and
switch. The storefront is down for this step; it is the only downtime in the whole plan.

The ETL reads the **source** from `SOURCE_DATABASE_URL` or `DATABASE_URL` in `.env.local`, and
writes the target you name:

```bash
# .env.local DATABASE_URL must be the Supabase DIRECT (:5432) string at this point
TARGET_DATABASE_URL="mysql://nk_app:DBPASS@127.0.0.1:3307/nong_kati" \
  node scripts/migrate-supabase-to-mariadb.mjs

TARGET_DATABASE_URL="mysql://nk_app:DBPASS@127.0.0.1:3307/nong_kati" \
  node scripts/migrate-supabase-to-mariadb.mjs --verify-only
```

**Checkpoint:** the copy prints `38 tables — 2576 rows copied, every count matches the source`
(2026-11-14 numbers; they will be slightly higher on the night) and `--verify-only` re-confirms
with zero differences. Any difference is exit 1 — stop here, nothing has been switched.

### Step 4 — build the artifact against the target (T−10)

```bash
DATABASE_URL="mysql://nk_app:DBPASS@127.0.0.1:3307/nong_kati" \
NEXT_PUBLIC_SITE_URL="https://nongkatistore.com" \
  npm run build
```

**Checkpoint:** `✓ Compiled successfully`. This build is what both the gate and the deploy use;
building it against the target is what makes "prerendered" output honest.

### Step 5 — the gate (T−5)

```bash
TARGET_DATABASE_URL="mysql://nk_app:DBPASS@127.0.0.1:3307/nong_kati" \
  node scripts/precutover-check.mjs
```

**Checkpoint:** `RESULT: 27/27 checks passed`. It writes real rows, reads them back, restores
inventory and deletes its own rows — it refuses to run against a Supabase host. If it is not
27/27, go to **Rollback A**; production is still on Supabase.

### Step 6 — switch (T−0)

1. Plesk → Node.js → **Custom environment variables** → add, with the **server-side** host:
   ```
   DATABASE_URL=mysql://nk_app:DBPASS@localhost:3306/nong_kati
   DATABASE_DIRECT_URL=mysql://nk_app:DBPASS@localhost:3306/nong_kati
   ```
2. **Restart App** (Node.js panel).
3. Start accepting traffic again.

**Checkpoint:** `curl -s https://nongkatistore.com/api/v1/health` → `"database":"ok"` and a fresh
`uptime` (a real restart, not a cached response); `curl -s https://nongkatistore.com/api/v1/version`
returns the build you just made.

### Step 7 — verify like a customer (T+10)

- `/`, `/search`, `/api/v1/products` → 200 and the Thai catalogue renders.
- Admin: edit a product, save, reload, value persists.
- Admin: reveal **one** gift code → plaintext appears (this is the encryption-key checkpoint).
- **One real Slip2Go slip end to end**: place a genuine low-value order (e.g. ฿9), pay by manual
  transfer to `199-1-73578-6`, upload the real slip → expect verified, order completed, codes
  delivered, customer page green. A `200200` is a real confirmation. Watch for
  `500 FULFILMENT_FAILED`: if the confirmation transaction times out, the order is parked as
  `pending_manual_fulfilment` rather than lost — fulfil it manually and note it.
- Re-run the gate against production if you want the machine's opinion:
  `TARGET_DATABASE_URL="mysql://nk_app:DBPASS@127.0.0.1:3307/nong_kati" node scripts/precutover-check.mjs`
  (through the tunnel; it cleans up after itself).

### Step 8 — leave it soaking

Supabase stays untouched and paused only after the soak (§5). Do not delete it.

---

## 4. Rollback

Two cases, because the state left behind differs.

**Rollback A — any checkpoint before Step 6 fails (production never moved)**

1. Delete the partially-filled `nong_kati` database (Plesk → Databases → the DB → Delete), or
   leave it and re-run from Step 2; the ETL is idempotent per table and refuses to double-count.
2. Restart the app in Plesk (it was stopped in Step 3).
3. Nothing on Supabase changed, so customers see no difference. Investigate, then retry.

Left behind: a MariaDB database with some or all rows, no traffic, no secret changes.

**Rollback B — Step 6 or 7 fails (traffic is on MariaDB)**

1. Plesk → Node.js → Custom environment variables → **delete** the two rows you added (or set
   them back to the Supabase strings).
2. **Restart App**.
3. `curl -s https://nongkatistore.com/api/v1/health` → `database: ok`, uptime reset.

Left behind: MariaDB holds every write made during the failure window (orders, payments, stock
movements, code deliveries) that Supabase does not have. Enumerate them before the retry —
`SELECT id, orderNumber, createdAt FROM \`Order\` WHERE createdAt > '<switch time>'` — and either
replay them by hand into Supabase or contact the affected customers. That reconciliation is the
real cost of a late rollback, and it is why Steps 5–6 are gated.

The Supabase project is not paused or deleted until §5, so rollback is minutes, not hours.

---

## 5. Post-cutover soak, then pause Supabase

**7–14 days**, with these watched:

| What | How | Green |
| --- | --- | --- |
| Database reachable, no crash-restarts | `npm run monitor:health` (or the existing monitor task) against `https://nongkatistore.com/api/v1/health` | uptime resets only after idle gaps, `database: ok` |
| Orders actually complete | Admin order list; one order per day end to end | no stuck `pending_payment` beyond the normal window |
| Gift codes reveal/deliver | Admin reveal; one real purchase | plaintext appears, no `unable to authenticate data` |
| Money is exact | Spot-check a wallet debit and a refund against the order total | satang-exact |
| Nothing still reads Supabase | Supabase dashboard → Usage: egress should be **flat/near-zero** | proves the cutover is complete |
| Nightly dumps exist | `ls -lh /var/backups/nong-kati` | a new dump per day, retention holding at 14 |

Then, and only then:

1. **Pause** the Supabase project (Project Settings → General → Pause project). Pausing stops
   egress and is what actually answers the quota mail; it is reversible.
2. Keep `db-backups/db-full-2026-11-14T21-12-33.dump` (+ its `.verify.json`) after the pause —
   it is the only way back to the Postgres data if a data problem surfaces.
3. Delete the project only after the pause has held for a further week.

---

## 6. What the user must authorise

Everything below is irreversible, credential-bearing, or both. The agent has prepared it and
verified it on a copy; it has not done any of it.

1. **Create the database and user** (`nong_kati`, `nk_app`) and grant privileges — new
   production resources.
2. **Write the two `DATABASE_URL` values** into the Plesk panel (contains the DB password).
3. **Run the ETL against production** — it writes ~2.5k rows into the new database. Target only;
   the Supabase source is read, never written.
4. **Stop and restart the app** during the window (brief shop downtime, Step 3).
5. **Run the gate against production** — it creates and then removes its own rows.
6. **Switch traffic** by restarting with the MariaDB URL.
7. **Pause Supabase** after the soak (§5).

Confirm items 1–6 to start the window; item 7 is a separate decision two weeks later.
