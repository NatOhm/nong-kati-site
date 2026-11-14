# Database migration: Supabase Postgres → Hostatom MariaDB

**Status:** Phases 1–4 done on branch `db/mariadb-port` (15 Nov 2026), rehearsed against a
MariaDB 10.11 copy of production. Phases 5–8 (provision, cutover, verify, retire) still need a
window. **Owner:** shop maintainer. **Target window:** one working day plus a ~30 min cutover
at low traffic (recommend 02:00–03:00 ICT).

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
TARGET_DATABASE_URL="mysql://…/nong_kati" node scripts/precutover-check.mjs
```

It derives its fixtures from the target database (an active super_admin, a variant with stock
and codes, the store's receiving account), boots the real app on a free port with that database,
drives every path over HTTP, reads the rows back with Prisma, restores the inventory and deletes
its own test rows, and exits non-zero on any mismatch. Last run against the MariaDB copy:
**27/27 checks passed**, three consecutive runs left the copy's numbers identical
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
   bill: any page that reads those settings pulls megabytes from the database. Moving the
   images to files/R2 is a follow-up of its own.
2. **A table cannot satisfy its own foreign key** in one multi-row `INSERT` (MySQL has no
   deferrable constraints), so `Category` is written parents-first.
3. **`@unique Bytes` → `LONGBLOB` + `USING HASH`** unique index rejects distinct values;
   `@db.VarBinary(32)` fixes it.
4. **A `@db.*` annotation appended after a trailing `//` comment is inert.** 21 fields had it
   swallowed by their comment; the annotations were moved in front.
5. **Wait for a real query before migrating.** `mariadb-admin ping` succeeds while the
   container is still initialising, and `migrate deploy` then dies with `P1017`.

### Phase 5 — provision on Hostatom

**Blocked on the maintainer's go-ahead** — this creates a production database and writes a
secret, so it runs only inside the agreed window.

- [ ] Plesk → Databases → **Add Database**: name `nong_kati`, server `localhost:3306`, create a
      dedicated user with a generated password. Note the collation is `utf8mb4`.
- [ ] Store the URL as a **Secret** (Node.js → Environment → Secrets), not a plain variable:
      `mysql://USER:PASS@localhost:3306/nong_kati?connection_limit=5`.
- [ ] Update `DATABASE_DIRECT_URL` to the identical value (the schema still reads it), and
      delete the Supabase values only after Phase 6 passes.

### Phase 6 — cutover (one window, ~30 min)

1. [ ] Put the shop to sleep if the window is not already quiet (the app can stay up; the
       risk is writes during the export).
2. [ ] Freeze writes: stop the Node app from the Plesk Node.js panel.
3. [ ] Run the ETL against the real Supabase source and the new MariaDB target.
4. [ ] `npx prisma migrate status` on the server → up to date; `_prisma_migrations` has the
       baseline row.
5. [ ] Start the app; watch `/api/v1/health` → `database: ok`.
6. [ ] Verify (Phase 7) before touching anything else.

**Dry run executed 2026-11-14 21:43** on a pristine MariaDB 10.11 container, in exactly this
order — the sequence works end to end:

```bash
# fresh target
docker run -d --name nk-mariadb -e MARIADB_ROOT_PASSWORD=… -e MARIADB_DATABASE=… \
  -p 3307:3306 mariadb:10.11
DATABASE_URL="mysql://…" DATABASE_DIRECT_URL="mysql://…" npx prisma migrate deploy   # baseline applied
TARGET_DATABASE_URL="mysql://…" node scripts/migrate-supabase-to-mariadb.mjs         # 38 tables, 2576 rows, all counts match
DATABASE_URL="mysql://…" npm run build                                              # compiled
TARGET_DATABASE_URL="mysql://…" node scripts/precutover-check.mjs                     # 27/27
```

After the check removed its own rows the copy matched the ETL exactly: `Order` 216,
`GiftCode` 170 (56 available), `Customer` 54, `Coupon` 1, `PaymentAttempt` 28, `Product` 31, and
no `PRECHECK*` leftovers.

**Rollback:** restore the two Supabase env values and Restart App. Supabase is untouched
until Phase 8, so this is a two-minute revert.

### Phase 7 — verification

- [ ] `TARGET_DATABASE_URL=… node scripts/precutover-check.mjs` → 27/27 against the **production**
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

- [ ] Run clean for 7–14 days, then **pause** the Supabase project (pausing stops egress and
      is what actually answers the quota email). Delete only after that.
- [ ] Plesk Backup Manager: daily, databases included.
- [ ] Nightly `mysqldump` to a dated file with 14-day pruning (Plesk scheduled task; the
      chroot has shell tools but no Node — do not use the Node route).
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
