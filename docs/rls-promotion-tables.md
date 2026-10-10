# RLS on `Promotion` and `PromotionProduct` — decision record

**Question:** is the `ENABLE ROW LEVEL SECURITY` + `REVOKE` block in
`prisma/migrations/20261007150000_wip_orderitem_coupon_finalline` safe for the role this
app connects as — and does the migration need changing?

**Decision:** keep RLS enabled, keep the guarded role revokes, and **add a fail-closed
ownership guard** to the migration plus the same assertion in `scripts/verify-rls.cjs`.

## Why the pattern is safe here

`20260927200000_rls_baseline` establishes the rule for this database and states it explicitly:
enable RLS with **no policies** (deny-by-default for every non-owner), and deliberately do
**not** use `FORCE ROW LEVEL SECURITY`, because that would apply RLS to the table owner —
the role Prisma connects as — and break every query. Postgres exempts the table owner from
plain `ENABLE ROW LEVEL SECURITY`, so the application keeps full access while the Supabase
client roles (`anon`, `authenticated`) are locked out.

Thirty-six tables already rely on that exemption in production, including `Order`,
`Customer` and `GiftCode`. `Promotion` and `PromotionProduct` were simply not in that
migration's array — `Promotion` existed in the Prisma model but not in the checked-in
migration history, and `PromotionProduct` did not exist yet. Enabling RLS on both here
closes that gap, which keeps the invariant asserted by `scripts/verify-rls.cjs` intact
("every table in schema `public` has `rowsecurity = true`").

No policy is needed for the application: it does not use the Data API at all. There is no
`supabase-js`/PostgREST table access anywhere in `src/` — all reads and writes go through the
Next.js route handlers and Prisma. A permissive policy would exist purely to grant access to a
role that never connects.

## Why it was still worth guarding

The exemption depends on one fact that the migration was assuming: **the connecting role owns
the tables.** That holds when the migration creates them, but `CREATE TABLE IF NOT EXISTS
"Promotion"` is a no-op if the table already exists — and this table is known to pre-date the
migration history. If it was created by a different role (a dashboard user, a one-off
`prisma db push` under another credential), then:

- the app is not the owner,
- `ENABLE ROW LEVEL SECURITY` with no policies applies to it,
- and the failure is **silent**: `SELECT` returns **zero rows**, not an error.

Nothing else in the pipeline would catch it. `verify-rls.cjs` would still pass (RLS *is*
enabled, and `anon`/`authenticated` *are* revoked), CI cannot catch it (there the connecting
role created every table, so it owns them), and the storefront would just stop showing
promotions with nothing in the logs.

## What changed

1. `prisma/migrations/20261007150000_wip_orderitem_coupon_finalline/migration.sql` — before
   the RLS statements, a `DO` block checks for each table that the current role is the owner,
   or is superuser, or has `BYPASSRLS`. If not, it raises with an actionable message and
   **aborts the migration**, so the deploy fails and the previous release keeps serving.
   Failing closed is the only safe automatic outcome: a non-owner role cannot grant itself
   access to a table it does not own.
2. `scripts/verify-rls.cjs` — third assertion: the connecting role must own or bypass RLS on
   every RLS-enabled table in `public`. This turns the silent zero-rows mode into a named
   failure in any environment the script is run against (CI runs it right after
   `migrate deploy`).
3. `scripts/rehearse-migration.sh` — the same predicate is asserted locally, so the disposable
   database rehearsal and the CI gate agree.

Deliberately **not** changed: no `FORCE ROW LEVEL SECURITY` (would break the app), no
permissive policy (nothing needs one), no schema change, and the `REVOKE ALL … FROM PUBLIC`
is kept — it is a superset of the baseline's guarded revokes and cannot affect an owner.

## If the guard ever fires

The message names the table and its actual owner. Either connect the migration as that owner,
or ship a reviewed, narrowly scoped policy for the application role in a new migration before
enabling RLS. Do not remove the guard to make a deploy pass.

## Verification status — executed against a real PostgreSQL 16

Run on an embedded PostgreSQL 16 cluster (throwaway data directory, no Docker, no admin
rights). Commands and their actual results:

- `prisma migrate deploy` → applied the entire 33-migration history **including this
  migration and this guard**: "All migrations have been successfully applied."
- Post-migration readback: RLS `true` on `Promotion`, `PromotionProduct` and
  `_prisma_migrations`; the four new `OrderItem` columns and the `PromotionProduct` table
  present; latest applied migration = `20261007150000_wip_orderitem_coupon_finalline`.
- `node scripts/verify-rls.cjs` → `RLS enabled on all 39 public tables` and
  `connecting role bypasses RLS on every public table`.
- `prisma migrate diff --from-url <migrated db> --to-schema-datamodel prisma/schema.prisma
  --script --exit-code` → **"This is an empty migration."** — the freshly migrated database
  and `schema.prisma` agree exactly (exit 0).

Guard behaviour, driven with three real roles:

| case | connecting role | result |
| --- | --- | --- |
| F1 guard + `ENABLE` + `REVOKE`, then read | owns both tables | PASS — RLS on, owner still reads its own rows |
| F2 read an RLS-enabled table | not owner, **holds grants** | **0 rows, no error** — the silent mode is real |
| F3 run `ENABLE ROW LEVEL SECURITY` directly | not owner | ERROR: `must be owner of table Promotion` |
| F4 run the guard | not owner | **ABORTED** with the actionable message (the requested check) |
| F4b RLS state after the abort | — | unchanged (`false`) — nothing partially applied |
| F5 run the guard | `BYPASSRLS` | PASS (allowed) |

Two caveats that the evidence itself forces, stated plainly:

1. F3 shows Postgres **already** refuses `ENABLE RLS` for a non-owner, so the guard is an
   *earlier, clearer* failure rather than the only barrier. Its value is the message (it
   names the actual owner) and failing before any other statement in the migration runs.
2. F2's silent mode needs the runtime role to differ from the migration role **and** to hold
   table grants. Here `vercel.json` runs `prisma migrate deploy` with the same `DATABASE_URL`
   the app uses, so both roles are identical today. `DATABASE_DIRECT_URL` is already present
   in the environment, so wiring `directUrl` for migrations is one line away from creating
   that split — and `verify-rls.cjs`, run with the *runtime* credential, is what catches it.

Note for future parity checks: `migrate diff --from-migrations` **cannot be used in this
repo**. It replays the history into a shadow database, and `20260927200000_rls_baseline`
enables RLS on `_prisma_migrations`, which a shadow database does not have — it fails with
P1014 every time. Compare the migrated database instead (`--from-url`), which is what
`scripts/rehearse-migration.sh` now does.

### Adjacent drift found by the same verification

The parity check also reported three pre-existing mismatches unrelated to RLS or the
promotion work — the database had more than the model: `Customer_tier_idx`,
`Order_couponId_idx`, and a `DEFAULT` on `EmailOutbox.updatedAt`. `schema.prisma` now declares
all three (indexes and `@default(now())`), so `migrate dev` cannot silently drop two live
indexes and a column default. The three drifts are described in `handoff.md`.
