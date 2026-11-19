# Database backup and restore (production MariaDB)

**Production has run MariaDB 10.11 (`nongka_nongkati_nongkatistore`) since 2026-11-15.** The live
path is the nightly `mariadb-dump` task below. Everything that mentions Supabase, `pg_dump` or
`psql` is the pre-cutover record — kept deliberately, because those artifacts are how the MariaDB
copy was made and what proves the rows survived the move. Companion runbook:
`docs/db-migration-hostatom-mariadb.md`.

## Current path — MariaDB (production)

Nightly, from a Plesk scheduled task on the host (`scripts/backup-mariadb.sh`):

```bash
mariadb-dump --single-transaction --hex-blob --routines --triggers \
  -h 127.0.0.1 -u "$DB_USER" -p"$DB_PASS" nongka_nongkati_nongkatistore | gzip > <dump>.sql.gz
# then: gzip -t (a truncated file must never be published), a .sha256 sidecar, and
# count/age pruning that never deletes the newest surviving dump.
```

Restore, into an **empty** schema (never over the live one without a fresh pre-restore dump):

```bash
gunzip -c <dump>.sql.gz | mariadb -h 127.0.0.1 -u <user> -p <db>
```

Verify the restore with counts rather than trust — `node scripts/db-report.mjs --url=mysql://…`
reports **39 tables with exact counts**; the cutover copy was validated this way (4 pruning runs
kept exactly 3 files and removed the oldest, the newest restored into an empty MariaDB with the
same per-table counts, and a wrong password exited 1 leaving no file behind).

## Restore drill — rehearse it, don't assume it

`ls -l` proves a file exists; it does not prove the file restores. `scripts/restore-drill.mjs`
loads the newest dump into a **scratch** database, diffs exact row counts against production, then
drops the scratch schema again:

```bash
node scripts/restore-drill.mjs \
  --dump=/var/backups/nong-kati/nong_kati-<stamp>.sql.gz \
  --url="mysql://user:pass@127.0.0.1:3306/nongka_nongkati_nongkatistore"
```

It refuses a scratch name equal to production and refuses a scratch database that already exists,
so it can never adopt — and then drop — a real one; it checks the `.sha256` sidecar when present;
and it writes `db-backups/restore-drill-<stamp>.verify.json`. Exit 0 means every table matched.
Run it after a schema change and before trusting the backup during an incident. It needs a
`mariadb`/`mysql` client on PATH and a user allowed to CREATE/DROP a database.

The nightly task runs in the vhost chroot, which has `mariadb-dump`/`gzip` but **no `node`** — that
is why the backup is a shell task and the *verification* is the Node script run over SSH or from
the panel's Node console. `mariadb-dump` output holds `GiftCode.codeEncrypted` ciphertext,
`nonce`, `keyVersion` and `codeHash` as stored; nothing is decrypted into a dump.

⚠️ **Product images are not in the database.** They are files under `NK_MEDIA_DIR`
(`/httpdocs/storage/media`), so a row-level restore brings back a catalogue whose images 404 —
Plesk's Backup Manager (files + database together) is what covers the media directory.

## Historical (Supabase era) — how the pre-cutover copy was taken

## Where the artifacts live (Supabase-era dumps, kept as the cutover source)

Outside both repositories, on this machine:

```
E:\งานนะจ๊ะ\2569\Nong-kati\db-backups\
```

`db-backups/` is ignored by the workspace `.gitignore` as well, so a stray `git add -A` cannot
pick up customer PII. The dumps under `backups/` **inside** the app repo are older and narrower
(see "Superseded artifacts") — do not restore from them.

| File | Size | sha256 |
| --- | --- | --- |
| `db-full-2026-11-14T21-12-33.dump` | 34,260,713 B (32.7 MB) | `4c08d972050403cdfb5b72e23e9e49a4444b1bfa0c544961cb0285745e27ea8e` |
| `db-full-2026-11-14T21-12-33.counts.json` | 6,928 B | — |
| `db-full-2026-11-14T21-12-33.manifest.json` | 2.3 KB | — |
| `db-full-2026-11-14T21-12-33.verify.json` | 813 B | — |

- **dump** — `pg_dump -Fc -Z6` of the whole database (custom format, all non-system schemas).
- **counts** — per-table row count plus a content fingerprint measured on the source at dump
  time, so the artifact can be judged later without the source.
- **manifest** — sizes, sha256, schema list, server version, and the connection target with the
  user and password redacted.
- **verify** — machine-written receipt of the restore rehearsal that passed.

Integrity check (re-run any time):

```bash
sha256sum "E:/งานนะจ๊ะ/2569/Nong-kati/db-backups/db-full-2026-11-14T21-12-33.dump"
# expect 4c08d972…ea8e and 34260713 bytes
```

Source: `aws-0-ap-southeast-1.pooler.supabase.com:5432`, database `postgres`, taken over the
direct endpoint (`pg_dump` cannot run through the pgbouncer pooler on `:6543`). Server was
PostgreSQL 17.12, dump made with `pg_dump (PostgreSQL) 17.12`. The source was only read.

## What it covers

- **All nine schemas**: `public`, `auth`, `extensions`, `graphql`, `graphql_public`, `pgbouncer`,
  `realtime`, `storage`, `vault`. Five hold tables and appear in `counts.json`; the other four
  are dumped for their objects only.
- **77 tables, 2857 rows**, of which **31 tables have data** — including the Prisma migration
  bookkeeping `public._prisma_migrations` (36 rows), `auth.schema_migrations` (82),
  `realtime.schema_migrations` (89), `storage.migrations` (74), and the business tables:
  `Order` 216, `OrderItem` 216, `AdminSession` 962, `AuditLog` 429, `GiftCode` 170,
  `ProductVariant` 88, `SiteSetting` 87, `StockMove` 62, `Customer` 54, `TopUpLog` 38,
  `Product` 31, `AdminBackupCode` 30, `Category` 29, `PaymentAttempt` 28, `CodeUploadBatch` 22,
  `AdminUser` 19, `AdminChallengeConsumed` 18, `ProductTag` 11, `WishlistItem` 7, `Refund` 7,
  `SupportTicket` 3, and the single-row tables (`Coupon`, `Promotion`, `Tag`, `MagicLinkToken`,
  `PasswordResetToken`). The full list with counts and hashes is in `counts.json`.
- **Gift-code material survives as it is stored**: `GiftCode.codeEncrypted` (AES-256-GCM
  ciphertext with the auth tag appended), `nonce`, `keyVersion` and the `codeHash` dedup index.
  Nothing is decrypted into the dump.
  ⚠️ **To read those codes back you need `NK_GIFT_CODE_ENCRYPTION_KEY`** — the 32-byte key lives
  in the Plesk environment / Infisical, is **not** in the backup, and without it the ciphertext
  is unreadable. `codeHash` is SHA-256 of the uppercased plaintext, so a candidate plaintext can
  be verified without the key.
- Schema objects: indexes, unique constraints, foreign keys, sequences and defaults.

## What it does NOT cover

- **Ownership and GRANTs** — dumped with `--no-owner --no-privileges`, so it restores without any
  Supabase role. Re-grant afterwards if you restore into a real Supabase project.
- **Supabase Storage binaries** — `storage.objects` rows are in the dump, the file bytes live in
  the S3-compatible bucket and are not. (That bucket is empty today: the shop keeps product
  images as base64 in `SiteSetting`, so no image is lost by this gap.)
- **Auth identity state beyond the rows** — `auth.users` rows restore, but external identity
  providers, refresh-token hashes and outbound email are not reproducible from a dump.
- **Supabase-only extensions** — `vault` wraps `supabase_vault`, which a stock Postgres image
  does not have. `vault.secrets` (0 rows on the source) is the only object not recreated.
- **Roles, publications, other projects** in the Supabase org; **the encryption/API keys**
  themselves (`NK_GIFT_CODE_ENCRYPTION_KEY`, `NK_JWT_SECRET`, Resend, Slip2Go) — those are
  secrets in Plesk/Infisical, deliberately never in a database dump.

## Restore — the commands actually executed on 2026-11-14

Every line below was run; the output is what the verifier printed.

```bash
# 1. scratch database (stock Postgres 17, no Supabase extensions)
docker run -d --name nk-restore -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=restore \
  -p 5544:5432 postgres:17-alpine

# 2. load the artifact
docker cp "E:/งานนะจ๊ะ/2569/Nong-kati/db-backups/db-full-2026-11-14T21-12-33.dump" \
  nk-restore:/tmp/backup.dump
docker exec nk-restore pg_restore -U postgres -d restore --no-owner --no-privileges /tmp/backup.dump

# 3. check what landed
docker exec -it nk-restore psql -U postgres -d restore -c '\dt public.*'

# 4. tear it down
docker rm -f nk-restore
```

The scripted form of the same thing (what was used, and is repeatable):

```bash
node scripts/archive-postgres/verify-supabase-backup.mjs \
  --dump="E:/งานนะจ๊ะ/2569/Nong-kati/db-backups/db-full-2026-11-14T21-12-33.dump"
```

It starts the scratch container, restores with `--no-owner --no-privileges`, recomputes every
table's fingerprint, compares against `counts.json`, writes `<dump>.verify.json` next to the
artifact, and deletes the container.

### Restore reconciliation result

| | |
| --- | --- |
| Source tables measured | 77 (46 empty) |
| Tables restored | 76 |
| Populated tables matched (count **and** content fingerprint) | **31 / 31**, 2857 rows compared |
| Empty tables restored empty | 45 |
| Tables missing from the restore | 1 — `vault.secrets` (0 rows on the source) |
| Tables in the restore absent from the source | 0 |
| `pg_restore` errors | 3, all the same cause: `extension "supabase_vault" is not available` → `vault.secrets does not exist` |

There is no unexplained difference. The one missing table holds no rows, and its absence is a
property of the stock Postgres image, not of the artifact.

## How "the restore is good" is proven

`counts.json` stores, per table:

```sql
SELECT count(*),
       coalesce(md5(string_agg(md5(x::text), '' ORDER BY md5(x::text))), '-')
FROM "schema"."table" x;
```

Ordering by row hash makes the value independent of physical row order (a restore does not
preserve heap order) and sensitive to every column of every row — a truncated string, a shifted
timestamp, a rounded decimal all change it. Restore, recompute, compare. The verifier fails with
a non-zero exit on any populated-table mismatch, a populated table that did not come back, or a
table that appears only in the restore.

## Install steps for the nightly task

`scripts/backup-mariadb.sh` install, the exact task command and the retention variables are in
`docs/db-migration-hostatom-mariadb.md` → Phase 8.

## Taking a new backup (historical: the Postgres source, before the cutover)

```bash
node scripts/archive-postgres/backup-supabase-db.mjs --out-dir="E:/งานนะจ๊ะ/2569/Nong-kati/db-backups"
node scripts/archive-postgres/verify-supabase-backup.mjs --dump="<the new dump>"
```

New date-stamped artifacts; nothing is overwritten. Read-only against the source. Take a fresh
pair immediately before Phase 6 of the runbook, and verify it — an unverified backup is a hope.

## Superseded artifacts

`backups/db-2026-11-14T19-43-04.dump` was produced with `pg_dump --schema public`: it contains
**no** `auth`, `storage`, `realtime` or `vault` schema, and predates the last writes before the
cutover. It is the only other dump in the app repo today — the September files kept there
(`shop-2026-09-28T20-23-33.json`, `customers-2026-09-28T20-13-27.json`) are JSON exports, not
dumps. Keep it if you like, but the `db-backups/db-full-*` artifacts are the ones to restore from:
`db-full-2026-11-14T21-12-33.dump` is 34,260,713 B, sha256 `4c08d972…ea8e` (verified on disk
2026-11-15), and `backups/db-full-2026-11-14T20-36-47.dump` is the 33 MB earlier run that
PLESK-CUTOVER.md §1 and §4 cite.
