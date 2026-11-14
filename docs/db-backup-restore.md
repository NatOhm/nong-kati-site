# Database backup and restore (production Supabase)

How the production database is backed up, where those artifacts live, and how to restore one.
Companion to `docs/db-migration-hostatom-mariadb.md` (which uses these artifacts as its safety
net before the MariaDB cutover).

**Important:** the earlier dumps (`backups/db-2026-11-14T19-43-04.dump` and the seeded ones)
were taken with `pg_dump --schema public`, so they do **not** contain `auth`, `storage`,
`realtime` or `vault`. The `db-full-*` artifacts described here supersede them.

## What exists

Taken 2026-11-14, all from the same `pg_dump` run, in `backups/` (git-ignored — it holds PII,
so it lives on disk and never in the repository):

| File | Size | What it is |
| --- | --- | --- |
| `backups/db-full-2026-11-14T20-36-47.dump` | 32.7 MB | Full logical backup, `pg_dump -Fc -Z6`, **every** non-system schema |
| `backups/db-full-2026-11-14T20-36-47.counts.json` | ~7 KB | Per-table row count + content fingerprint, measured on the source at dump time |
| `backups/db-full-2026-11-14T20-36-47.manifest.json` | ~2 KB | sha256, sizes, source target (credentials redacted), scope notes |
| `backups/db-full-2026-11-14T20-36-47.verify.json` | ~1 KB | Machine-written receipt of the restore rehearsal that passed |

Source: `aws-0-ap-southeast-1.pooler.supabase.com:5432`, database `postgres` (the direct
endpoint — `pg_dump` cannot run through the pgbouncer pooler on `:6543`), user and password
redacted in every artifact.

Verify the artifact pair at any time:

```bash
sha256sum backups/db-full-2026-11-14T20-36-47.dump   # compare with the manifest's sha256
```

## What the backup covers

- **All nine schemas**: `public`, `auth`, `extensions`, `graphql`, `graphql_public`,
  `pgbouncer`, `realtime`, `storage`, `vault` — DDL (tables, indexes, constraints, sequences)
  and rows. Schemas that hold no tables (`extensions`, `graphql`, `graphql_public`,
  `pgbouncer`) are still in the dump; only the five with tables appear in `counts.json`.
- **77 tables, 2857 rows**, of which 31 tables hold data. That includes the Prisma migration
  bookkeeping (`public._prisma_migrations`, 36 rows) — the history that
  `prisma migrate deploy` compares against — plus Supabase's own bookkeeping tables
  (`auth.schema_migrations` 82, `realtime.schema_migrations` 89, `storage.migrations` 74).
- Business data: `Order` 216, `OrderItem` 216, `GiftCode` 170, `Product` 31,
  `ProductVariant` 88, `Customer` 54, `AdminSession` 962, `AuditLog` 429, `SiteSetting` 87,
  `StockMove` 62, `TopUpLog` 38, and the rest — the full per-table list is in `counts.json`.

## What it does NOT cover

- **Ownership and grants.** Dumped with `--no-owner --no-privileges`, so the artifact needs no
  Supabase roles to restore. Re-grant permissions after a restore if the target is a real
  Supabase project.
- **Storage binaries.** `storage.objects` rows are in the dump; the actual file bytes live in
  Supabase's S3-compatible bucket and are not in it. A restore brings back the references, not
  the images/PDFs. (Today that bucket is empty — the shop keeps its images as base64 in
  `SiteSetting` — but do not assume that stays true.)
- **Auth users beyond their rows.** `auth.users` rows restore, but there is no external
  identity state and no way to send mail from a restored copy.
- **Supabase-managed extensions.** `vault` is a wrapper around the `supabase_vault` extension,
  which does not exist in a stock Postgres image. Restoring with plain Postgres reproduces the
  schema but not that one table (see below) — it is empty on the source.
- **Roles, publications, other projects** in the same Supabase org.

## Restoring it

The rehearsal path (throwaway container, wiped afterwards) is scripted:

```bash
node scripts/verify-supabase-backup.mjs                 # newest db-full-*.dump
node scripts/verify-supabase-backup.mjs --dump=backups/db-full-2026-11-14T20-36-47.dump --keep
```

It starts `postgres:17-alpine` on port 5544, restores the dump with
`--no-owner --no-privileges`, recomputes every table's fingerprint, compares against
`counts.json`, prints a report, writes `<dump>.verify.json`, and deletes the container
(`--keep` leaves it up for inspection). Exit code 0 means every populated table matched.

The same steps by hand — this is the exact command set, and the reason the artifact is
trustworthy:

```bash
# 1. scratch database. Use a current PG major that matches the source (17).
docker run -d --name nk-restore -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=restore \
  -p 5544:5432 postgres:17-alpine

# 2. load the artifact
docker cp backups/db-full-2026-11-14T20-36-47.dump nk-restore:/tmp/backup.dump
docker exec nk-restore pg_restore -U postgres -d restore --no-owner --no-privileges /tmp/backup.dump

# 3. inspect it
docker exec -it nk-restore psql -U postgres -d restore -c '\dt public.*'

# 4. tear it down (the scratch DB is disposable)
docker rm -f nk-restore
```

Expected: three `pg_restore: error` lines, all the same cause — `extension "supabase_vault" is
not available`, then `vault.secrets does not exist`. They are a property of the stock image,
not of the artifact; `vault.secrets` holds 0 rows on the source. Everything else restores
silently.

## How "the restore is good" is proven

`counts.json` stores, per table:

```sql
SELECT count(*),
       coalesce(md5(string_agg(md5(x::text), '' ORDER BY md5(x::text))), '-')
FROM "schema"."table" x;
```

The ordered, per-row md5 makes the value independent of physical row order (a `pg_dump`
restore does not preserve it) and sensitive to every column of every row, so a truncated
string, a shifted timestamp or a rounded decimal changes the hash. Restore, recompute the same
expression, compare.

Result of the 2026-11-14 rehearsal (recorded in `verify.json`):

- 31/31 populated tables matched — count **and** fingerprint, 2857 rows compared.
- 45/46 empty tables recreated empty.
- `vault.secrets` not recreated (missing extension, 0 rows on the source).
- 0 tables exist in the restore that are absent from the source.

## Re-taking a backup

```bash
node scripts/backup-supabase-db.mjs     # reads DATABASE_DIRECT_URL / DATABASE_URL from .env.local
```

New date-stamped `db-full-*` quadruple; nothing is overwritten. The source is only read
(`SELECT` + `pg_dump`), so this is safe to run against production at any time. Afterwards run
the verifier against the new dump — an unverified backup is a hope, not a backup.

The password never enters argv or the shell history: it travels in a `0600` env file under
`tmp/` that the script deletes on exit.
