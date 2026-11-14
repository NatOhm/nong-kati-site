# Database migration: Supabase Postgres → Hostatom MariaDB

**Status:** planned, not started. **Owner:** shop maintainer. **Target window:** one working
day plus a ~30 min cutover at low traffic (recommend 02:00–03:00 ICT).

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
2. Add `@db.VarChar(191)` to every **indexed** String column (the 25 `@unique` fields and the
   members of the 7 composite uniques). MariaDB cannot index a bare `TEXT`.
   Keep the rest as `String` (`TEXT`) so nothing is truncated silently.
3. `DateTime` → default MariaDB `datetime(3)`; add `@db.DateTime(3)` where millisecond
   precision is asserted by tests.
4. `Json` fields map to `LONGTEXT` — no schema annotation needed, but any test that assumes
   `jsonb` semantics needs a look.
5. Drop the `?schema=store` parameter: on MariaDB the database *is* the schema.
6. Create the DB with `utf8mb4` / `utf8mb4_unicode_ci` so Thai text sorts and compares as it
   does today.

## 4. Phases

### Phase 0 — preflight (no production contact)

- [ ] Branch: `git switch -c db/mariadb-port`.
- [ ] Record current live `BUILD_ID` (`/api/v1/version`) in this doc.
- [ ] Confirm nothing else in the Supabase org is in use (Auth / Storage / Realtime) — a
      dashboard check, because `.env` alone can't prove it. `docs/supabase-setup.md`
      mentions Storage.

### Phase 1 — schema port

- [ ] Switch the provider and add the `@db.VarChar(191)` annotations.
- [ ] Delete the Postgres-only migrations from the *working tree* (`prisma/migrations/*`),
      keep the folder, and generate exactly one baseline:
      ```bash
      npx prisma migrate diff --from-empty \
        --to-schema-datamodel prisma/schema.prisma --script \
        > prisma/migrations/00000000000000_baseline/migration.sql
      ```
- [ ] `npx prisma generate`, then `npx tsc --noEmit`, `npm run lint`, `npm test`.

**Done when:** gates green on the branch. No production resource touched.

### Phase 2 — retire the Postgres-only surfaces

- [ ] `src/app/api/v1/internal/build-info/route.ts`: remove the `pg_tables` /
      `rowsecurity` probe and the `rlsEnabled` / `rlsMissing` fields it feeds (MariaDB has no
      RLS). Keep the migration-version probe — `_prisma_migrations` exists on MySQL too.
- [ ] `src/app/api/v1/internal/ops-health/route.ts`: `COUNT(*)::bigint` → `COUNT(*)`
      (the cast is Postgres syntax).
- [ ] `scripts/verify-rls.cjs` + `tests/` references: delete, and remove
      `docs/rls-promotion-tables.md`'s claim as the current policy (leave a short
      "retired on the MariaDB move" note instead of deleting the record).
- [ ] Any test asserting RLS/`pg_tables` behaviour must be removed with the feature, not left
      skipping.

**Done when:** `grep -rn "pg_tables\|rowsecurity\|::bigint" src scripts tests` is empty and
the gates are green.

### Phase 3 — ETL (source: Supabase, target: local MariaDB)

Never `pg_dump`: it produces Postgres SQL. Write `scripts/migrate-supabase-to-mariadb.mjs`:

- [ ] Read from `SOURCE_DATABASE_URL` (Supabase **direct** :5432 string, read-only use),
      write to `TARGET_DATABASE_URL` (local MariaDB).
- [ ] Insert in FK order (Category → Product → Variant → codes → Customer → Order →
      OrderItem → PaymentAttempt → ledger/audit/email tables). Cuid ids are strings — keep
      them verbatim; nothing depends on autoincrement.
- [ ] Decimals go through as strings (`toFixed(2)`), encrypted gift-code blobs as opaque
      text, `DateTime` as UTC `Date`.
- [ ] Reconcile: per-table row counts equal; `SUM(totalAmountThb)`, `SUM(walletBalanceThb)`
      and `COUNT(*)` of delivered codes equal on both sides. Any mismatch aborts.

**Done when:** reconciliation prints zero differences.

### Phase 4 — rehearsal

- [ ] Container:
      ```bash
      docker run --rm -d --name nk-mariadb -e MARIADB_ROOT_PASSWORD=ci \
        -e MARIADB_DATABASE=ci -p 3307:3306 mariadb:10.11
      ```
- [ ] `DATABASE_URL=mysql://root:ci@127.0.0.1:3307/ci npx prisma migrate deploy`
      (applies the baseline; `npx prisma migrate status` must then report "up to date").
- [ ] Run the ETL, then `npm test` (1131 tests) and `next build` against the MariaDB copy.
- [ ] Manual walk on the local build: homepage categories load, product page, add to cart,
      checkout reachable, **decrypt one gift code in admin** (proves the encrypted blobs and
      key still pair up), post a management save (write path), and place + void one order.

**Done when:** the same numbers pass as on Postgres, and the code decrypts.

### Phase 5 — provision on Hostatom

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

**Rollback:** restore the two Supabase env values and Restart App. Supabase is untouched
until Phase 8, so this is a two-minute revert.

### Phase 7 — verification

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
