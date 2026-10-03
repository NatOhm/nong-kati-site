# Infisical client-secret rotation — Oct 3, 2026 (human-executed)

> **Status: NOT DONE. This is the procedure; a human must execute it.**
> **No secret value appears in this file, and none should ever be pasted into it, a commit, or chat.**

## Why this exists

The `INFISICAL_CLIENT_SECRET` for the machine identity `hostatom-prod` has been displayed in clear
text **twice** — once around Sep 30/Oct 1, prompting the Oct 2 rotation, and again on Oct 3, which
burned the secret that Oct 2 had just created.

Both burns came from the same action: **reading the Plesk Node.js panel's environment-variable
table.** Plesk renders those values in clear text. Once read, the value is in session logs, and
there is no way to know where those logs are copied.

> ### The rule that prevents a third burn
> **Never read the value of `INFISICAL_CLIENT_SECRET` from the Plesk panel again.** You do not need
> to: you paste a *new* value in, and you verify the app by its public endpoints. Treat every
> screenshot of that page as a secret disclosure. If you must confirm the env is wired, confirm the
> **count** of `INFISICAL_*` rows and the **prefix** of `INFISICAL_CLIENT_ID` (`6be89e56`) — never the
> secret's contents.

## Key facts (verified, so you don't re-derive them)

- Infisical project `nong-kati` (id `80151198-…`), environment **Production**.
- There is exactly **ONE** machine identity: `hostatom-prod` (id `bcf6ab49-…`). Its Universal-Auth
  **Client ID is `6be89e56-…`** — the same value the Plesk panel shows. There is no "old identity"
  to retire; the credential at issue is the *secret* paired with that ID.
- Infisical supports **multiple client secrets per identity**, which is what makes this rotation
  zero-downtime: the new secret is added while the old still works, then the app is switched over,
  then the old one is deleted.
- `server.js` reads exactly five `INFISICAL_*` vars: `INFISICAL_CLIENT_ID`,
  `INFISICAL_CLIENT_SECRET`, `INFISICAL_SITE_URL`, `INFISICAL_ENV` (=`prod`), `INFISICAL_PROJECT_ID`.
  It is **fail-closed**: a bad login or secrets read calls `process.exit(1)`, so a bad paste takes
  the site down rather than serving without secrets.
- **There is no `.env` file on the server.** Secrets come from Infisical at boot. Only the five
  `INFISICAL_*` values live in the panel.

## Procedure

### Step 0 — Confirm the site is green before you touch anything

```bash
curl -s https://nongkatistore.com/api/v1/version     # expect gitRef: master, a gitSha
curl -s https://nongkatistore.com/api/v1/health      # expect healthy + database: ok
curl -s -o /dev/null -w "%{http_code}\n" https://nongkatistore.com/api/v1/products   # 200
```

If any of these fail, stop and fix that first — otherwise you cannot attribute a later failure to
the rotation.

### Step 1 — Add a new client secret in Infisical

1. app.infisical.com → org → project **nong-kati**.
2. **Settings → Access Control → Machine Identities** → **`hostatom-prod`**.
3. **Authentication → Universal Auth** → **Add Client Secret**.
4. Give it a description that records why, e.g. `Plesk thsv93 rotation Oct 3`.
5. **Copy the new secret into your password manager immediately.** Infisical shows it once.

Do **not** delete or disable the existing secrets yet.

### Step 2 — Paste it into Plesk

1. Re-SSO first: Plesk sessions expire within minutes. Hostatom clientarea → product `74879` →
   **Manage Domains** → opens the Plesk panel.
2. Plesk → **Node.js** → Dashboard → **Custom environment variables** → **specify**.
3. Replace the **value of `INFISICAL_CLIENT_SECRET` only**, pasting the raw value with no quotes.
   Leave these untouched:
   - `INFISICAL_CLIENT_ID` (stays `6be89e56-…`)
   - `INFISICAL_ENV=prod`
   - `INFISICAL_PROJECT_ID=80151198-…`
   - `INFISICAL_SITE_URL`
   - `VERCEL_GIT_COMMIT_REF=master` — **required**, two routes read it. Do not remove it.
4. **OK / Save.** Saving a config change here is correct — unlike the deploy scheduled-task flow,
   where you deliberately do *not* save.
5. **Before restarting, sanity-check without reading secrets:** there should be exactly **5**
   `INFISICAL_*` rows, and the `INFISICAL_CLIENT_ID` should still start with `6be89e56`.

### Step 3 — Restart the app

Plesk → **Node.js** → Dashboard → **Restart App**. The first request afterwards is slow: that
request triggers the boot, which authenticates to Infisical and reads the secrets.

### Step 4 — Verify (the boot is the proof)

```bash
curl -s https://nongkatistore.com/api/v1/version     # gitRef: master
curl -s https://nongkatistore.com/api/v1/health      # healthy + database: ok
curl -s -o /dev/null -w "%{http_code}\n" https://nongkatistore.com/api/v1/products   # 200
```

A healthy response **is** the proof of success: the boot-loader just authenticated with the new
secret and read every production secret with it. If the site is down instead, the boot failed
closed — go straight to Rollback.

Then do one functional pass: place a small guest order, upload a slip, confirm it in admin. That
exercises the secret-dependent paths end to end, not just the boot.

### Step 5 — Soak, then delete the burned secrets

Keep both secrets valid for **24–48 h** and across at least one full deploy (every deploy restart is
another boot on the new secret). Then, in `hostatom-prod` → Universal Auth, delete:

- the **Oct 3 re-exposed** secret (the one you just replaced), and
- the burned **`2018…`** secret from the original Sep 30/Oct 1 exposure — **its soak is long over,
  it can go now.**

Leave the one secret the app is currently running with.

### Step 6 — Record it

Add a row to the deploy/ops log in [hostatom-live.md](hostatom-live.md) §5, and flip Step 1 to
resolved in [secret-rotation-checklist.md](secret-rotation-checklist.md). **Describe the actions and
the date; never the value, not even a prefix.**

## Rollback

Both secrets stay valid until Step 5, so rollback is available for the entire rotation and soak.

| Failure point | Action |
|---|---|
| Step 3/4 — boot fails, site down | Paste the previous secret value back into `INFISICAL_CLIENT_SECRET` → **Restart App** → re-run the Step 4 curls. |
| A later deploy fails after deletion | Create a fresh client secret on `hostatom-prod` (Step 1) and redo Steps 2–4. |

Diagnose calmly after the site is green again. The common causes:

| Symptom | Cause | Fix |
|---|---|---|
| Boot fails, "secrets read failed" | identity lost its project role | Grant the role in Infisical; Restart App |
| Boot fails, login 4xx | typo / stray whitespace / stray quotes in the pasted value | Re-paste exactly as stored, no quotes |
| Login refused from the server | trusted-IP restriction on the identity | Remove the restriction in Infisical |
| Session expired mid-edit | Plesk sessions are short | Re-SSO and re-check nothing was half-saved |

## After this: the remaining checklist

Rotation is the first item only. Still open, in
[secret-rotation-checklist.md](secret-rotation-checklist.md): the database password (Supabase →
`DATABASE_URL` in Infisical → Restart App), `NK_JWT_SECRET` (invalidates all sessions — announce
it), and the panel passwords. Neither the database password nor the JWT secret has been exposed in
the ways described here, so those are hygiene rather than emergencies.