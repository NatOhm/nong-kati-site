# Postgres-era cutover scripts (archived 2026-11-17)

These ran the 2026-11-15 Supabase → MariaDB cutover. Production has been MariaDB on the
Hostatom vhost since then, so nothing here is part of the live path: they are kept because
they are the provenance of the data that is now serving customers, and because a rollback to
Postgres (see `docs/PLESK-CUTOVER.md` → §4 rollback C) would start from them.

- `backup-supabase-db.mjs` / `verify-supabase-backup.mjs` — dump and restore-verify the source.
- `migrate-supabase-to-mariadb.mjs` / `precutover-check.mjs` — row copy + the 32-check gate.
- `cutover-window.mjs` / `phase6-cutover.sh` — the orchestrators that ran the above in order.
- `rehearse-migration.sh` / `rehearse-phase6.sh` — the rehearsals against a throwaway copy.

They are **not** wired into `package.json` or CI, and they need a Postgres source that no longer
exists. Live equivalents: `scripts/backup-mariadb.sh` (nightly), `scripts/db-report.mjs`,
`scripts/stock-reconcile.mjs`, `scripts/postswitch-check.mjs`.

Runbook and history: `docs/db-migration-hostatom-mariadb.md`.
