# Admin Login — Test Guide

How to test the admin panel login flow on Nong-Kati, including every failure
case it is designed to handle.

- **Login page (local dev):** `http://localhost:4200/management/login` (or whichever port `npm run dev` prints)
- **Login page (production):** `https://nong-kati.vercel.app/management/login`
- **Implementation:** `src/api/adminAuth.ts` (DB-backed login logic),
  `src/lib/password.ts` (scrypt hashing), `src/lib/jwt.ts` (RFC 6238 TOTP + JWT signing),
  API routes `src/app/api/v1/auth/admin/{login,2fa}/route.ts`

> **Status: DB-BACKED AUTH.** Admin accounts, password hashes (scrypt), TOTP
> secrets and refresh-token sessions live in PostgreSQL (`AdminUser`,
> `AdminSession` tables). Failed-attempt counters and lockouts persist across
> restarts. The JWT signing secret comes from `NK_JWT_SECRET`.

---

## 1. Credentials

| Field | Value | Note |
| -------- | ----------------------- | -------------------------------------------------------------------------- || Email | `admin@nong-kati.co.th` | Only seeded account, role `super_admin` |
| Password | `admin123` | scrypt-hashed in DB; **change it** in ตั้งค่า → ความปลอดภัย → เปลี่ยนรหัสผ่าน (new password needs ≥12 chars) |
| 2FA | **Real TOTP** | 6-digit rotating code from any authenticator app |

**2FA enrollment:** on first login the seeded account shows the 2FA-setup
step with a QR code (secret `JBSWY3DPEHPK3PXP` in the current seed row). Scan
it, then enter the rotating 6-digit code. Codes refresh every 30 seconds;
±1 time-window of clock drift is accepted.

> The old fixed test code `123456` is **gone** — real RFC 6238 verification
> runs in `verifyTotpCode` (`src/lib/jwt.ts`).

---

## 2. Happy path (UI)

1. Go to `/management/login`.
2. Enter the email + password above → **เข้าสู่ระบบ**.
3. First login: the **ตั้งค่า 2FA** step shows QR + secret + backup codes.
   Scan with an authenticator app, enter the 6-digit code → **ยืนยัน**.
   Later logins go straight to the **ยืนยันตัวตน** code step.
4. Expected: redirect to `/management/dashboard`, and
   `localStorage.nk_admin_access_token` + `nk_admin_refresh_token` are set.

**Pass criteria:** dashboard renders with the sidebar (แดชบอร์ด, สินค้า, …)
and the header shows "Founder / Super Admin". `GET /api/v1/admin/products`
with the stored token returns the full catalog.

## 3. Session behavior after login

- **Access token TTL: 15 minutes — but it self-renews.** Admin pages fetch
  through `adminFetch` (`src/lib/adminSession.ts`): a 401 triggers one silent
  refresh-and-retry, and the layout refreshes proactively while the tab is
  open. You should almost never see an expiry error.
- **Refresh token: 30 days**, stored only as a SHA-256 hash in `AdminSession`.
  Every refresh **rotates** it — the old token is revoked server-side and a
  new one is returned. Re-login is only needed after 30 days of inactivity,
  or if the session was revoked (logout, password change).
- **Refresh failure = silent logout.** An invalid/expired/already-rotated
  refresh token clears storage and redirects to the login page — no dead
  admin screens.
- **Challenge token (between step 1 and 2): single-use, 5-minute TTL.**
  Letting the TOTP step expire shows "หมดเวลายืนยัน กรุณาเข้าสู่ระบบใหม่" and
  returns you to the credentials step.
- Tokens live in `localStorage` — clearing site data logs you out.

To check expiry manually, paste in the browser console:

```js
const t = localStorage.getItem('nk_admin_access_token');
const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
console.log('expired:', p.exp * 1000 < Date.now(), 'role:', p.role);
```

---

## 4. Failure cases to exercise

| #   | Scenario                   | Steps                                             | Expected result                                                                                     |
| --- | -------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Wrong password             | valid email + wrong password                      | Error "อีเมลหรือรหัสผ่านไม่ถูกต้อง"; counter increments (persisted in DB)                           |
| 2   | Unknown email              | any password                                      | Same invalid-credentials error (no account enumeration; latency masked)                             |
| 3   | Account lockout            | 5 consecutive wrong passwords                     | Account `locked` in DB for **15 minutes**; message shows minutes remaining; survives server restart |
| 4   | Wrong TOTP                 | correct email+password, then a wrong 6-digit code | "รหัสไม่ถูกต้อง กรุณาลองใหม่"; remains on 2FA step                                                  |
| 5   | Expired/consumed challenge | wait > 5 min, or reuse an old challenge           | "หมดเวลายืนยัน" and return to credentials step                                                      |
| 6   | Deactivated account        | (set `status: 'deactivated'` in DB)               | "บัญชีนี้ถูกปิดใช้งาน"                                                                              |
| 7   | Empty inputs               | submit blank form                                 | HTML5 required validation blocks submit                                                             |

Unlock a locked account (or reset counters) directly:

```sql
UPDATE "AdminUser" SET status='active', "lockedUntil"=NULL, "failedLoginAttempts"=0
WHERE email='admin@nong-kati.co.th';
```

## 5. What login unlocks (smoke test)

After logging in, confirm each admin page loads its real data:

| Page                                     | Should show                                                 |
| ---------------------------------------- | ----------------------------------------------------------- |
| `/management/dashboard`                  | Stat cards, sales summary                                   |
| `/management/products`                   | All 37 real DB products with images, edit + archive buttons |
| `/management/settings` → แถบประกาศ       | Current announcement from DB, editable                      |
| `/management/settings` → ธีมและแอนิเมชัน | 6 accent swatches + 4 speed presets + live preview          |
| `/management/settings` → ร้านค้า         | Store-info form (name, phone, email, LINE, Facebook)        |
| `/management/orders`                     | Orders list                                                 |

Quick authorization check (logged out, e.g. incognito):

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://nong-kati.vercel.app/api/v1/admin/products
# expect 401
```

And with a forged token — expect `403`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer bogus.token.here" \
  https://nong-kati.vercel.app/api/v1/admin/products
```

## 6. API-level login (scripting the whole flow)

Login is two HTTP endpoints, plus refresh and logout — fully scriptable:

```bash
# Step 1: credentials → challenge token
TOKEN_JSON=$(curl -s -X POST https://nong-kati.vercel.app/api/v1/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@nong-kati.co.th","password":"admin123"}')
CHALLENGE=$(echo "$TOKEN_JSON" | jq -r .challengeToken)

# Step 2: TOTP code from your authenticator → access + refresh tokens
SESSION=$(curl -s -X POST https://nong-kati.vercel.app/api/v1/auth/admin/2fa \
  -H "Content-Type: application/json" \
  -d "{\"challengeToken\":\"$CHALLENGE\",\"code\":\"123456-from-authenticator\"}")
REFRESH=$(echo "$SESSION" | jq -r .refreshToken)

# Renew the session any time (rotates the refresh token):
curl -s -X POST https://nong-kati.vercel.app/api/v1/auth/admin/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}"

# Revoke the session (what the logout button does):
curl -s -X POST https://nong-kati.vercel.app/api/v1/auth/admin/logout \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}"
```

Wrong-password returns `401 {error:"INVALID_CREDENTIALS"}`; a consumed or
expired challenge returns `401 {error:"TOKEN_INVALID"}`; a reused (rotated)
refresh token also returns `TOKEN_INVALID`.

## 7. Security properties (now real)

- **scrypt password hashing** (N=16384, r=8, p=1, 64-byte key, random salt,
  timing-safe compare) — `src/lib/password.ts`. Plaintext never stored.
- **Real RFC 6238 TOTP** — HMAC-SHA1 over a big-endian 64-bit counter,
  30s step, 6 digits, ±1 window drift. Verified against a reference
  implementation. Verified against the DB-stored base32 secret.
- **No account enumeration** — unknown email and wrong password return the
  same error; unknown-email path burns a scrypt round to equalize latency.
- **Persistent lockout** — 5 failures → 15-minute lock, stored in the DB row.
- **Server-side sessions** — refresh tokens stored only as SHA-256 hashes;
  logout and password change revoke them.
- **JWT secret from env** (`NK_JWT_SECRET`) — set in Vercel for production.
- **Change password** (`changeAdminPassword`) verifies the current password,
  enforces ≥12 chars, and revokes all existing sessions. UI: ตั้งค่า →
  ความปลอดภัย → เปลี่ยนรหัสผ่าน (or after login you're sent there
  automatically when the account has `mustChangePassword` set). API:
  `POST /api/v1/auth/admin/change-password` (settings:write) — success
  response means you were logged out on purpose; sign in with the new
  password.

## 8. Checklist (print-friendly)

- [ ] Happy path: login → 2FA → dashboard
- [ ] Tokens appear in localStorage; admin API accepts the access token
- [ ] Corrupt the access token, reload /management/products — page still loads (silent refresh)
- [ ] Garbage refresh token → redirected to login, storage cleared
- [ ] Logout button → AdminSession row revoked in DB
- [ ] Wrong password shows Thai error, no lock on 1st try
- [ ] 5 wrong passwords lock the account for 15 min (persists across restart)
- [ ] Wrong TOTP code rejected, stays on 2FA step
- [ ] Expired challenge returns user to credentials step with notice
- [ ] Logged-out admin API returns 401; forged token 403
- [ ] Products page lists 37 DB products
- [ ] After 15 min, admin APIs return 401 → re-login works
- [ ] Change password: wrong current pw rejected; mismatch/short rejected; success logs you out → new password works, old one doesn't
