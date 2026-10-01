# Infisical Machine-Identity Swap for Plesk (thsv93) — execution plan

**Goal:** replace the OLD Infisical machine identity (`6be89e56-…`) still wired into the Plesk
Node.js panel env with the NEW identity (`hostatom-thsv93-app`), verify, soak, then retire the old
one. Written Oct 1, 2026 after deploy `13bdf58` — during that deploy the Plesk Node.js panel was
read directly and still showed `INFISICAL_CLIENT_ID = 6be89e56-…` (see the correction in
[secret-rotation-checklist.md](secret-rotation-checklist.md) Step 1 / [hostatom-live.md](hostatom-live.md) §4.A).

This is checklist **Step 1, steps 4–6**, expanded with rollback paths and a soak phase.

**Verified facts this plan relies on:**

- `server.js` boot-loader reads exactly: `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`,
  `INFISICAL_SITE_URL` (default `https://app.infisical.com`), `INFISICAL_ENV` (default `prod`),
  `INFISICAL_PROJECT_ID` (= `80151198-f2df-4917-a8b4-bbfb315cb0c2`). Universal-auth login, then one
  secrets read. **Fail-closed:** any login/read failure → `process.exit(1)` — a bad identity takes
  the site DOWN at boot rather than serving without secrets.
- Plesk panel env (verified on the panel Oct 1, 2026): 5 × `INFISICAL_*` +
  `VERCEL_GIT_COMMIT_REF=master`. Only the two credential values change in this swap.
- The NEW identity exists in Infisical (created Oct 1 per checklist Step 1 steps 1–3); its
  Client ID/Secret are in the password manager. Nothing else in Plesk or Infisical needs to change.

---

## Phase 0 — Preconditions (read-only)

1. Password manager holds the NEW identity's Client ID + Client Secret. If lost: create a
   *replacement* identity in Infisical (checklist Step 1 steps 1–3) — do not guess values.
2. Site is currently green: the three curls
   (`/api/v1/version` → expected `gitSha`, `/api/v1/health` → healthy/database ok, `/api/v1/products` → 200).
   Any later breakage is then attributable to the swap.
3. Plesk sessions expire in minutes — re-SSO right before Phase 1
   (clientarea → product 74879 → **Manage Domains**) and keep the Node.js tab open through Phase 2.

## Phase 1 — Wire the new identity into Plesk (the swap)

1. Plesk → **Node.js** → Dashboard → Custom environment variables → **specify**.
2. Replace ONLY:
   - `INFISICAL_CLIENT_ID` → NEW identity's Client ID
   - `INFISICAL_CLIENT_SECRET` → NEW identity's Client Secret
   Paste raw values (no quotes). Do **not** touch `INFISICAL_ENV=prod`,
   `INFISICAL_PROJECT_ID=80151198-…`, `INFISICAL_SITE_URL`, `VERCEL_GIT_COMMIT_REF=master`.
3. **OK** to save the env config (this is a config save — saving is correct here, unlike the
   scheduled-task Run-Now flow).
4. **Restart App**. The next request triggers the boot: `server.js` must log in with the NEW
   identity and read the secrets. If it fails, the process exits — go straight to Rollback.

## Phase 2 — Verify (the boot is the test)

Within a minute of the restart:

```bash
curl -s https://nongkatistore.com/api/v1/version     # expected gitSha, gitRef master
curl -s https://nongkatistore.com/api/v1/health      # healthy, database: ok
curl -s -o /dev/null -w "%{http_code}\n" https://nongkatistore.com/api/v1/products   # 200
```

A healthy response **is** the proof: the boot-loader just authenticated with the NEW identity and
read the secrets with it. Then click through one real checkout flow (order → slip upload → admin
confirm) as the functional check.

### Rollback (Phase 1–2 failure)

Paste the OLD `6be89e56-…` values back into the two env vars → **Restart App** → verify the three
curls. The old identity remains fully enabled until Phase 4, so rollback is always available during
Phases 1–3. Diagnose the new identity calmly afterwards (common failures below), then retry Phase 1.

## Phase 3 — Soak (24–48 h, both identities in place)

- Watch `/api/v1/health` (and the ops-health endpoint if wired) across at least one **full deploy**
  (`scripts/deploy-artifact.sh` → Plesk Run-Now → Restart App) — every deploy restart is another
  boot test on the new identity.
- No action needed on the old identity yet; it just sits unused.

## Phase 4 — Retire the old identity (only after a clean soak)

1. Infisical → project **nong-kati** → Settings → Access Control → **Machine Identities** →
   old identity (Client ID starts `6be89e56`) → ⋯ → **Edit role** → **No Access**.
   This revokes read ability without deleting — the reversible first cut.
2. Deliberately **Restart App** in Plesk and verify the three curls. This restart is the real test:
   if anything still depended on the old identity, the fail-closed boot would fail here.
3. Infisical → **Audit Log**: confirm no auth attempts from the old identity after the cut.
4. **Only then** delete: Machine Identities → old identity → ⋯ → **Delete** (permanent).
   Before confirming deletion, glance at the Plesk panel env one last time — it must show the NEW
   client ID (checklist Step 6 item 3).
5. Record completion: checklist Step 1 ✅ + Step 6 hygiene items, and a line in
   [hostatom-live.md](hostatom-live.md) §5.

## Rollback summary

| Failure point | Action |
|---|---|
| Phase 2 boot fails / checks fail | Restore OLD ID/Secret in Plesk → Restart → verify. Old identity is still fully enabled. |
| Phase 4 restart fails after No Access | Set the old identity's role back (Infisical) → Restart → verify. Deletion has not happened yet. |
| After deletion (nothing should fail) | If anything ever fails here, re-create an identity and redo Phase 1 — the values are recoverable, the site boot is what protects you. |

## Common failure modes (this exact stack)

- **No project role:** boot fails at "secrets read failed: HTTP …" — the new identity isn't added to
  project `nong-kati` with a secrets-read role. Fix in Infisical; no Plesk change needed; Restart App.
- **Typo'd / space-trimmed secret:** login failed HTTP 4xx — paste values exactly as stored.
- **Trusted-IP / lockout on the identity:** login fails from the server — check the identity's IP
  restrictions (should be unrestricted).
- **Panel quoting:** Plesk stores values literally; stray quotes become part of the value.
- **Expired Plesk session mid-edit:** re-SSO and redo the env edit; verify nothing was half-saved.

## Success criteria

Plesk env shows the NEW client ID · site healthy across ≥ 2 restarts + 1 deploy · one full soak on
No Access for the old identity · old identity deleted · checklist Step 1 + Step 6 updated.
