# Local development — Docker Compose

`docker-compose.yml` brings up the whole stack for this repo: **MariaDB 10.11** (the engine
`prisma/schema.prisma` targets), **Redis**, and `next dev` on <http://localhost:3000>. It is not the
production image — `Dockerfile` still builds `.next/standalone` and compose no longer uses it — so
edits in the working tree hot-reload.

## Start

```bash
docker compose up -d
docker compose logs -f app     # wait for "✓ Ready in"
```

The first run installs dependencies inside the container (~90 s); later runs reuse the
`appnode_modules` volume. `next dev` is started directly, not through `npm run dev`, so **no
Infisical login is needed** — compose supplies `DATABASE_URL`, `DATABASE_DIRECT_URL` and a 64-char
`NK_JWT_SECRET` itself. `.env` / `.env.local` on the host are not read by the container.

## Apply migrations — from inside the container

```bash
docker compose exec app npx prisma migrate deploy     # idempotent; safe to re-run
docker compose exec app npx prisma migrate status
```

Run it **inside** the container. `DATABASE_URL` there points at `db:3306`, which only resolves on the
compose network — on the host `db` is not a hostname, so the same command fails with
`P1001`. Migrations live in `prisma/migrations/` (`20261115000000_baseline`,
`20261117093000_giftcode_available_requires_variant`).

## When 3306 is already taken

A native MariaDB/MySQL on the machine holds `0.0.0.0:3306` and `docker compose up` dies with
`bind: address already in use`. Either stop the local server, or publish the container on another
port — the app is unaffected, because inside the network it still talks to `db:3306`:

```bash
cat > /tmp/nk-db-port.yml <<'EOF'
services:
  db:
    ports: !override ["3310:3306"]
EOF
docker compose -f docker-compose.yml -f /tmp/nk-db-port.yml up -d
```

`!override` (Compose ≥ 2.24) replaces the list instead of appending to it, which would otherwise
still claim 3306.

## Reset

```bash
docker compose down        # keeps the database, node_modules and .next
docker compose down -v     # drops all three volumes
```

After `down -v` the database is empty again: re-run `migrate deploy` (the next `up` also reinstalls
dependencies). Use `down -v` when a migration or a dependency change has left the volumes in a state
the code no longer expects.

## Why the base image is `node:20`, not `-slim` or `-alpine`

Prisma detects its engine by probing for openssl, so the image needs **both** the `openssl` binary and
libssl 3. The small bases have neither, and the failures look like application bugs:

- `node:20-bookworm-slim` — `Error loading shared library libssl.so.1.1`; `/api/v1/health` 503,
  `/api/v1/products` 500.
- `node:20-alpine` — libssl 3 is there but the `openssl` binary is not, so detection falls back to
  the 1.1 engine and `migrate deploy` exits 1 with `Could not parse schema engine response`.
- `node:20` — works; `prisma generate` emits the `debian-openssl-3.0.x` client with no warnings.

Keep the full base unless you re-verify both commands above against another image.
