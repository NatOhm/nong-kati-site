# Database migration: Supabase Postgres → Hostatom MariaDB

**Status:** Phases 1–4 done on branch `db/mariadb-port` (15 Nov 2026), rehearsed against a
MariaDB 10.11 copy of production. Phases 5–8 (provision, cutover, verify, retire) still need a
window. **Owner:** shop maintainer. **Target window:** one working day plus a ~30 min cutover
at low traffic (recommend 02:00–03:00 ICT).

**Executing it:** [PLESK-CUTOVER.md](PLESK-CUTOVER.md) is the authoritative, copy-pasteable
runbook for Phases 5–8 (provisioning, the secret checklist incl. the gift-code key, the ordered
window, rollback, and the soak). This file stays the plan and the evidence.

**Why now:** Supabase emailed on 13 Nov 2026 that org *NatOhm's Org*
(`cdfcvazyoltgqnprnqoy`) exceeded its free-plan quota — egress is over the 5 GB allowance
(the mail names 5.5 GB). Usage continues as a one-time grace, but the **Fair Use Policy
applies from 14 Dec 2026**. Every page view runs Prisma queries against that remote
database, so moving the DB onto the same host removes the meter entirely and also removes
the ~200 ms remote round trip from every query.

---

## 1. Verified starting state

Checked on 14 Nov 2026, so a later run does not have to re-derive it.

| Fact | How it was verified |
| --- | --- |
| Production DB is **Postgres on Supabase** | `prisma/schema.prisma` is `provider = "postgresql"`; a `mysql://` URL would make Prisma fail every query, and the shop serves traffic. `docs/hostatom-live.md` lists `DATABASE_URL` / `DATABASE_DIRECT_URL` as Supabase pooler/direct strings. |
| Hostatom offers **MariaDB 10.11.18 only** | Plesk → `nongkatistore.com` → Databases → Add Database shows `localhost:3306 (default for MariaDB, v10.11.18)` and no server selector. There is no PostgreSQL option on this server. |
| **No databases exist yet** on the subscription | Same page: *"Looks like there's nothing here"*. Nothing is provisioned. |
| `DATABASE_URL` is a Plesk **Secret** (write-only) | Node.js → Environment → Secrets. Nobody can read it back, including an agent; rotation writes a new value. |
| App runs Node.js 20.20 under Passenger | Plesk → Node.js panel, subscription 1036, product 74879, panel `thsv93.hostatom.com:8443`. |
| Deploy runs `npx prisma migrate deploy` on the server | `deploy-hostatom.sh` line ~164. A migration-history mismatch fails deploys, so the history table matters. |

## 2. Scope measured from the schema

38 models · **217 `String` fields** · 25 single-column `@unique` · 7 `@@unique` blocks ·
76 `@@index` blocks · 5 `Json` fields · **0 enums** · 35 Prisma migrations ·
no Postgres extensions · `store` schema via `?schema=store`.

The migration is mostly mechanical; the risk is concentrated in migration history, ETL
fidelity, and the Postgres-only gates described in Phase 2.

## 3. What changes in the code

1. `prisma/schema.prisma`: `provider = "mysql"`. Keep `directUrl` and point both env names at
   the same MariaDB URL (the deploy script and Plesk env then need no rename).
2. Add `@db.VarChar(191)` to every **indexed** String column (the 25 `@unique` fields, the
   members of the 7 composite uniques, and every field named by an `@@index` or by a relation's
   `fields: [...]`). MariaDB cannot index a bare `TEXT`. Measured on this schema: 123 fields.
   The other 94 String columns become `@db.LongText` — **not** plain `TEXT`, because
   `SiteSetting.value` holds base64 images up to 2.6 MB and `TEXT` stops at 64 KB.
3. `DateTime` → default MariaDB `datetime(3)`; add `@db.DateTime(3)` where millisecond
   precision is asserted by tests.
4. `Json` fields map to `LONGTEXT` — no schema annotation needed, but any test that assumes
   `jsonb` semantics needs a look.
5. Drop the `?schema=store` parameter: on MariaDB the database *is* the schema.
6. Create the DB with `utf8mb4` / `utf8mb4_unicode_ci` so Thai text sorts and compares as it
   does today.
7. `GiftCode.codeHash` (`Bytes @unique`) becomes `@db.VarBinary(32)`. Prisma's default
   `LONGBLOB` produces `UNIQUE KEY ... USING HASH`, which MariaDB accepts but then rejects
   *distinct* 32-byte hashes with a phantom duplicate-key error. Verified: all 170 hashes are
   exactly 32 bytes.

## 4. Phases

**Backup first:** `docs/db-backup-restore.md` records the full-database backup artifacts
(`backups/db-full-*.dump` + counts + manifest + verify receipt), what they do and do not cover,
and the exact restore commands. Take a fresh one immediately before Phase 6.

### Phase 0 — preflight (no production contact)

- [x] Branch: `db/mariadb-port`, created from `6955e9b`.
- [x] Live `BUILD_ID` recorded: `ZOptAHxrWCPUpaPYJc2L0`, git `c2c8dd3`.
- [x] Nothing else in the Supabase org is in use: the project holds 78 tables — our 38 models
      plus 40 Supabase-internal ones (`auth.*`, `storage.*`, `realtime.*`). Every internal
      table with data is bookkeeping only (`_prisma_migrations` 36, `migrations` 9,
      `schema_migrations` 13); no auth users, storage objects, or realtime rows.

### Phase 1 — schema port

- [x] Provider `mysql`; 123 indexed String fields → `@db.VarChar(191)`, 94 → `@db.LongText`,
      `GiftCode.codeHash` → `@db.VarBinary(32)`.
- [x] Old history moved to `prisma/migrations-archive-postgres/` (34 dirs, kept as evidence
      for the security regression test) and exactly one baseline generated:
      ```bash
      npx prisma migrate diff --from-empty \
        --to-schema-datamodel prisma/schema.prisma --script \
        > prisma/migrations/00000000000000_baseline/migration.sql
      ```
- [x] `npx prisma generate`, then `npx tsc --noEmit`, `npm run lint`, `npm test` — 0 / 0 /
      1125 passed + 5 skipped. `npx prisma migrate deploy` on a clean MariaDB 10.11 applies the
      baseline and `migrate status` reports up to date.

**Done when:** gates green on the branch. No production resource touched.

### Phase 2 — retire the Postgres-only surfaces

- [x] `src/app/api/v1/internal/build-info/route.ts`: `pg_tables` / `rowsecurity` probe and the
      `rlsEnabled` / `rlsMissing` fields removed; the migration-version probe stays.
- [x] `src/app/api/v1/internal/ops-health/route.ts`: `COUNT(*)::bigint` → `COUNT(*)`.
- [x] `scripts/verify-rls.cjs` deleted along with its tests;
      `docs/rls-promotion-tables.md` carries a "retired 2026-11-15" note instead of vanishing.
- [x] The RLS drift test removed with the feature (not left skipping).
- [x] `mode: 'insensitive'` removed in 3 files (15 occurrences) — Postgres-only; MariaDB's
      `utf8mb4_unicode_ci` collation already compares case-insensitively.

**Done when:** `grep -rn "pg_tables\|rowsecurity\|::bigint" src scripts tests` is empty and
the gates are green.

### Phase 3 — ETL (source: Supabase, target: local MariaDB)

Never `pg_dump`: it produces Postgres SQL. Write `scripts/migrate-supabase-to-mariadb.mjs`:

- [x] `scripts/migrate-supabase-to-mariadb.mjs` reads every model through `json_agg` in a
      throwaway `postgres:17-alpine` container (no local psql on this machine) and writes with
      the MySQL Prisma client to `TARGET_DATABASE_URL`.
- [x] Inserts follow the schema's model order with an FK retry loop; self-referencing tables
      (`Category.parentId`) fall back to parent-first row-by-row passes.
- [x] Decimals go through as strings, `Bytes` (`\\x…` hex in JSON) as `Buffer`, `DateTime` as
      UTC `Date`, `@map` column names remapped, `PromotionProduct` included.
- [x] Reconcile: per-table row counts equal on both sides, plus `--verify-only` for a re-check.
      Result: **38 models, 2576 rows, every count matches**.

**Done when:** reconciliation prints zero differences.

### Phase 4 — rehearsal

- [x] Container:
      ```bash
      docker run --rm -d --name nk-mariadb -e MARIADB_ROOT_PASSWORD=ci \
        -e MARIADB_DATABASE=ci -p 3307:3306 mariadb:10.11
      ```
- [x] `DATABASE_URL=mysql://root:ci@127.0.0.1:3307/ci npx prisma migrate deploy` applied the
      baseline; `migrate status` reports up to date.
- [x] ETL run, then `npm test` (1125 passed + 5 skipped) and `next build` compiled against the
      MariaDB copy.
- [x] Local build served from the MariaDB copy: `/` 200 (172 KB of real shop HTML),
      `/api/v1/products` 200 with Thai catalogue data, `/api/v1/admin/orders` 401 signed out.
- [x] Gift-code path proven end-to-end: 5 rows decrypted with
      `NK_GIFT_CODE_ENCRYPTION_KEY` and each plaintext's SHA-256 matched its stored
      `codeHash`, and the 2.68 MB image setting round-tripped intact.
- [x] Write paths driven for real (not unit stubs) against the MariaDB copy through the
      running app — cart, order, fulfilment, refund/void, admin product save, gift-code
      upload + decrypt, plus coupon redemption, wallet payment and slip verification. This is
      now a committed, repeatable gate: `scripts/precutover-check.mjs` (see below).

**Done when:** the same numbers pass as on Postgres, and the code decrypts.

### Pre-cutover check (`scripts/precutover-check.mjs`)

```bash
TARGET_DATABASE_URL="mysql://…/nongka_nongkati_nongkatistore" node scripts/precutover-check.mjs
```

It derives its fixtures from the target database (an active super_admin, a variant with stock
and codes, the store's receiving account), boots the real app on a free port with that database,
drives every path over HTTP, reads the rows back with Prisma, restores the inventory and deletes
its own test rows, and exits non-zero on any mismatch. Last run against the MariaDB copy:
**32/32 checks passed** (the image-store path was added last: upload → disk → served bytes → no
row → orphan-file GC), three consecutive runs left the copy's numbers identical
(49 available codes / 167 total / 220 orders).

It refuses to run against a Supabase host, because it writes real rows.

Individual paths, read back from the database rather than trusted from the response:

| Path | Evidence |
| --- | --- |
| Add to cart (product page, real browser) | `nk_cart:v2` localStorage = 1 × `cmvwbytfn00023h9ll4wu2gys` @฿129.90, label “เมลลูกค้า”; cart is client-side by design — `Cart`/`CartItem` tables have no writer |
| Place order from that cart (`POST /api/v1/orders`) | `NK-2026-000216` `pending_payment`, `totalAmountThb` = `129.90` (cart 129.9), item name stored in Thai, `createdAt …28.306` with milliseconds |
| Order void (`POST /api/v1/admin/orders/:id/refund`) | order `refunded`; `Refund.amountThb` `129.90`, `codesVoidedCount` 1; the delivered `GiftCode` row `voided` with `voidedAt` + reason; audit `refund_issued` written |
| Admin product save (`PUT /api/v1/admin/products/:id`) | name and description persisted; variant price `129.9 → "129.90"` (Decimal(10,2)); `updatedAt` moved; Thai + emoji + `ẞ` round-trip byte-identically |
| Gift-code upload + decrypt (`POST /api/v1/admin/stock/bulk`, `GET …/codes/:id/reveal`) | 2 codes written (`ciphertext` 40–43 B, `nonce` 12 B, `hash` 32 B in `VARBINARY(32)`), `StockMove` restock +2 → stock 6, reveal returned the exact plaintext that was pasted, reveal audited |
| Coupon redemption (admin coupon → order → confirm) | discount ฿116.91 on a ฿1,299.00 line, `total = subtotal − discount` exact, `CouponRedemption` row at confirmation, `coupon.usageCount` 1 |
| Wallet payment (`POST /orders/:id/pay-wallet`) | balance ฿389.70 → ฿272.79 (spent ฿116.91, Decimal exact), `TopUpLog` spend row −116.91 `completed`, order completed, code delivered |
| Slip verification (`POST /payments/slip-verify`, Slip2Go stubbed at the network edge) | order completed, 2 codes delivered, `PaymentAttempt.slipVerifiedRef` recorded; receiver policy, amount check and fulfilment all ran as real code |

Also proven on the same run: fulfilment (`verify-payment`) delivered codes inside one
serialisable transaction and stamped `completedAt`; an image upload of 1.47 MB stored a
1,961,642-char `SiteSetting.value` and served the identical bytes back — the case that forced
`LONGTEXT` over `TEXT`.

No provider-specific defect surfaced: `Decimal`, `DateTime(3)`, `Bytes`/`VARBINARY(32)`, Thai
`utf8mb4` text and the 2.6 MB `LONGTEXT` blob all behaved. The only corruption in this session
was in the rehearsal harness, not the app: reading rows through the `mariadb` client without
`--default-character-set=utf8mb4` returns Thai as `?`, and the harness then wrote that back —
so the helper now pins the charset.

### Phase 4 findings (MariaDB traps worth remembering)

1. **`TEXT` is 64 KB.** 94 String columns needed `LONGTEXT`; `SiteSetting.value` holds 31
   base64 images, the largest 2.68 MB. This is also the likely cause of the Supabase egress
   bill: any page that reads those settings pulls megabytes from the database. **Fixed** before the
   cutover: uploads write files (`src/lib/imageStore.ts`, `NK_MEDIA_DIR`) and
   `scripts/extract-images-to-files.mjs` moved the existing rows — 31 rows / 34.4 MB out of a
   46.2 MB `SiteSetting` table, leaving 10.1 MB (all payment slips). See
   [PLESK-CUTOVER.md §3 Step 7b](PLESK-CUTOVER.md).
2. **A table cannot satisfy its own foreign key** in one multi-row `INSERT` (MySQL has no
   deferrable constraints), so `Category` is written parents-first.
3. **`@unique Bytes` → `LONGBLOB` + `USING HASH`** unique index rejects distinct values;
   `@db.VarBinary(32)` fixes it.
4. **A `@db.*` annotation appended after a trailing `//` comment is inert.** 21 fields had it
   swallowed by their comment; the annotations were moved in front.
5. **Wait for a real query before migrating.** `mariadb-admin ping` succeeds while the
   container is still initialising, and `migrate deploy` then dies with `P1017`.

### Phase 5 — provision on Hostatom

Exact steps, grants, password rules, connection-string shapes and where the values go:
**[PLESK-CUTOVER.md §1–2](PLESK-CUTOVER.md)**.

**Blocked on the maintainer's go-ahead** — this creates a production database and writes a
secret, so it runs only inside the agreed window.

- [ ] Create the database and user: clientarea → product 74879 → **Login to Plesk Control
      Panel** → **MySQL® Databases** → **Add Database**; type `nongkati_nongkatistore` beside the
      fixed `nongka_` prefix (result `nongka_nongkati_nongkatistore`), same name for the user,
      server `localhost:3306`, generated password, **“Allow remote access” unchecked** (local
      connections only → user `@'localhost'`). Confirm the collation is `utf8mb4`.
- [ ] Store the URL as a **Secret** (Node.js → Environment → Secrets), not a plain variable:
      `mysql://USER:PASS@localhost:3306/nongka_nongkati_nongkatistore?connection_limit=5`.
- [ ] Update `DATABASE_DIRECT_URL` to the identical value (the schema still reads it), and
      delete the Supabase values only after Phase 6 passes.

### Phase 6 — cutover (one window, ~30 min)

Rehearse the driver itself before the window, against the local MariaDB copy —
`bash scripts/rehearse-phase6.sh` runs the plan, a trimmed plan, the real 32-check gate and a
deliberate failure, and asserts from the logs that the steps still fire in order
(`--plan-only` does the two plan cases without a database).

**Trap the rehearsal found:** `prisma migrate deploy` against MariaDB **creates the database when it
does not exist** — it printed `MySQL database nk_p6_absent created at 127.0.0.1:3307` and carried
on. So a typo in `DATABASE_URL` does not fail the window; it silently provisions a *second*, empty
database that the ETL then fills, leaving the one Plesk created untouched and the app pointed at a
name nobody meant. Check the target name against `/smb/database/list` before the run, and treat a
first-time `created at …` line in the log as a stop signal.

1. [ ] Put the shop to sleep if the window is not already quiet (the app can stay up; the
       risk is writes during the export).
2. [ ] Freeze writes: stop the Node app from the Plesk Node.js panel.
3. [ ] Run the ETL against the real Supabase source and the new MariaDB target.
4. [ ] `npx prisma migrate status` on the server → up to date; `_prisma_migrations` has the
       baseline row.
5. [ ] Start the app; watch `/api/v1/health` → `database: ok`.
6. [ ] Verify (Phase 7) before touching anything else.

Steps 3–4 plus the image extraction, the build and the gate are one command — the driver runs
them in this order and stops at the first failure, with a log in `reports/`:

```bash
TARGET_DATABASE_URL="mysql://nongka_nongkati_nongkatistore:DBPASS@127.0.0.1:3307/nongka_nongkati_nongkatistore" \
  bash scripts/phase6-cutover.sh --yes
```

It refuses a non-`mysql://` target, a Supabase host, and a non-loopback target without `--yes`.
`--dry-run` prints the plan, `--with-backup` takes and verifies a fresh dump first, `--from=etl`
resumes after a fixed failure, and `--skip-images` leaves the base64 `image:` rows in place —
the run then covers exactly **migrate deploy → ETL → build → gate**. It never stops or starts the
app: step 2 stays manual.

**Dry run executed 2026-11-14 21:43** on a pristine MariaDB 10.11 container, in exactly this
order — the sequence works end to end:

```bash
# fresh target
docker run -d --name nk-mariadb -e MARIADB_ROOT_PASSWORD=… -e MARIADB_DATABASE=… \
  -p 3307:3306 mariadb:10.11
DATABASE_URL="mysql://…" DATABASE_DIRECT_URL="mysql://…" npx prisma migrate deploy   # baseline applied
TARGET_DATABASE_URL="mysql://…" node scripts/migrate-supabase-to-mariadb.mjs         # 38 tables, 2497 rows, all counts match
DATABASE_URL="mysql://…" npm run build                                              # compiled
TARGET_DATABASE_URL="mysql://…" node scripts/precutover-check.mjs                     # 32/32
TARGET_DATABASE_URL="mysql://…" node scripts/postswitch-check.mjs --base=http://127.0.0.1:3314  # 22/22, after the switch
```

After the checks removed their own rows the copy matched the ETL exactly: `Order` 216,
`GiftCode` 125 (13 available), `Customer` 54, `Coupon` 1, `PaymentAttempt` 28, `Product` 28, and
no `PRECHECK*`/`POSTSWITCH*` leftovers.

**Rollback:** restore the two Supabase env values and Restart App. Supabase is untouched
until Phase 8, so this is a two-minute revert.

### Phase 7 — verification

- [ ] `TARGET_DATABASE_URL=… node scripts/postswitch-check.mjs --base=https://nongkatistore.com
      --max-uptime=600` → 22/22. This is the one that proves the *running* process reads the new
      database (health, schema head, catalogue counts, admin login + cookie, order, code
      redemption, media); see the Plesk runbook Step 7a for what each named check means.
- [ ] `TARGET_DATABASE_URL=… node scripts/precutover-check.mjs` → 32/32 against the **production**
      MariaDB (this is the automated version of the bullets below; they stay as the human
      sanity pass on live traffic).
- [ ] `/api/v1/version` returns the expected `BUILD_ID`; `/api/v1/health` `database: ok`.
- [ ] `/`, `/search`, `/account/login`, `/api/v1/products` → 200; homepage renders the
      category grid and featured products (data really is there).
- [ ] One end-to-end order: pending → slip verification → completed, codes delivered to the
      customer page and email.
- [ ] One admin write: edit a product, save, reload, confirm persistence.
- [ ] One gift code decrypts in admin.
- [ ] Compare 5 spot rows (a recent order, a product, a coupon) between Supabase and MariaDB.

### Phase 8 — retire Supabase, then housekeeping

The soak checklist and the pause step are in **[PLESK-CUTOVER.md §5](PLESK-CUTOVER.md)**.

- [ ] Run clean for 7–14 days, then **pause** the Supabase project (pausing stops egress and
      is what actually answers the quota email). Delete only after that. Keep the
      `db-backups/db-full-2026-11-14T21-12-33.dump` artifact until the pause is confirmed —
      it is the only way back to the Postgres data.
- [ ] Plesk Backup Manager (Tools & Settings → Backup Manager → Scheduled Backup Settings):
      daily, **include databases**, keep 7–14 days, store on the subscription (or a remote
      destination if configured). This covers the whole vhost, not just MySQL.
- [ ] Nightly logical dump with `scripts/backup-mariadb.sh` (below).

#### Nightly MariaDB dump — install and schedule

The script is plain `sh` because Plesk's scheduled tasks run inside the vhost chroot, where
`tr` is missing and there is no `node`: no dependency on the app, the repo, or a Node runtime.

```bash
# 1. put the script on the server (anywhere readable by the subscription user)
mkdir -p /httpdocs/scripts
cp scripts/backup-mariadb.sh /httpdocs/scripts/ && chmod 750 /httpdocs/scripts/backup-mariadb.sh

# 2. backup directory + secret env file (0600 — holds the DB password)
mkdir -p /var/backups/nong-kati && chmod 700 /var/backups/nong-kati
cat > /var/backups/nong-kati/.env <<'EOF'
DATABASE_URL=mysql://DBUSER:DBPASS@localhost:3306/nongka_nongkati_nongkatistore
BACKUP_DIR=/var/backups/nong-kati
PREFIX=nongka_nongkati_nongkatistore
RETENTION_COUNT=14
RETENTION_DAYS=30
EOF
chmod 600 /var/backups/nong-kati/.env

# 3. one manual run to prove it before trusting the scheduler
BACKUP_ENV_FILE=/var/backups/nong-kati/.env /bin/sh /httpdocs/scripts/backup-mariadb.sh
```

Plesk → **Scheduled Tasks** → Add Task: **Daily, 03:15** (server time), run as the subscription
user, command:

```sh
BACKUP_ENV_FILE=/var/backups/nong-kati/.env /bin/sh /httpdocs/scripts/backup-mariadb.sh >> /var/backups/nong-kati/backup.log 2>&1
```

Why it is shaped this way:

- No password in the task command — the scheduler stores and echoes the command line, so the
  credentials live in the `0600` env file and `BACKUP_ENV_FILE` only names it.
- A dump is written to `.*.partial`, passes `gzip -t`, and only then is renamed; a failed run
  exits non-zero and leaves no file that looks restorable.
- `--single-transaction --hex-blob --routines --triggers`: a consistent snapshot while the shop
  keeps selling, and gift-code `VARBINARY` columns survive as bytes.
- Pruning keeps the newest `RETENTION_COUNT` dumps and drops anything older than
  `RETENTION_DAYS`, but never the newest surviving copy and never the one just written.

Monthly restore drill (5 minutes): unzip the newest dump into a scratch database and compare
counts; an untested backup is a hope.

```sh
mkdir /tmp/restore && gunzip -c /var/backups/nong-kati/<newest>.sql.gz | mysql -u root -p
mysql -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='nongka_nongkati_nongkatistore'"
mysql -N -e "SELECT COUNT(*) FROM nongka_nongkati_nongkatistore.\`Order\`; SELECT COUNT(*) FROM nongka_nongkati_nongkatistore.GiftCode"
```

**Verified on the MariaDB copy 2026-11-14** (`scripts/backup-mariadb.sh` run inside a
`mariadb:10.11` client against the `:3307` instance):

- 4 consecutive runs with `RETENTION_COUNT=3` → kept exactly 3, the oldest removed, the newest
  intact; each dump 33,805,995 B and a `.sha256` sidecar written.
- The newest dump restored into a **fresh empty** MariaDB: **39 tables**, and
  `Order` 216, `GiftCode` 170, `Customer` 54, `Coupon` 1, `PaymentAttempt` 28, `Product` 31 —
  identical to the source. Gift-code bytes survived exactly: 170 rows, 5440 B of `codeHash`
  and 13245 B of `codeEncrypted`, same ordered-hex MD5 on both sides.
- Age pruning: a dump backdated 30 days with `RETENTION_DAYS=7` was removed while the four
  recent dumps were kept.
- Failure path: a wrong password exits **1** and leaves **0** files behind (no partial dump).
- [ ] Docs: mark `docs/supabase-setup.md` and `docs/vercel-env-checklist.md` superseded; add
      the cutover row to `docs/hostatom-live.md` **and run `npm run patch-notes`** afterwards
      (P1 gate) plus a `note` on the Thai entry (D1 gate).
- [ ] `AGENTS.md`: one line recording that the DB is MariaDB on the hosting, and that RLS is
      gone with its gates.

## 5. Risks

| Risk | Mitigation |
| --- | --- |
| Migration history missing → next deploy fails on drift | `prisma migrate deploy` on the fresh DB *before* ETL, then `migrate status` |
| Silent truncation on indexed strings | `@db.VarChar(191)` only on indexed columns; everything else stays `TEXT` |
| Thai text sorting/collation differences | `utf8mb4_unicode_ci`, spot-check a category list order |
| Encrypted gift codes unreadable after the move | Decrypt one code in admin during rehearsal *and* after cutover |
| ETL drops a row | Row counts + money sums + code counts must match, else abort |
| Password visible in the environment page | Store the URL as a Plesk **Secret**, never a plain variable |
| Supabase quota bites mid-migration | Work happens against a local copy; only the final export touches Supabase |

## 6. Effort

Phase 1 2–3 h · Phase 2 1 h · Phase 3 2–3 h · Phase 4 2–4 h · Phase 5 1 h ·
Phase 6–7 1–2 h · Phase 8 1–2 h → **~2 working days**, one deploy-risk window.
