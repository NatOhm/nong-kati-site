# Database backup and restore (production Supabase)

How the live database is backed up, where the artifacts live, what they do and do not contain,
and the exact commands that were executed to prove a restore. Companion to
`docs/db-migration-hostatom-mariadb.md` (the cutover runbook that consumes these artifacts).

## Where the artifacts live

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
node scripts/verify-supabase-backup.mjs \
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

## Nightly backups once the shop is on MariaDB

From Phase 8 of the runbook onwards, `scripts/backup-mariadb.sh` runs nightly from a Plesk
scheduled task: `mariadb-dump --single-transaction --hex-blob … | gzip`, a `gzip -t` gate before
the file is published, a `.sha256` sidecar, and count/age pruning that never deletes the newest
surviving dump. Install steps, the exact task command and the retention variables are in
`docs/db-migration-hostatom-mariadb.md` → Phase 8.

Verified against the MariaDB copy: 4 runs with `RETENTION_COUNT=3` kept exactly 3 and removed
the oldest; the newest restored into an empty MariaDB with 39 tables and the same per-table
counts; a wrong password exited 1 and left no file behind.

⚠️ **Uploaded product images are no longer in the database.** They are files under
`NK_MEDIA_DIR` (`/httpdocs/storage/media` on the server), so a database dump alone will restore a
catalogue whose images 404. The nightly dump covers rows; Plesk's Backup Manager (files + database)
is what covers the media directory. Restore both together.

## Taking a new backup (the Postgres source, before the cutover)

```bash
node scripts/backup-supabase-db.mjs --out-dir="E:/งานนะจ๊ะ/2569/Nong-kati/db-backups"
node scripts/verify-supabase-backup.mjs --dump="<the new dump>"
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
