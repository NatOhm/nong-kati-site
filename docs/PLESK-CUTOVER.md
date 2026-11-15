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
| The ETL copies everything | `38 tables, 2497 rows, every count matches` on a pristine target, and again on a re-run over a populated one (`cleared 38 table(s) on the target`) |
| The write paths work on MariaDB | `scripts/precutover-check.mjs` → **32/32** (run against the `:3307` copy on build `619e79e`, twice in a row, ending at identical inventory) |
| The shop works **after** the switch | `scripts/postswitch-check.mjs` → **22/22** against a production build on the copy, then **22/22 again** leaving the copy byte-identical; pointed at an unloaded schema it fails on the named `database` check and exits 1 |
| Rollback restores from the dump | `scripts/verify-supabase-backup.mjs` on `backups/db-full-2026-11-14T20-36-47.dump` → `31 tables, 2857 rows`, every populated table matching, receipt in `backups/*.verify.json` |
| Gift codes decrypt after the move | 125 rows on the copy: **139 at `keyVersion 1`, 31 at `keyVersion 2`** when last checked in full, all decrypted with the current `NK_GIFT_CODE_ENCRYPTION_KEY` and each plaintext's SHA-256 equalled the stored `codeHash` |
| Gift-code ↔ variant links survive the port | Source and copy hold the **same 13 available codes with `variantId` NULL** (identical id lists) — genuine data, see §3 Step 7 |
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
  schema. Tested: Prisma **silently ignores** the parameter on MySQL (`migrate status` reports
  `MySQL database "ci" at "127.0.0.1:3307"` and succeeds) — so a URL copied from the Postgres
  days will not fail loudly, it just carries a lie. Drop it.
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

The *apply-it* version of this section is **§6 (Phase 5, six steps)**, and the safe-now versus
cutover split is **§6.1**. Read this section for the values, that one for the order to click
them in — the two are deliberately kept apart so nobody writes a database URL while reading a
table of formats.

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

**One command for Steps 2–5.** The five commands below are the *contract*; the driver runs them in
that order and stops at the first non-zero exit, so a half-run window cannot look like a finished
one. Prefer it in the window and keep the individual steps for reading and for a resume:

```bash
TARGET_DATABASE_URL="mysql://nk_app:DBPASS@127.0.0.1:3307/nong_kati" \
NEXT_PUBLIC_SITE_URL="https://nongkatistore.com" \
  bash scripts/phase6-cutover.sh --yes          # migrate deploy → ETL → images → build → gate
```

`--dry-run` prints the resolved plan (including what the flags removed) and touches nothing;
`--with-backup` takes and verifies a fresh source dump first; `--from=etl` (or `images|build|check`)
resumes after a fixed failure; `--skip-images` drops the image extraction, leaving exactly
**migrate deploy → ETL → build → gate**; every run leaves `reports/phase6-<stamp>.log`. It refuses a non-`mysql://` target, a Supabase host,
and — for a non-loopback target — anything without `--yes`. It does **not** stop the Node app: do
Step 1 by hand first.

### Pre-flight (T−60 min)

```bash
git -C webapp/nong-kati/nong-kati status --short          # must be clean
node -v                                                   # 20.x
docker info >/dev/null && echo "docker ok"
export NEXT_PUBLIC_SITE_URL=https://nongkatistore.com     # the build bakes this in
ssh -N -L 3307:localhost:3306 nongka@thsv93.hostatom.com  # keep open in one terminal
```

Three things this checkout gets wrong by default, all caught before the window opens:

- **`.env.local` says `NEXT_PUBLIC_SITE_URL=http://localhost:4200`.** `next build` bakes that
  value into the artifact, so a window run without the export ships localhost links and
  fulfilment that fails closed. `phase6-cutover.sh` now refuses a localhost build URL against a
  non-loopback target — export the real one *before* running it, not after.
- **The local rehearsal container `nk-mariadb` binds `127.0.0.1:3307`**, the same port the runbook
  tells the SSH tunnel to bind. Either stop it (`docker stop nk-mariadb`) or tunnel on 3308
  (`ssh -N -L 3308:localhost:3306 …`) and point `TARGET_DATABASE_URL` at `:3308`. The driver warns
  when something is already listening on the target port; it cannot tell the tunnel from the
  container, so check which one it is.
- **The Plesk panel (`https://nongkatistore.com:8443`) serves a certificate Chromium will not
  accept** — the automation browser stops on it. Drive the panel in a normal browser, or consider
  it a deliberate human-only surface; `curl -k` reaches it for read-only checks.

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

**Checkpoint:** the copy prints `cleared 38 table(s) on the target` followed by
`✔ verified 38 tables — … rows copied, every count matches the source`, and `--verify-only`
re-confirms with zero differences. Any difference is exit 1 — stop here, nothing has been switched.

The ETL empties every table it is about to write before inserting, which is what makes a retry
safe (a run interrupted half-way can simply be run again). That also means **the app must be
stopped first** — with a live app, a customer could read an empty catalogue during the copy, and
the clear can fail against rows written mid-run.

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

**Checkpoint:** `RESULT: 32/32 checks passed`. It writes real rows and real image files (into a
throwaway `tmp/precutover-media`, never your media directory), reads them back, restores
inventory and deletes its own rows — and refuses to run against a Supabase host. If it is not
32/32, go to **Rollback A**; production is still on Supabase.

When no variant has stock (production is sold out as this is written — `SUM(stock) = 0`, 13
available codes on no variant), the check does not refuse: it stocks one variant through
`POST /api/v1/admin/stock/bulk` and asserts the result as check `0. seed`. Cleanup sets that
variant's counter back to its exact pre-run value, so the shop's numbers are unchanged.

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
### Step 7a — the post-switch check (the machine's opinion)

This is the check that exists for the moment right after **Restart App**. It is pointed at the
live URL and certifies that the process now serving traffic is reading the migrated database:

```bash
TARGET_DATABASE_URL="mysql://nk_app:DBPASS@127.0.0.1:3307/nong_kati" \
  node scripts/postswitch-check.mjs --base=https://nongkatistore.com --max-uptime=600
```

`--max-uptime=600` is how the check knows the process is the one you just restarted (Passenger
resets its uptime). If you would rather it restart the app itself, pass
`--restart-cmd="…"` instead: it runs that command and asserts the uptime actually reset — that is
the form exercised locally.

| Check | Fails when |
| --- | --- |
| `app up` | `/api/v1/health` is not 200 `healthy` with `database: ok` |
| `database` | a real table query throws (an empty schema answers `SELECT 1` but not `Product`), or the app's product count differs from the database's |
| `migration` | a migration in `prisma/migrations` is not applied, or the applied head is not the newest file |
| `restart` | the process is older than `--max-uptime`, or the restart command failed / left the database unreachable |
| `catalogue` | `GET /api/v1/products` total differs from `SELECT COUNT(*) FROM Product WHERE isActive` |
| `admin login` | password → 2FA → `nk_admin_at` cookie → `GET /auth/admin/me` and `/admin/dashboard` do not all succeed |
| `order` | cart preview or order placement fails, or the `Order` row totals differ from the response |
| `redeem` | admin verify-payment does not complete the order and deliver exactly 2 codes with a `deliveredAt` |
| `media` | a product image no longer serves `200 image/…` from disk, or `/` is not HTML |

Exit status is 1 with the failing check named (`✖ database — …`), never a stack trace. The run
writes a temporary admin account, one order and its codes, and stocks a variant **only if none
is in stock**; all of it is removed or restored afterwards.

This was rehearsed against a production build on the `:3307` copy: **22/22 green**, twice,
leaving `SUM(stock)=0`, 125 gift codes (13 available), 0 `image:` rows, 216 orders, 19 admins and
459 audit rows before and after both runs. Pointed at a database with the baseline schema but no
data, it fails on `database` (`the app serves an empty catalogue…`) and exits 1.

**Gift codes with no variant.** Production carries 13 `available` codes whose `variantId` is
`NULL` and which have no order, order item or upload batch. That is **not** link loss in the
ETL: the source database has exactly the same 13 codes with the same ids (compared 2026-11-15),
and the copy reproduces both the ids and the count. They are what is left after the variant rows
they belonged to were purged — the schema comment on `GiftCode.variantId` documents the same
behaviour for delivered codes. Leave them alone; they are not for sale because no variant points
at them.

### Step 7b — move the product images onto disk (egress)

Until now every product photo was a `data:image/…;base64,…` string inside a `SiteSetting` row
(`image:<key>`), so each photo view was a database read: on the copy, **31 rows / 34.4 MB**, the
largest 2.68 MB. Uploads now write files, and the extraction script moves the existing rows:

```bash
# 1. extract from the server's database through the tunnel, into a local folder
DATABASE_URL="mysql://nk_app:DBPASS@127.0.0.1:3307/nong_kati" \
  node scripts/extract-images-to-files.mjs --out-dir=./tmp/media          # dry run
DATABASE_URL="mysql://nk_app:DBPASS@127.0.0.1:3307/nong_kati" \
  node scripts/extract-images-to-files.mjs --out-dir=./tmp/media --apply

# 2. upload the files to the server (the docroot, where the app will look)
scp -r ./tmp/media/* nongka@thsv93.hostatom.com:httpdocs/storage/media/
```

**Checkpoints:** the dry run reports every row decoded and verified; `--apply` then prints
`rows deleted: 31` and re-running it says `nothing to do`; `SELECT COUNT(*) FROM SiteSetting
WHERE key LIKE 'image:%'` is **0**.

**Payment slips move too — separately.** Slips are financial documents (account numbers,
amounts, PDPA), so they go to their own private directory, never the public image namespace:

```bash
DATABASE_URL="mysql://nk_app:DBPASS@127.0.0.1:3307/nong_kati" \
  node scripts/extract-slips-to-files.mjs           # dry run
DATABASE_URL="mysql://nk_app:DBPASS@127.0.0.1:3307/nong_kati" \
  node scripts/extract-slips-to-files.mjs --apply
scp -r ./storage/media/private/slips/* nongka@thsv93.hostatom.com:httpdocs/storage/media/private/slips/
```

**The destination is the directory the app serves from** — `NK_SLIP_DIR` when set, otherwise
`<NK_MEDIA_DIR>/private/slips` (here `./storage/media/private/slips`, the same layout the server
uses). Do **not** point it at a scratch directory: the rows are deleted as soon as their file
verifies, so a throwaway path strands evidence where the download route will never look for it.
Use `--slip-dir=` only when the panel's `NK_SLIP_DIR` is somewhere else, and then copy to *that*
path on the server.

It is a SUBdirectory, so `/api/v1/images/<key>` can never serve one; only
`/api/v1/payments/slip-download/<key>` (admin `orders:read`, or the order's own upload token)
reads them. The download route checks the file first and falls back to a legacy `slip:` row, so
links written before this run keep working.

**Checkpoints:** the dry run lists every row it would move and writes the files without deleting
anything; `--apply` reports `rows deleted: N` and `✔ every slip row has a verified file on disk`;
a re-run prints `✔ nothing to do — no slip row with a servable key is left to move`;
`SELECT COUNT(*) FROM SiteSetting WHERE key LIKE 'slip:%'` drops to the number the script reports
as skipped. A skipped row is one whose key is not `<32 hex>`: every route rejects it with 400, so
it is dead data from an old probe — the script names it and leaves it for you to delete by hand
rather than silently dropping a row it cannot verify.

Rehearsed on the `:3307` copy on 2026-11-15, against the **real** private directory: 44 rows /
9.6 MB moved out of `SiteSetting` into `storage/media/private/slips`, 44 files SHA-256 verified,
then all 44 downloaded through `/api/v1/payments/slip-download/<key>` as 200 `private, no-store`
with bytes identical to the file, 401 without a token, 404 on the public image route. One
`slip:livechecknew` row (24 B, key not 32 hex) is reported and left; production has the same row,
so it is not something this script introduced.

Why the files go up by `scp` instead of running the script on the server: the Plesk chroot has no
`node` on PATH, and the app reads whatever `NK_MEDIA_DIR` names — so the extractor runs where
Node exists and only bytes travel.

3. Set `NK_MEDIA_DIR=/httpdocs/storage/media` in the panel, **Restart App**, then load a product
   page and an image URL directly:
   ```bash
   curl -s -o /dev/null -w '%{http_code} %{content_type} %{size_download}\n' \
     https://nongkatistore.com/api/v1/images/<key>-png
   ```
   `200 image/png` with the file's size. The route reads disk first and only falls back to a
   legacy row, so nothing breaks if a row is missed.

### Step 8 — leave it soaking

Supabase stays untouched and paused only after the soak (§5). Do not delete it.

---

## 4. Rollback

Two cases, because the state left behind differs.

**Rollback A — any checkpoint before Step 6 fails (production never moved)**

1. Delete the partially-filled `nong_kati` database (Plesk → Databases → the DB → Delete), or
   leave it and re-run from Step 2; the ETL empties every table it writes before copying, so a
   retry is safe (with the app stopped — see Step 3).
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

**The dump restore was executed on 2026-11-15**, so this is a path that has run at least once:

```bash
node scripts/verify-supabase-backup.mjs                                     # newest backup
node scripts/verify-supabase-backup.mjs --dump=backups/db-full-2026-11-14T20-36-47.dump --keep
```

It restores the artifact into a throwaway `postgres:17-alpine` container and recomputes the
per-table row count and ordered row hash the backup recorded. Result on the newest artifact:
`✔ restored copy matches the source on every populated table (31 tables, 2857 rows)`, exit 0,
receipt `backups/db-full-2026-11-14T20-36-47.verify.json`. The three `pg_restore` errors are
`supabase_vault is not available` / `does not exist` and the empty `vault.secrets` table — a
Supabase-platform extension, not shop data. The container is deleted afterwards unless `--keep`.

To restore into a real Supabase project (only if the platform itself lost the data): create an
empty database there, `pg_restore --no-owner --no-privileges` the same dump into it, then run the
script again against it — a second run compares the restored tables to the recorded fingerprints,
which is what proves the target; `pg_restore`'s exit code alone does not.

**What "rolled back correctly" looks like** (check these in order, 5 minutes):

1. `curl -s https://nongkatistore.com/api/v1/health` → `200`, `"status":"healthy"`,
   `"database":"ok"`, and an `uptime` that reset with the restart.
2. `curl -s https://nongkatistore.com/api/v1/version` → the build from before the switch (no
   rebuild was needed; the app was always database-agnostic).
3. `GET /api/v1/products` returns the catalogue with the pre-switch product count.
4. An admin login still works and one product edit persists after a reload (the write path is
   back on Postgres, not silently still on MariaDB — check the order row you just edited in the
   Supabase table editor).
5. `node scripts/postswitch-check.mjs --base=https://nongkatistore.com --max-uptime=600` with
   `TARGET_DATABASE_URL` pointing at **Supabase** → 22/22. Its `database` and `catalogue` checks
   are what catch a half-rollback (URLs back, app still holding MariaDB connections).
6. Writes made while on MariaDB are enumerated (`Order`, `PaymentAttempt`, `Refund`, `GiftCode`
   by `createdAt` after the switch time) and either replayed into Supabase or refunded to the
   customers — the reconciliation described above.

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
| Images are not touching the database | `SELECT COUNT(*) FROM SiteSetting WHERE key LIKE 'image:%'` = 0, and `storage/media` holds the files | egress per page view drops by up to 34 MB of row reads |
| Nightly dumps exist | `ls -lh /var/backups/nong-kati` | a new dump per day, retention holding at 14 |

Then, and only then:

1. **Pause** the Supabase project (Project Settings → General → Pause project). Pausing stops
   egress and is what actually answers the quota mail; it is reversible.
2. Keep `db-backups/db-full-2026-11-14T21-12-33.dump` (+ its `.verify.json`) after the pause —
   it is the only way back to the Postgres data if a data problem surfaces.
3. Delete the project only after the pause has held for a further week.

---

## 6. Phase 5 — the six steps, in order

Provisioning only: it creates an *empty* database, touches no running app, and leaves Supabase
serving. Values and rationale are in §1–2.

1. **Create it.** Plesk → Websites & Domains → `nongkatistore.com` → Databases → Add Database:
   name `nong_kati`, server `localhost:3306`, user `nk_app`, password **alphanumeric 16–24
   chars**. Store that password in your password manager — it is not recoverable from the panel
   page afterwards, and it is needed in four places later.
2. **Confirm the charset.** phpMyAdmin → SQL:
   `SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA
   WHERE SCHEMA_NAME='nong_kati';` → `utf8mb4`. If not:
   `ALTER DATABASE \`nong_kati\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
3. **Narrow the grants** (phpMyAdmin → SQL, or SSH `mysql -u root -p`):
   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES,
         CREATE TEMPORARY TABLES, LOCK TABLES
     ON `nong_kati`.* TO 'nk_app'@'localhost';
   ```
4. **Env secrets: audit now, write the database URLs only at cutover.** The full split of what is
   safe to touch today versus what must wait is **§6.1** — read it before opening the Node.js
   panel, because adding `DATABASE_URL` early points the live shop at an empty database.
5. **Verify from the server** (SSH: `ssh nongka@thsv93.hostatom.com`; password is typed
   interactively so it never enters argv):
   ```bash
   mysql -h localhost -u nk_app -p nong_kati \
     -e "SELECT DATABASE() db, CURRENT_USER() usr, @@character_set_database charset; SHOW GRANTS;"
   ```
   Green: `db=nong_kati`, `usr=nk_app@localhost`, `charset=utf8mb4`, and the grants listed are
   only step 3's plus the unavoidable `GRANT USAGE ON *.*` (a no-op that MariaDB always shows,
   along with a credential hash — not a secret you need to hide). If `mysql` is not on PATH in
   the chroot, do the same checks in phpMyAdmin's SQL tab.
6. **Verify through the exact string the app will use** — from this checkout, with the tunnel
   open (`ssh -N -L 3307:localhost:3306 nongka@thsv93.hostatom.com`):
   ```bash
   DATABASE_URL="mysql://nk_app:DBPASS@127.0.0.1:3307/nong_kati" \
   DATABASE_DIRECT_URL="mysql://nk_app:DBPASS@127.0.0.1:3307/nong_kati" \
     npx prisma migrate status
   ```
   Green (verified wording): `Datasource "db": MySQL database "nong_kati" at "127.0.0.1:3307"`,
   `1 migration found in prisma/migrations`, `Following migration have not yet been applied:` /
   `20261115000000_baseline`. That last part is correct at this stage; it proves credentials,
   dialect and the tunnel without creating a single table.

If step 5 succeeds and step 6 says "not yet applied", Phase 5 is done: nothing else about the
running shop has changed.

### 6.1 Env secrets — safe now vs at cutover

#### The mechanism, checked in this checkout

`server-bootstrap.js` → `planInjection(secrets, env)` copies a secret **only when
`env[key] === undefined`**, and `server.js` applies that plan in the boot path before Next.js
starts. So:

> **A key the Plesk panel defines is never overwritten by Infisical. Panel wins; Infisical fills
the gaps.**

Consequence: a panel `DATABASE_URL` alone changes which database the next process boot uses.
Nothing else has to move with it — which is exactly why writing it early is dangerous and why
deleting it is a complete rollback.

#### Non-database variables the app reads

Derived by reading `src/**`, `server.js` and `server-bootstrap.js` for every `process.env`
reference (both literal keys and the ones resolved through constants, e.g. `NK_RESEND_*` and
`NK_GIFT_CODE_ENCRYPTION_KEY`), so this is the real set, not the `.env.example` wish list.

**Status legend:** **I** = recorded in `docs/hostatom-live.md` as an Infisical-prod secret ·
**P** = recorded as a Plesk panel variable · **A** = **absent from Infisical prod, audited
2026-11-15** · **?** = not recorded anywhere in this repo before that audit (see the inventory
below). The audit read the project's key list with values hidden — no secret value was revealed
or copied.

| Key | Read by | Format / what happens if absent | Status |
| --- | --- | --- | --- |
| `INFISICAL_CLIENT_ID` | `server-bootstrap.js` | machine-identity client id; absent ⇒ the Infisical loader is skipped entirely | **P** |
| `INFISICAL_CLIENT_SECRET` | `server-bootstrap.js` | universal-auth secret; wrong/expired ⇒ boot **exits** (fail-closed) | **P** |
| `INFISICAL_PROJECT_ID` | `server-bootstrap.js` | project UUID | **P** |
| `INFISICAL_ENV` | `server-bootstrap.js` | env slug, `prod` | **P** |
| `NEXT_PUBLIC_SITE_URL` | build-time + `src/lib/fulfilment.ts` | `https://nongkatistore.com`, no trailing slash; production refuses to fulfil without it | **I** |
| `NK_JWT_SECRET` | `src/lib/jwt.ts` and slip tokens | ≥32 random chars; throws when shorter | **I** |
| `NK_GIFT_CODE_ENCRYPTION_KEY` | `src/lib/crypto/giftCode.ts` | 64 hex; **copy, never regenerate** (§2) | **I** |
| `NK_GIFT_CODE_ENCRYPTION_KEY_V2` | `giftCode.ts` | 64 hex, or absent (falls back to the key above) | **I** |
| `NK_GIFT_CODE_ENCRYPTION_KEY_V1` | nothing — this build never reads it | the historical duplicate; harmless, ignorable | **I** |
| `NK_GIFT_CODE_ACTIVE_KEY_VERSION` | `giftCode.ts` | `1` or `2`, unset ⇒ 1; leave unset | **A** (leave unset) |
| `NK_SLIP2GO_SECRET` | `src/lib/payment/slip2go.ts` | bearer secret; absent ⇒ `isSlip2GoConfigured()` is false and the SlipOK path is used instead — with neither configured, slips are checked by hand | **I** |
| `NK_SLIP2GO_BASE` | `slip2go.ts` | unset ⇒ `https://connect.slip2go.com` | **A** (leave unset) |
| `NK_SLIP_TOKEN_SECRET` | slip status tokens | unset ⇒ reuses `NK_JWT_SECRET` | **A** (optional) |
| `NK_MEDIA_DIR` | `src/lib/imageStore.ts` (uploads + `GET /api/v1/images/[key]`) | absolute path for uploaded images; unset ⇒ `<cwd>/storage/media`. Set it to `/httpdocs/storage/media` so a deploy (which rewrites the docroot) cannot shadow it | **new** — add at cutover |
| `NK_SLIP_DIR` | `src/lib/slipStore.ts` (payment-slip evidence) | where slip files live; unset ⇒ `<NK_MEDIA_DIR>/private/slips`, which is what you want. Only set it to move slips to a different disk — the directory must not be web-served | unchanged (optional) |
| `NK_RESEND_API_KEY` | `src/lib/email/config.ts` | `re_…`; absent ⇒ outbox rows stay failed, no customer email | **I** ✓ prod + dev |
| `NK_RESEND_FROM_EMAIL` | `src/lib/email/config.ts` | a verified sender on the Resend domain | **I** ✓ prod + dev |
| `NK_RESEND_API_URL` | `src/lib/email/config.ts` | override only; leave unset | **A** (correct — unset in prod) |
| `NK_CRON_SECRET` | internal sweeps (order expiry, outbox drain) | random hex header value; absent ⇒ those routes 401 (fail-closed), orders never auto-expire | **A** |
| `NK_INTERNAL_TOKEN` | `/api/v1/internal/*` | random hex; absent ⇒ internal routes refuse non-admin callers | **A** |
| `NK_PAYMENT_MOCK` | `src/lib/payment/omise.ts` | mock only when `NODE_ENV !== production`; **must not be `true` in prod** | **I** (leave false) |
| `NK_OMISE_SECRET_KEY` | card gateway path | unused on the manual-transfer checkout | **A** (optional) |
| `NK_OMISE_WEBHOOK_SECRET` | card webhook | unused today | **A** (optional) |
| `NK_OMISE_API_BASE` | Omise client base | unset ⇒ Omise default | **A** (optional) |
| `NK_TICKET_SECRET` | `src/api/supportTickets.ts` | HMAC secret; falls back to `NK_ORDER_SECRET`, `NEXTAUTH_SECRET`, then a hardcoded dev string | **A** |
| `NK_ORDER_SECRET` | same fallback chain | as above | **A** (optional) |
| `NEXTAUTH_SECRET` | same fallback chain | as above | **A** (optional) |
| `UPSTASH_REDIS_REST_URL` | `src/lib/rateLimit.ts` | shared limiter; absent ⇒ in-process limiter | **A** |
| `UPSTASH_REDIS_REST_TOKEN` | `src/lib/rateLimit.ts` | paired with the URL | **A** |
| `NK_RATE_LIMIT_STRICT` | `rateLimit.ts` | `true` only once Upstash is configured; strict mode fails closed on Redis errors | **A** (leave unset) |
| `NK_CSP_REPORT_ONLY` | CSP middleware | unset ⇒ enforce with nonce; never `true` in prod | **A** (leave unset) |
| `NK_CSP_UNSAFE_INLINE` | CSP middleware | relaxation hatch; leave unset in prod | **A** (leave unset) |
| `NK_GOOGLE_CLIENT_ID` / `NK_GOOGLE_CLIENT_SECRET` | `src/lib/oauth.ts` | customer Google login; absent ⇒ button unusable | **A** (optional) |
| `NK_FB_APP_ID` / `NK_FB_APP_SECRET` | `src/lib/oauthFacebook.ts` | Facebook login | **A** (optional) |
| `LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET` (and `LINE_CLIENT_ID` / `LINE_CLIENT_SECRET`) | `src/lib/oauth.ts` | LINE login | **A** (optional) |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `oauth*.ts` legacy fallbacks | only if the `NK_*` names are unset | **A** (optional) |
| `NK_TWILIO_ACCOUNT_SID` / `NK_TWILIO_AUTH_TOKEN` / `NK_TWILIO_FROM_NUMBER` | `src/lib/sms/otpSms.ts` | SMS OTP; absent ⇒ SMS codes are not sent | **A** (optional) |
| `NK_OTP_DEV_MODE` | `otpSms.ts` | `1` logs the OTP instead of sending — **must not be `1` in prod** | **A** (leave unset) |
| `NK_DISCORD_WEBHOOK_URL` | alerting helpers | webhook URL | **A** (optional) |
| `NEXT_PUBLIC_API_URL` | client API base override | unset ⇒ same-origin | **A** (leave unset) |
| `SLIP_VERIFY_BASE_OVERRIDE` | slip verification | **test hook — must be unset in production** | **A** (must be unset) |
| `NK_SLIP_OK_KEY` / `NK_SLIP_OK_BRANCH` | SlipOK variant | not used by the Slip2Go path | documented as local-only |
| `GIT_SHA` | `/api/v1/version`, build-info | `scripts/stamp-git-sha.mjs` writes `.next/GIT_SHA` during `npm run build`; the env var is only the fallback | **I** |
| `GIT_REF` / `VERCEL_GIT_COMMIT_REF` / `VERCEL_GIT_COMMIT_SHA` | version/build-info | release identity only | **I** / **P** |
| `NODE_ENV` / `PORT` | Next.js + Passenger | supplied by the runtime; do not set in the panel | runtime |
| `NK_SENTRY_DSN` | nothing in `src/` | appears in `.env.example` only; not read by this build | not used |

#### Infisical prod — audited 2026-11-15

The **?** rows are now answered. The project's own key list (`nong-kati`,
`80151198-f2df-4917-a8b4-bbfb315cb0c2`, environment **Production**, values left hidden) holds
exactly **13 keys**, and every one of them was already documented as **I**:

`DATABASE_DIRECT_URL`, `DATABASE_URL`, `GIT_REF`, `GIT_SHA`, `NEXT_PUBLIC_SITE_URL`,
`NK_GIFT_CODE_ENCRYPTION_KEY`, `NK_GIFT_CODE_ENCRYPTION_KEY_V1`, `NK_GIFT_CODE_ENCRYPTION_KEY_V2`,
`NK_JWT_SECRET`, `NK_PAYMENT_MOCK`, `NK_RESEND_API_KEY`, `NK_RESEND_FROM_EMAIL`,
`NK_SLIP2GO_SECRET`.

Every other row marked **A** is **absent from Infisical prod** — 25 rows that used to read **?**,
plus the optional integrations under them. The Development environment holds only the two
`NK_RESEND_*` keys, so it is not a second copy of production.

What that changes before the cutover:

- **`NK_CRON_SECRET` and `NK_INTERNAL_TOKEN` are not in Infisical.** They must come from the
  Plesk panel or the sweeps answer 401: unpaid orders never expire and the outbox never drains.
  `server.js` mirrors `NK_CRON_SECRET` into `tmp/cron-curl.conf` for the scheduler, but only from
  an env it actually received — mirroring a variable nobody supplies writes nothing. Confirm both
  in the panel; do not assume Infisical fills them.
- **The Upstash pair is absent**, so rate limiting stays in-process (per Passenger worker, not
  shared). That is the current behaviour, not a regression — but it is not a global limiter.
- **`NK_TICKET_SECRET` is absent** and falls back to `NK_ORDER_SECRET` → `NEXTAUTH_SECRET` → a
  hardcoded dev string, none of which exist in prod, so ticket links are signed with the fallback
  constant. Set a real value if support tickets matter.
- **`NK_PAYMENT_MOCK` is present** (as documented, **I**). Its *value* was deliberately not read;
  the code mocks only when `NODE_ENV !== production`, so a `true` here is inert in prod — worth
  one glance in the UI, not a cutover risk.
- **Nothing that must stay unset is set**: `NK_OTP_DEV_MODE`, `NK_CSP_REPORT_ONLY`,
  `NK_CSP_UNSAFE_INLINE`, `NK_RATE_LIMIT_STRICT`, `SLIP_VERIFY_BASE_OVERRIDE` and
  `NEXT_PUBLIC_API_URL` are absent, and `NK_RESEND_API_URL` is unset as required.
- **Optional integrations are genuinely not configured**: no Google/Facebook/LINE login, no
  Twilio SMS, no Omise keys, no Discord webhook. Their buttons and paths stay inert — expected,
  since the shop sells by manual transfer.

Add nothing with a *new* value on audit day: a corrected secret takes effect at the next
Passenger respawn, which can be minutes later and at random, so treat every value edit as a
mini-cutover of its own.

#### At cutover — the two database keys

This is §3 Step 6 spelled out. Do it only when the ordering chain below is satisfied.

**Ordering chain (do not reorder):**

```
1. `prisma migrate deploy` on the target          → 39 tables
2. ETL run + `--verify-only` shows 0 differences   → the data exists
3. panel gets the two mysql:// URLs                → the next boot reads MariaDB
4. Restart App                                     → new process, new URL
5. smoke check + PROCESSLIST confirmation          → traffic really is on MariaDB
```

Writing step 3 before step 2 is the one mistake this runbook exists to prevent.

**Where:** Plesk → `nongkatistore.com` → **Node.js** → **Custom environment variables** →
*Add variable* twice — this is the field that ends up in the process environment, which is all
`server.js` reads. Whether the panel's separate *Secrets* store also surfaces values as
environment variables is **not verified from this checkout**: use Custom environment variables,
and, if you prefer Secrets, prove it with the PROCESSLIST check below.

| Name | Value |
| --- | --- |
| `DATABASE_URL` | `mysql://nk_app:DBPASS@localhost:3306/nong_kati` |
| `DATABASE_DIRECT_URL` | `mysql://nk_app:DBPASS@localhost:3306/nong_kati` |

Both are required: `DATABASE_URL` is what `src/lib/db.ts` hands to Prisma, `DATABASE_DIRECT_URL`
is the `directUrl` the schema uses for migrations. `mysql://`, **no `?schema=`** (verified: Prisma
silently ignores it on MySQL, so a stale parameter hides instead of failing), no pooler params.

**What a Passenger restart does here, precisely.** `Restart App` re-execs `server.js`; it logs
into Infisical, injects only the keys the panel has not defined, then constructs `PrismaClient`
with the panel's URL. If the ETL did not run, the database has no tables (or the baseline was
never applied) and the failure is nasty in two ways:

- Prisma raises `P2021` (*table does not exist*) on the first query, so storefront pages, catalogue
  and admin all answer 500 — while `/api/v1/health` still reports **`database: ok`**, because it
  only runs `SELECT 1` and `SELECT 1` succeeds on an empty schema. Reproduced on a scratch empty
  database: `SELECT 1` returned a row while `prisma.product.findMany()` threw `P2021`.
- If the schema exists but the data does not, the same health check is green and the shop renders
  an *empty* storefront: no products, no categories, every login rejected (no users).

So the health endpoint is not your cutover gate — the gate is `/api/v1/products` returning the
catalogue and the check in §3 Step 5.

**Confirm the panel actually won (after the restart):**

```bash
curl -s https://nongkatistore.com/api/v1/products | head -c 200   # real catalogue, not []
curl -s https://nongkatistore.com/api/v1/health                  # database: ok, uptime low
```

and, on the server, the process list shows the app's own connections with the new user and db:

```sql
SELECT user, host, db, COUNT(*) FROM information_schema.PROCESSLIST
WHERE user = 'nk_app' GROUP BY user, host, db;
-- expect rows after you load a page; db = nong_kati, host = localhost
```

Rows with `db = nong_kati` are proof that the panel value is the one in force. No rows, while the
shop still serves, means the app never connected as `nk_app` — i.e. it is still on Infisical's
Supabase URL and the panel edit did not apply (wrong field, or no restart).

**Rollback of just the env change** (production is on MariaDB and you want it back on Supabase):

1. Node.js → Custom environment variables → **delete `DATABASE_URL`** → delete
   `DATABASE_DIRECT_URL`.
2. **Restart App**.
3. `curl -s https://nongkatistore.com/api/v1/health` → `database: ok`; reload
   `/api/v1/products` → catalogue; the PROCESSLIST query above now returns nothing for `nk_app`.

Deleting the rows restores Infisical's Supabase values exactly, because Infisical was never
edited. Anything written to MariaDB during the detour stays only in MariaDB — see §4 Rollback B
for the reconciliation list before any retry.

## 7. What the user must authorise

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
