# Admin Login — Test Guide

How to test the admin panel login flow on Nong-Kati, including every failure
case it is designed to handle.

- **Login page (local dev):** `http://localhost:4200/management/login` (or whichever port `npm run dev` prints)
- **Login page (production):** `https://nong-kati.vercel.app/management/login`
- **Implementation under test:** `src/api/adminAuth.ts` (login logic) and
  `src/lib/jwt.ts` (TOTP verify + JWT signing)

> **Status: MOCK AUTH.** Accounts, sessions and lockouts live in server memory
> (`adminAuth.ts` maps), not the database. A server restart resets everything —
> failed-attempt counters, lockouts, and sessions. Real DB-backed auth with
> hashed passwords is planned for M6.

---

## 1. Credentials

| Field | Value | Note |
|---|---|---|
| Email | `admin@nong-kati.co.th` | Only seeded account, role `super_admin` |
| Password | `admin123` | Plaintext compare (mock) |
| 2FA code | `123456` | Fixed test code — the login page displays it as a hint |

If the login page shows the "รหัสสำหรับทดสอบ: 123456" hint, you are on the
mock TOTP path. Any other 6-digit code is rejected with `TOTP_INVALID`.

---

## 2. Happy path (UI)

1. Go to `/management/login`.
2. Enter the email + password above → **เข้าสู่ระบบ**.
3. The page switches to the **ยืนยันตัวตน** step (6-digit code).
4. Enter `123456` → **ยืนยัน**.
5. Expected: redirect to `/management/dashboard`, and
   `localStorage.nk_admin_access_token` + `nk_admin_refresh_token` are set.

**Pass criteria:** dashboard renders with the sidebar (แดชบอร์ด, สินค้า, …)
and the header shows "Founder / Super Admin".

## 3. Session behavior after login

- **Access token TTL: 15 minutes.** After that, admin API calls return
  `401 UNAUTHENTICATED` and admin pages' data loads start failing until you
  log in again. This is by design; the UI does not auto-refresh yet.
- **Refresh token TTL: 30 days** (stored, but no auto-refresh flow wired).
- Tokens live in `localStorage` — clearing site data logs you out.

To check expiry manually, paste in the browser console:

```js
const t = localStorage.getItem('nk_admin_access_token');
const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
console.log('expired:', p.exp * 1000 < Date.now(), 'role:', p.role);
```

---

## 4. Failure cases to exercise

| # | Scenario | Steps | Expected result |
|---|---|---|---|
| 1 | Wrong password | valid email + wrong password | Error "อีเมลหรือรหัสผ่านไม่ถูกต้อง"; counter increments |
| 2 | Unknown email | any password | Same invalid-credentials error (no account enumeration) |
| 3 | Account lockout | 5 consecutive wrong passwords | 6th attempt returns lock message with retry minutes; status `locked` for 30 min |
| 4 | Wrong TOTP | correct email+password, then `000000` | "รหัสยืนยันไม่ถูกต้อง"; remains on 2FA step |
| 5 | Expired challenge | wait > 5 min after step 1, then enter TOTP | `TOKEN_INVALID`; must start over |
| 6 | Deactivated account | (set `status: 'deactivated'` in code) | `ACCOUNT_DEACTIVATED` error |
| 7 | Empty inputs | submit blank form | HTML5 required validation blocks submit |

Reset between runs: restart the dev server (in-memory state clears), or wait
out the 30-minute lockout.

## 5. What login unlocks (smoke test)

After logging in, confirm each admin page loads its real data:

| Page | Should show |
|---|---|
| `/management/dashboard` | Stat cards, sales summary |
| `/management/products` | All 37 real DB products with images, edit + archive buttons |
| `/management/settings` → แถบประกาศ | Current announcement from DB, editable |
| `/management/settings` → ธีมและแอนิเมชัน | 6 accent swatches + 4 speed presets + live preview |
| `/management/settings` → ร้านค้า | Store-info form (name, phone, email, LINE, Facebook) |
| `/management/orders` | Orders list |

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

The login is currently a client-side flow (`adminLogin` runs in the browser
bundle, not an HTTP endpoint), so scripted UI testing should drive the page.
With Playwright, for example:

```ts
await page.goto('http://localhost:4200/management/login');
await page.fill('input[type="email"], input:not([type])', 'admin@nong-kati.co.th');
await page.fill('input[type="password"]', 'admin123');
await page.click('button:has-text("เข้าสู่ระบบ")');
await page.fill('input[placeholder*="6 หลัก"]', '123456');
await page.click('button:has-text("ยืนยัน")');
await page.waitForURL('**/management/dashboard');
```

## 7. Known limitations (mock phase)

- No real TOTP — the code is always `123456`; the page prints it as a hint.
- Password stored/compared in plaintext; no hashing yet.
- Lockout state is per-server-process and resets on redeploy/restart.
- No "forgot password" flow; no email verification.
- Admin APIs are guarded by JWT permission checks (`settings:write`,
  `products:write`, …) — role `super_admin` has all permissions. Other roles
  (`catalogue_manager`, `order_manager`, …) exist in the RBAC matrix but have
  no seeded accounts.

## 8. Checklist (print-friendly)

- [ ] Happy path: login → 2FA → dashboard
- [ ] Token appears in localStorage
- [ ] Wrong password shows Thai error, no lock on 1st try
- [ ] 5 wrong passwords lock the account for 30 min
- [ ] Wrong TOTP code rejected
- [ ] Logged-out admin API returns 401; forged token 403
- [ ] Products page lists 37 DB products
- [ ] Settings tabs save and persist (announcement, theme, store info)
- [ ] After 15 min, admin APIs return 401 → re-login works
