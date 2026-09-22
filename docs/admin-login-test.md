# Admin Login — Test Guide

How to test the admin panel login flow on Nong-Kati, including every failure
case it is designed to handle. สำหรับบัญชีทดสอบฝั่งลูกค้า ดู
`docs/customer-login-test.md` (มีตารางบัญชี dummy ทั้งสองฝั่ง) ·
คู่มือใช้งานทั้งหมดหลังล็อกอิน ดู `docs/admin-manual-th.md`

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

Admin accounts are **not seeded** — a request-path default can never create
privileged rows (security review C1). Provision or rotate accounts with the
explicit bootstrap command (fails closed in production):

```bash
# First account (one-time operational step)
npx tsx scripts/create-admin.ts admin@nong-kati.co.th "ชื่อแอดมิน" super_admin

# Rotate an existing account: new password + fresh TOTP + sessions revoked
npx tsx scripts/create-admin.ts admin@nong-kati.co.th "ชื่อแอดมิน" super_admin --rotate
```

The command prints the password and an `otpauth://` URI (add it in your
authenticator app). Every new/rotated account has `mustChangePassword=true`
— the first login lands on the forced-change form, and every new account
carries its **own unique TOTP secret** (no shared seed). Limited roles show
only their role's sidebar items.

> 📄 Current credentials: rotated 2026-09-22 and delivered to the owner
> (stored outside the repository — never commit them).

**2FA: real TOTP** — 6-digit rotating code from any authenticator app.

**2FA enrollment:** on first login a new/rotated account shows the 2FA-setup
step with a **unique per-account QR code** (printed by `create-admin.ts` as
an `otpauth://` URI if you prefer manual entry). Scan
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
- **Refresh token TTL follows the Remember-me box (added 2026-09-20):**
  - **จดจำการเข้าสู่ระบบไว้ในเครื่องนี้ (30 วัน) checked → 30 days** — the
    classic keep-me-logged-in; come back next week and you're still in.
  - **Unchecked → 12 hours AND the session ends with the browser** — a
    `pagehide` guard (`installSessionScopeGuard` in `src/lib/adminSession.ts`)
    clears both tokens the moment the tab closes. Close tab → reopen = login
    page. The 12h cap is the backstop for a browser that never fires pagehide
    (e.g. force-killed).
  - The choice is stored in `localStorage.nk_admin_remember` (`1`/`0`).
    Server-side, the flag rides **inside the challenge JWT** (`rem` claim,
    set at step 1 from the login body's `remember: true`; the 2FA step reads
    `challenge.rem` when issuing the session) — so the TTL class is decided
    by the server, not by whatever the browser claims later.
  - **Refresh rotation preserves the class** (verified in
    `refreshAdminSession`, `src/api/adminAuth.ts`): the new `AdminSession`
    row infers remembered-ness from the old row's `expiresAt − createdAt`,
    so a remembered session stays 30-day after renewals and a workday
    session stays 12h.
- **Deactivation/demotion kills live sessions immediately (2026-09-21).**
  `verifyAdminJwt` re-checks the DB on every admin API call: the account
  must still be `active`, and the token's `iat` must be newer than
  `sessionsInvalidBefore`. Deactivating or demoting a staff member (or their
  password being changed) revokes API access the moment their current
  15-minute access token is used — no waiting out the TTL.
- Refresh tokens are stored only as a SHA-256 hash in `AdminSession`.
  Every refresh **rotates** the token — the old one is revoked server-side
  and a new one is returned. Re-login is needed when the refresh token
  finally expires (per the rules above), or if the session was revoked
  (logout, password change).
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

| #   | Scenario                          | Steps                                                                                     | Expected result                                                                                     |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Wrong password                    | valid email + wrong password                                                              | Error "อีเมลหรือรหัสผ่านไม่ถูกต้อง"; counter increments (persisted in DB)                           |
| 2   | Unknown email                     | any password                                                                              | Same invalid-credentials error (no account enumeration; latency masked)                             |
| 3   | Account lockout                   | 5 consecutive wrong passwords                                                             | Account `locked` in DB for **15 minutes**; message shows minutes remaining; survives server restart |
| 4   | Wrong TOTP                        | correct email+password, then a wrong 6-digit code                                         | "รหัสไม่ถูกต้อง กรุณาลองใหม่"; remains on 2FA step                                                  |
| 5   | Expired/consumed challenge        | wait > 5 min, or reuse an old challenge                                                   | "หมดเวลายืนยัน" and return to credentials step                                                      |
| 6   | Deactivated account               | (set `status: 'deactivated'` in DB)                                                       | "บัญชีนี้ถูกปิดใช้งาน"                                                                              |
| 7   | Empty inputs                      | submit blank form                                                                         | HTML5 required validation blocks submit                                                             |
| 8   | Remember-me unchecked, tab closed | login with box unticked → close tab → reopen                                              | Tokens cleared (`pagehide` guard) → login page; DB session still lives ≤12h but is unreachable      |
| 9   | Remember-me checked, tab closed   | login with box ticked → close tab → reopen                                                | Still authenticated — lands on the dashboard without re-login (refresh token ≤30 days)              |
| 10  | Rotation keeps the class          | with remember ON, wait 15+ min or force refresh                                           | New `AdminSession` row still has a 30-day `expiresAt − createdAt`                                   |
| 11  | 12h hard cap on unremembered      | unchecked, keep the tab open >12h (or shift `expiresAt` back in DB) then act              | Next refresh fails → silent logout to the login page                                                |
| 12  | Deactivated kills a live token    | copy the access token, deactivate the account in DB, call an admin API with the old token | 401 immediately (`verifyAdminJwt` status re-check)                                                  |

Unlock a locked account (or reset counters) directly:

```sql
UPDATE "AdminUser" SET status='active', "lockedUntil"=NULL, "failedLoginAttempts"=0
WHERE email='admin@nong-kati.co.th';
```

## 4b. RBAC spot checks (limited accounts)

Log in as each seeded limited account and verify both sides of the matrix.
Permissions come from `ROLE_PERMISSIONS` in `src/types/auth.ts` and are
embedded in the JWT at issuance.

| Caller            | products | categories | inventory | coupons | orders  | announcement | change-password (self) |
| ----------------- | -------- | ---------- | --------- | ------- | ------- | ------------ | ---------------------- |
| catalogue_manager | **200**  | **200**    | **200**   | **200** | 403     | 403          | 200/400                |
| order_manager     | 403      | 403        | 403       | 403     | **200** | 403          | 200/400                |

(change-password returns 400 for a wrong current password — that's the
allowed self-service path reaching validation.)

Also check the sidebar (it filters by the same permissions):

catalogue_manager sees แดชบอร์ด / สินค้า / หมวดหมู่ / คลังสินค้า / คูปองส่วนลด;
order_manager sees คำสั่งซื้อ / ลูกค้า (the dashboard item requires
`products:read`, so they don't get it either) — never each other's items.
Sidebar entries are permission-gated; คูปองส่วนลด and แท็ก appear only for
roles holding `coupons:read` / `products:read` respectively, and the two
report pages (ยอดซื้อรายคน, สินค้าค้างสต๊อก) appear only for roles holding
`reports:read` — neither seeded limited account has it, so they see no
รายงาน section at all. The slow-stock N-days **save** button additionally
requires `settings:write` (super_admin only); viewers without it can still
read the report.

## 5. What login unlocks (smoke test)

After logging in, confirm each admin page loads. Data sources differ —
real Prisma-backed pages and M7 placeholders are marked so you know what
a bug vs a stub looks like:

| Page                     | Data        | Should show                                                                                                                                                      |
| ------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/management/dashboard`  | **real DB** | Sales stats from `/api/v1/admin/dashboard` (Prisma aggregates)                                                                                                   |
| `/management/products`   | **real DB** | All 37 products; edit SKU/name/price/cost/stock/description/image; archive; show/hide                                                                            |
| `/management/categories` | **real DB** | Type-level category tree — add/rename/reorder groups, move app categories between groups                                                                         |
| `/management/inventory`  | **real DB** | All 37 products with SKU; edit price/stock; hide/show (instantly off the storefront); stock history                                                              |
| `/management/orders`     | **real DB** | Orders from `/api/v1/admin/orders`; detail + **ยืนยันการชำระเงิน** (verify-payment)                                                                              |
| `/management/coupons`    | **real DB** | Coupon CRUD (bath/percent, min spend, expiry) — sidebar link: **คูปองส่วนลด**                                                                                    |
| `/management/tags`       | **real DB** | Tag CRUD with live product counts; tags attach in the product editor, show as #chips on the storefront                                                           |
| `/management/customers`  | **real DB** | Customer list from Prisma: block/unblock + set price tier (retail/member/dealer)                                                                                 |
| `/management/staff`      | **real DB** | Staff CRUD from the `AdminUser` table: create (temp password + 2FA enrollment), roles, deactivate/unlock (replaced the M7 mock 2026-09-21)                       |
| `/management/reports`    | mixed       | Static catalogue cards + two live pages: **ยอดซื้อรายคน** (`/reports/customer-sales`) and **สินค้าค้างสต๊อก** (`/reports/slow-stock`, N-days threshold editable) |
| `/management/audit`      | in-memory   | Audit log filter/search (resets on server restart)                                                                                                               |
| `/management/settings`   | **real DB** | 7 tabs: แถบประกาศ · ธีมและแอนิเมชัน · ร้านค้า · การชำระเงิน · อีเมล · ความปลอดภัย · การแจ้งเตือน                                                                 |

Settings specifics worth exercising:

- **แถบประกาศ** — the striped banner above the storefront; edits go live
  on the site after save.
- **ธีมและแอนิเมชัน** — 6 accent swatches + 4 speed presets (550ms is the
  designed default) with live preview; the accent regenerates the whole
  peach ramp.
- **การแจ้งเตือน** — Discord webhook for new orders and low-stock alerts.
- **ความปลอดภัย** — change password (see §7).

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
# Step 1: credentials → challenge token (password from your manager —
# no defaults ship with the repo)
TOKEN_JSON=$(curl -s -X POST https://nong-kati.vercel.app/api/v1/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@nong-kati.co.th","password":"<your-password>"}')
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
  logout and password change revoke them. `verifyAdminJwt` additionally
  re-checks account status + `sessionsInvalidBefore` from the DB on every
  admin API call, so deactivation/demotion ends API access immediately.
- **JWT secret from env** (`NK_JWT_SECRET`) — set in Vercel for production.
- **Change password** (`changeAdminPassword`) verifies the current password,
  enforces ≥12 chars, and revokes all existing sessions. UI: ตั้งค่า →
  ความปลอดภัย → เปลี่ยนรหัสผ่าน (or after login you're sent there
  automatically when the account has `mustChangePassword` set). API:
  `POST /api/v1/auth/admin/change-password` (settings:write) — success
  response means you were logged out on purpose; sign in with the new
  password.

## 8. Checklist (print-friendly)

> **2026-09-19: 28/28 items below verified passing** via an automated E2E
> run against the real API surface (throwaway admin account, real TOTP
> codes, real DB; all test rows cleaned up afterward). Evidence lines
> showed exact status codes and payloads. Rerun anytime with the script
> pattern in §6 plus the TOTP helper described in §7.

- [x] Happy path: login → 2FA → dashboard
- [x] Tokens appear in localStorage; admin API accepts the access token
- [x] Corrupt the access token, reload /management/products — page still loads (silent refresh)
- [x] Garbage refresh token → redirected to login, storage cleared
- [x] Logout button → AdminSession row revoked in DB
- [x] Wrong password shows Thai error, no lock on 1st try
- [x] 5 wrong passwords lock the account for 15 min (persists across restart)
- [x] Wrong TOTP code rejected, stays on 2FA step
- [x] Expired challenge returns user to credentials step with notice
- [x] **Challenge is single-use** — a consumed challenge replayed against
      the 2FA endpoint returns `TOKEN_INVALID` (enforced by the
      `AdminChallengeConsumed` table; fixed & verified 2026-09-19 — it was
      previously reusable)
- [x] Setup step stays usable until confirm consumes the challenge
- [x] Logged-out admin API returns 401; forged token 403 (products, orders, coupons, announcement)
- [x] Products page lists 37 DB products; editing SKU to a duplicate is rejected with 409 (`SKU_TAKEN`)
- [x] Inventory: hide a product → its card disappears from the storefront search (2 hrefs → 1; the announcement banner link correctly remains); unhide restores it
- [x] Coupons page loads via its sidebar entry (คูปองส่วนลด)
- [x] Limited roles see only their sidebar items and get 403 on the other role's APIs
- [x] After 15 min, admin APIs return 401 → re-login works
- [x] Change password: wrong current pw rejected (400); short pw rejected (400); success returns `sessionsRevoked: true`, old refresh token then 401 on refresh, old password rejected, new password works
- [x] **Remember-me unchecked:** DB session row TTL = 12h; firing `pagehide` clears both tokens; reopening the tab lands on the login page
- [x] **Remember-me checked:** DB session row TTL = 30.0 days; `pagehide` does NOT clear tokens; reload keeps the dashboard session
- [x] Logout resets the remember flag (`nk_admin_remember` back to `0`)
      (verified live 2026-09-20 through the real login → TOTP → dashboard flow)
