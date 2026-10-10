# Quality Gates — Nong-Kati

คู่มือรวม quality gates ทั้งหมดของโปรเจกต์: แต่ละ gate **enforce อะไร**, **อยู่ไฟล์ไหน**, **รันยังไง** และ **แก้อย่างไรเมื่อแดง**

> ทุก gate ถูกทดสอบด้วย negative control แล้ว (ฉีด violation ปลอมเข้าไป → ต้องแดงทันที) และ scanner ของ gate ที่รันบน browser มี control ในตัว self-verify ทุกครั้งที่รัน

---

## ภาพรวม

| #     | Gate                                                  | ไฟล์ test                          | ตัวรัน               | CI job                 |
| ----- | ----------------------------------------------------- | ---------------------------------- | -------------------- | ---------------------- |
| R1–R6 | Design-token / duplicate-ID (static source scan)      | `tests/design-token-gates.test.ts` | `npm test` (vitest)  | Unit Tests             |
| A     | Admin authz matrix (53 endpoints × no-auth + 6 roles) | `tests/admin-authz-matrix.test.ts` | `npm test`           | Unit Tests             |
| P     | PII masking (permission-scoped response)              | `tests/admin-pii-masking.test.ts`  | `npm test`           | Unit Tests             |
| W     | Coupon per-customer cap, wallet path (Serializable + P2034 retry) | `tests/wallet-coupon-race.test.ts` | `npm test` (vitest) | Unit Tests |
| C     | Concurrency (DB races — refresh CAS, lockout)         | `tests/admin-concurrency.test.ts`  | vitest + live server | Concurrency (DB races) |
| S1    | Admin auth-mutation CSRF (origin + double-submit)      | `tests/admin-csrf.test.ts`          | `npm test` (vitest)  | Unit Tests             |
| S2    | Webhook signature length-safe + production review fixes | `tests/security-fixes.test.ts`     | `npm test` (vitest)  | Unit Tests             |
| S3    | Secrets fail closed in prod, entropy floor, magic-link deliverability | `tests/security-remediations.test.ts` | `npm test` (vitest) | Unit Tests |
| S4    | Same-origin redirect sanitiser                        | `tests/safe-redirect.test.ts`       | `npm test` (vitest)  | Unit Tests             |
| I1    | Identity hardening (logout invalidation, atomic fail counters, PDPA persist) | `tests/identity-hardening.test.ts` | `npm test` (vitest) | Unit Tests             |
| I2    | Lockout / lockout-expiry boundaries                   | `tests/lockout-expiry.test.ts`     | `npm test` (vitest)  | Unit Tests             |
| PR    | Password reset — single-use token claim, revocation    | `tests/password-reset.test.ts`     | `npm test` (vitest)  | Unit Tests             |
| O1    | Phone OTP sign-in (pure logic, no DB/network)          | `tests/phone-otp.test.ts`          | `npm test` (vitest)  | Unit Tests             |
| M1    | Manual-transfer settings validator (incl. bank-QR URL allowlist) | `tests/manual-transfer-settings.test.ts` | `npm test` (vitest) | Unit Tests             |
| AE    | Admin email test — fake SMTP + SSRF guard             | `tests/admin-email-test.test.ts`    | `npm test` (vitest)  | Unit Tests             |
| SA    | Staff audit hardening (crypto temp password, tx-scoped audit) | `tests/staff-audit-hardening.test.ts` | `npm test` (vitest) | Unit Tests             |
| X1    | JSON-LD XSS escaping                                  | `tests/jsonld-xss.test.ts`         | `npm test` (vitest)  | Unit Tests             |
| D1    | Client-doc drift — 20 gates over 4 docs               | `tests/client-docs-consistency.test.ts` | `npm test` (vitest) | doc-consistency        |
| F1    | E2E fixture images are real, complete, non-degenerate | `tests/test-fixture-images.test.ts` | `npm test` (vitest)  | Unit Tests             |
| CF    | Client-feedback round 2 (out-of-stock, CSP blob:, Slip2Go) | `tests/client-feedback-fixes.test.ts` | `npm test` (vitest) | Unit Tests             |
| Q1    | This inventory itself — every tests/ file is documented | `tests/quality-gates-coverage.test.ts` | `npm test` (vitest) | Unit Tests             |
| RF    | Admin refund — authz, validation, atomic Refund+void+audit | `tests/admin-refund.test.ts`       | `npm test` (vitest)  | Unit Tests             |
| RL    | Customer resend-email cap (3/order/hour, no quota burn on a failed email match) | `tests/customer-resend-rate-limit.test.ts` | `npm test` (vitest) | Unit Tests |
| AR    | Admin resend-email — error contract (EMAIL_SEND_FAILED, not a transport string) | `tests/admin-resend-email.test.ts` | `npm test` (vitest) | Unit Tests |
| CE    | CI env secrets meet the minimums the code enforces | `tests/ci-env-secrets.test.ts`   | `npm test` (vitest)  | Unit Tests             |
| NB    | Navbar layout — nav keeps natural width, search yields (no one-glyph-per-line Thai) | `tests/navbar-layout-gates.test.ts` | `npm test` (vitest) | Unit Tests             |
| CK    | Combobox keyboard — arrow nav, aria-activedescendant, Enter fallthrough (WCAG 2.1.1) | `tests/combobox-keyboard.test.ts` | `npm test` (vitest) + `e2e/smoke.spec.ts` | Unit Tests + Browser Smoke |
| NV    | Admin sidebar IA — 17 items → 7 sections, narrow `dashboard:read`, route preservation | `tests/admin-nav-sections.test.ts` | `npm test` (vitest) | Unit Tests |
| HM    | Production health monitor — idle reap vs unexpected restart, alert threshold, CLI flag mapping, workflow wiring | `tests/prod-health-monitor.test.ts` | `npm test` (vitest) | Unit Tests + Production Health Monitor |
| CC    | Coupon cap under REAL concurrency (8 simultaneous claims) | `tests/coupon-cap-concurrency.test.ts` | vitest + live server | **(ยังไม่ต่อ CI — ดูหัวข้อข้างล่าง)** |
| TA    | Training deliverable — page restates no manual fact, beats match SRT, no cue overlap | `tests/admin-training-artifacts.test.ts` | `npm test` (vitest) | Unit Tests |
| RH    | Restock-account how-to — every staff-facing claim pinned to the route/dialog/role matrix | `tests/admin-restock-howto.test.ts` | `npm test` (vitest) | Unit Tests |
| EX    | Unpaid-order expiry sweep — CAS safety, batching, no stock side effects, cron-route gating | `tests/order-expiry-sweep.test.ts` | `npm test` (vitest) | Unit Tests |
| CSO   | Stock-aware catalog — availability leads every sort, available-only filter, slice of one global order | `tests/catalog-stock-ordering.test.ts` | `npm test` (vitest) | Unit Tests |
| SP    | Stock-text parsing — CRLF/LF, blank lines, Unicode/emoji, separators, multiline, invalid input | `tests/stock-parser.test.ts` | `npm test` (vitest) | Unit Tests |
| PP    | Pricing persistence — coupon/VAT allocation, preview parity, promotion snapshots | `tests/pricing-persistence.test.ts` | `npm test` (vitest) | Unit Tests |
| PS    | Promotion percent/fixed discounts, timing/scope/minimum-spend, and no coupon stacking; coupon-only checkout remains available | `tests/promotion-stacking.test.ts` | `npm test` (vitest) | Unit Tests |
| VD    | VAT inclusive display, disabled state, configurable rate | `tests/vat-display.test.ts` | `npm test` (vitest) | Unit Tests |
| RL2   | Rate-limit rule table — checkout reads (`orders/preview`, `orders/vat`) ต้องมี bucket ของตัวเอง 60/min ไม่ให้ share กับ rule สร้างออเดอร์ 10/min (มิฉะนั้น preview ที่ยิงทุกครั้งที่แก้ตะกร้าจะทำให้ `POST /orders` จริงโดน 429 กลาง checkout — คว่ำโดย Browser Smoke gate) + rule เฉพาะต้องอยู่ เหนือ rule รวม ในตาราง เพราะ prefix match เจอตัวแรกก่อน | `tests/rate-limit-rules.test.ts` | `npm test` (vitest) | Unit Tests |
| IU    | Admin image upload 5 MB byte limit, dimensions, and pixel-area limits | `tests/image-upload-validation.test.ts` | `npm test` (vitest) | Unit Tests |
| DS    | Discord webhook is environment-only; legacy DB value is ignored | `tests/discord-secret-config.test.ts` | `npm test` (vitest) | Unit Tests |
| SI    | Store contact settings persist a configurable HTTPS LINE URL | `tests/store-info-settings.test.ts` | `npm test` (vitest) | Unit Tests |
| PN    | Customer promotion alerts include discount, conditions, expiry, description, and item links | `tests/promotion-notifications.test.ts` | `npm test` (vitest) | Unit Tests |
| RP    | Recommended catalog includes only active, admin-featured products | `tests/recommended-products.test.ts` | `npm test` (vitest) | Unit Tests |
| GC    | Stored accounts + manual assignment to an order — audited reveal, atomic void, masked list; declared-vs-built route ratchet | `tests/admin-stored-accounts.test.ts` | `npm test` (vitest) | Unit Tests |
| FP    | Forced password change — never looks like a permissions problem; layout redirect cannot loop | `tests/admin-forced-password-change.test.ts` | `npm test` (vitest) | Unit Tests |
| PP    | Pricing persistence — seven-blocker coverage (VAT satang allocation across lines, snapshot sums reconcile to order totals) | `tests/pricing-persistence.test.ts` | `npm test` (vitest) | Unit Tests |
| E1    | Disabled-state affordance (WCAG 1.4.1)                | `e2e/disabled-state.spec.ts`       | `npm run test:e2e`   | (local/preview)        |
| E2    | No hardcoded white in dark mode                       | `e2e/no-hardcoded-white.spec.ts`   | `npm run test:e2e`   | (local/preview)        |
| E3    | Duplicate DOM ids (ทั้งไซต์ผ่าน sitemap)              | `e2e/duplicate-ids.spec.ts`        | `npm run test:e2e`   | (local/preview)        |
| E4    | Text contrast ≥ 4.5:1 (WCAG 1.4.3)                    | `e2e/contrast.spec.ts`             | `npm run test:e2e`   | (local/preview)        |
| E5    | Touch targets 44px + stats consistency                | `e2e/touch-targets.spec.ts`        | `npm run test:e2e`   | (local/preview)        |
| E6    | Admin refund + resend controls on the order detail modal | `e2e/order-refund-resend.spec.ts` | `npm run test:e2e`   | **Browser Smoke** (run ใน CI ด้วย) |
| E7    | Admin order search / customer history / delivery reveal — masked vs full PII, cancel-path, allowed + denied roles | `e2e/admin-search-history-reveal.spec.ts` | `npm run test:e2e` | **Browser Smoke** (run ใน CI ด้วย) |

**วิธีรัน:**

```bash
npm test                        # static gates R1–R6 + authz matrix + PII (concurrency skip ถ้าไม่มี server)
npm run test:e2e                # Playwright gates ทั้งหมด (ต้องมี dev/build server ก่อน)
npx vitest run tests/design-token-gates.test.ts        # รันเฉพาะ R1–R6
npx playwright test e2e/contrast.spec.ts               # รันเฉพาะ spec เดียว
```

Playwright เลือก target ตาม `E2E_BASE_URL` > localhost:4200 (dev) > :3000; ต่อ prod build เร็วกว่า dev หลายเท่า

---

## Static gates (vitest — จับตอนพิมพ์ ไม่ต้องเปิด browser)

ไฟล์เดียว: `tests/design-token-gates.test.ts` — สแกน raw text ของทุกไฟล์ `.ts/.tsx` ใน `src/` (ข้าม comment lines) แล้ว enforce 6 กฎ กฎไหนโดนจะรายงาน `file:line + ข้อความบรรทัดนั้น` กลับมาใน assertion message พร้อมคำแนะนำ

### R1 — ห้าม coral text บนพื้นสว่าง (light scope)

- **กฎ:** `text-coral-*` ทุก shade วัดได้แค่ 2.6–4.1:1 บน cream/white (ต่ำกว่า AA) ข้อความ error ต้องใช้ semantic token `text-fg-error` อนุญาตเฉพาะ `dark:text-coral-200|300|400` (ผ่าน 4.5:1 บนพื้น cocoa)
- **Violation ตัวอย่าง:** `<p className="text-coral-500">ไม่พบคำสั่งซื้อ</p>`
- **วิธีแก้:**
  - ข้อความ error → `text-fg-error`
  - ต้องการ coral จริงใน dark → `dark:text-coral-200` (เฉพาะ 200/300/400)
  - เป็น lucide icon ตกแต่ง (ไม่ใช่ text — WCAG 1.4.3 คุมข้อความ ไม่คุม stroke) → เพิ่ม allowlist entry ใน `ALLOWLIST` (rule `R1` + `file` + `content` เป็น substring ของบรรทัด + `why`) — ห้าม allowlist แบบไฟล์ทั้งไฟล์

### R2 — coral tint fill ต้องคู่ `text-fg-error`

- **กฎ:** `bg-coral-50…500` รวม alpha (`bg-coral-50/60`) ถ้าไม่มี `text-fg-error` ใน **บรรทัดเดียวกัน** = fail (coral-on-coral วัด 1.9–3.3:1)
- **Violation ตัวอย่าง:** `card: 'bg-coral-50 border-coral-200'` โดยข้อความบนการ์ดไม่ได้ผูก fg-error
- **วิธีแก้:**
  - ใส่คู่กันใน rule เดียว: `bg-coral-50 text-fg-error`
  - fill กับ text อยู่คนละบรรทัด (เช่น `STATUS_CONFIG` แยก `bgClass`/`textClass`) หรือ fill นั้นไม่มี text → เพิ่ม allowlist entry rule `R2` พร้อม `why`

### R3 — ห้าม `text-white` บน `bg-coral-50…600`

- **กฎ:** white บน coral อ่อน/กลาง < 4.5:1 เฉพาะ `bg-coral-700` ขึ้นไปที่ white ผ่าน (เคสต้นทาง: cart badge white บน coral-500 = 2.89:1 → coral-700 = 5.42:1) — **ไม่มี allowlist สำหรับกฎนี้**
- **วิธีแก้:** เปลี่ยน fill เป็น `bg-coral-700` หรือเข้มกว่า ถ้ายังอยากได้ tone อ่อน ให้ข้อความเป็น `text-fg-error` บน tint (ดู R2)

### R4 — `disabled:` ห้ามแต่งด้วย brand

- **กฎ:** ห้าม `disabled:bg-peach-400/500/600` และห้าม `disabled:shadow-brand-glow` / `disabled:shadow-clay-brand` — disabled ที่หน้าตาเหมือน CTA หลักทำลาย affordance (WCAG 1.4.1)
- **วิธีแก้:** disabled ใช้ muted surface (เช่น `bg-surface` + `text-clay-600` — อ้างอิงสถานะจริงของปุ่ม submit หน้า lookup) และถ้า disabled state เขียนแบบ ternary (ไม่มี `disabled:` utility เลย) R4 จับไม่ได้ — ตัวจับจริงคือ gate E1 ด้านล่าง ต้องผ่านทั้งคู่

### R5 — ห้าม `bg-white` hardcoded

- **กฎ:** `bg-white` (รวม `bg-white/80`) ห้ามปรากฏใน `src/` ทุกไฟล์ ยกเว้น 2 ไฟล์ใน `HARDCODED_WHITE_FILES`:
  - `src/components/checkout/PromptPayQR.tsx` — quiet zone ของ QR ต้องขาวจริงเพื่อให้ scanner อ่านได้ทุกธีม
  - `src/components/checkout/TaxInvoiceToggle.tsx` — knob สวิตช์ white-on-track
  - และไฟล์ allowlist ต้องมี marker `data-allow-hardcoded-white` ใน JSX ด้วย (ลบ marker เงียบ ๆ = gate กลับมาแดงทันที)
- **ที่มา:** `/orders/lookup` เคยใช้การ์ด bg-white ตายใน dark mode (label 1.35:1)
- **วิธีแก้:** ใช้ `bg-surface` ถ้าขาวจำเป็นจริง ให้ย้าย element เข้าไฟล์ allowlist เดิม หรือเพิ่มไฟล์ใหม่ใน `HARDCODED_WHITE_FILES` พร้อมเหตุผล + ใส่ marker — ต้องผ่าน gate E2 (rendered) ด้วยจึงจะสมบูรณ์

### R6 — ห้าม literal `id="..."` ใน `src/components`

- **กฎ:** ทุก `.tsx` ใต้ `src/components/` ห้ามเขียน `id="literal"` — ต้อง derive จาก `useId()` (`id={expr}` ผ่านหมด) ยกเว้น 4 ไฟล์ใน `HARDCODED_ID_FILES`: `ClayIconDefs.tsx` (registry gradient — id คือหน้าที่ของไฟล์), `app/layout.tsx`, `account/layout.tsx`, `FacebookLayout.tsx` (landmark ของ layout ที่ mount ครั้งเดียว) — เทียบแบบ suffix match
- **ที่มา:** `/orders/lookup` mount ฟอร์มแฝงสองชุด ทำ `#lookup-order` ซ้ำ → label/aria พัง
- **วิธีแก้:** `const id = useId()` แล้วอนุพันธ์ `input/forgot/error` ids จากมัน (ดูตัวอย่างจริงใน lookup form) — page files (`src/app/**`) ใช้ literal id ได้เพราะ mount ครั้งเดียว และมี gate E3 ตรวจ rendered reality ทั้งไซต์อยู่แล้ว

---

## Authz matrix — `tests/admin-authz-matrix.test.ts`

- **กฎ:**
  1. **Coverage บังคับ:** สแกน `src/app/api/v1/admin/**/route.ts` จริง — ทุก method ของทุก endpoint ต้องมี row ใน `ROUTE_COVERAGE` **endpoint ใหม่ที่ลืมเพิ่ม row จะทำ suite แดงทันที** (authorization ลืมไม่ได้)
  2. ไม่มี Authorization header → **401 เป๊ะ** ทุก endpoint
  3. แต่ละ role ทั้ง 6 (จาก `ROLE_PERMISSIONS` ใน `src/types/auth.ts`): ไม่มี permission ของ endpoint → **403 เป๊ะ**; มี permission → **ห้าม 401/403** (หลัง gate ขอให้พังก็ได้ — prisma ถูก mock ให้ throw เพื่อพิสูจน์ว่าผ่าน gate มาแล้ว)
- **หลักการสำคัญ:** expected result **derive** จาก `ROLE_PERMISSIONS` ไม่ใช่เขียนมือ — matrix จึงเลื่อนตาม RBAC ต้นทางเสมอ token เป็น JWT จริง (ผ่าน `verifyAdminJwt` รวม live role/status check) และ handler ถูกเรียก in-process ไม่มี HTTP server
- **วิธีแก้เมื่อแดง:**
  - `endpoints missing from the authz matrix` → เพิ่ม row `{ method, path, perm, body? }` (body ใส่ JSON ขั้นต่ำให้ handler ถึง guard ก่อน validation) เช่น route ที่กำลังจะเพิ่ม `POST /settings/email-test` → `{ method: 'POST', path: '/settings/email-test', perm: 'settings:write', body: {} }`
  - `→ 200/500, expected 403` → route นั้นเรียก `checkPermission` ด้วย permission ผิด หรือลืมเรียก
  - `→ 401, gate must pass` → token/role ถูกต้องแต่ guard ดีดกลับ — มักเป็นการเช็ค role ตรง ๆ แทนที่จะเช็ค permission

## PII masking — `tests/admin-pii-masking.test.ts`

- **กฎ:** endpoint เดียวกันคืนข้อมูลต่างกันตาม permission:
  - โดยปกติ role ที่ไม่มี `customers:read:full` / `orders:read:full` → ต้องได้ **masked**: `s***@gmail.com`, `08****78`, และใน topups **ต้องไม่มี key `customerName` อยู่เลย**
  - role ที่มี permission ดังกล่าว → ต้องได้ raw ครบ
- **คลุม (8 surface):** `GET /customers` (list + [id]), `GET /orders` (list + [id]), `GET /topups`, **`GET /dashboard` (topCustomers + recentOrders)**, **`GET /reports/customer-sales` (JSON)** และ **`GET /reports/customer-sales/export` (CSV — mask ในไฟล์ที่ดาวน์โหลดจริง)**
- **เคส CSV สำคัญ:** `finance_viewer` มี `reports:export` (ดาวน์โหลดได้) แต่ไม่มี `customers:read:full` → ไฟล์ CSV ที่ได้ต้องมีแค่ `s***@gmail.com` และ **ห้ามมี raw email/ชื่ออยู่เลย** — พิสูจน์ว่า mask เกิดก่อนเขียนไฟล์ ไม่ใช่แค่หน้าจอ ส่วน role ที่มี read:full ได้ CSV แบบ raw + มี BOM (ตรวจจาก bytes เพราะ `Response.text()` ตัด BOM ตาม spec)
- **CSV formula-injection guard:** ทุก cell ผ่าน `isFormulaInjection` (นำหน้าด้วย `= + - @ TAB CR` จะโดน prefix `'`) — customer-controlled strings (ชื่อ/อีเมล) จึงปลอดภัยเมื่อเปิดใน Excel/Sheets (unit-tested ผ่าน `lib/reports/customerSales`)
- **สถาปัตยกรรม:** JSON กับ CSV ผ่าน `aggregateCustomerSales` + `maskCustomerSalesRows` ฟังก์ชันเดียวกันใน `lib/reports/customerSales` — ห้ามแยก masking ออก ไม่อย่างนั้น CSV หลุด
- **ข้อควรระวังเรื่อง RBAC:** `support_agent` และ `order_manager` **ไม่มี** `reports:read` → 403 ที่ dashboard/customer-sales (สัญญานั้นเป็นของ authz matrix); masked-role ที่ถึงรายงานเหล่านี้ได้จริงคือ `finance_viewer` / `marketing_manager`
- **วิธีแก้เมื่อแดง:**
  - masked role เห็น raw → route หลุด branch ตรวจ permission `*:read:full` (หรือลืม mask ฟิลด์ใหม่) — กลับไปใช้ `maskEmail`/`maskPhone` จาก `lib/rbac` ตาม branch เดิม
  - full role โดน mask → permission หลุดจาก `ROLE_PERMISSIONS` หรือเงื่อนไขใน route ชี้ role ผิด (ดูเคสจริง: เรียก `maskEmail` แบบไม่มีเงื่อนไขหลัง import จาก rbac = raw role โดน mask ด้วย)
  - CSV แดง → mask ต้องเกิดใน `maskCustomerSalesRows` **ก่อน** `toCustomerSalesCsv` — ห้าม bypass lib

## Concurrency — `tests/admin-concurrency.test.ts`

- **เงื่อนไขรัน:** ต้องมี live dev server ผ่าน `NK_TEST_BASE_URL` (เช่น `http://127.0.0.1:4200`) — ไม่มีตัวแปร = **skip ทั้งไฟล์** เพื่อให้ `npm test` ในเครื่องสะอาด รันจริงเฉพาะ CI job `Concurrency (DB races)` ที่ปั้น Postgres 16 + `prisma migrate deploy` + `next dev -p 4200` ให้เอง
- **กฎ (real HTTP, real DB, parallel จริง):**
  1. Refresh token เดียว × 20 concurrent refreshes → ได้ 200 **พอดี 1** (CAS rotation, first-writer-wins), อีก 19 ต้อง 401 `TOKEN_INVALID`, DB จบด้วย session ที่ยังไม่ revoke **พอดี 1**
  2. 20 tokens ต่างกัน × 20 refreshes → **ทุกตัว 200** และแต่ละตัว revoke เฉพาะแถวตัวเอง (พิสูจน์ว่าข้อ 1 เป็น locking ที่ถูกต้อง ไม่ใช่ over-revocation)
  3. รหัสผ่านผิด × 10 concurrent → ทั้งหมด 401, account **lock พอดีหนึ่งครั้ง** (atomic guarded increment): จบด้วย `status=locked` + `lockedUntil` ในอนาคต + counter ถูก reset เหลือ 0 โดยตัว lock คนเดียว และหลัง lock รหัสถูกต้องก็ยังต้อง 401 `ACCOUNT_LOCKED`
  4. **lock หมดอายุแล้วต้อง lock ใหม่ได้** (audit #3): จำลอง `lockedUntil` ในอดีต + counter ค้าง → ยิงรหัสผิด 5 ครั้ง ต้อง re-lock (predicate เดิม `lockedUntil: null` ทำให้นับไม่เพิ่มหลัง lock แรกหมดอายุ = brute force ฟรี) — predicate ฝั่ง customer/admin ถูก assert เป๊ะ ๆ ใน `tests/lockout-expiry.test.ts` (vitest ปกติ)
- **วิธีแก้เมื่อแดง:** อย่าเปลี่ยน guarded `updateMany` (CAS) หรือ atomic increment กลับเป็น read-modify-write; seeding/cleanup ใช้ email ต่อท้าย run id กันชน — แดงซ้ำให้เช็คว่าไม่มี state ค้างจาก run ก่อนใน DB ทดสอบ

---

## E2E gates (Playwright — ตรวจ rendered reality)

ทั้งหมดใน `e2e/` รันด้วย `npm run test:e2e` workers=1 (dev compile), timeout 120s

### E1 — Disabled-state — `e2e/disabled-state.spec.ts` (12 tests)

- **กฎ:** สแกนหน้า `/`, `/search`, `/account/login`, `/orders/lookup` ทั้ง light/dark:
  1. ปุ่ม disabled ห้ามใส่ brand fill (ตระกูล peach: ตรวจ computed `backgroundColor` ด้วย (r,g) 251,146 / 249,115 / 234,88 / 194,65 / 154,52) หรือ brand glow (`shadow-clay-brand|brand-glow`)
  2. label ของปุ่ม disabled ต้องยังมองเห็น: contrast กับพื้นตัวเอง ≥ **2.0:1** (muted ได้ มองไม่เห็นไม่ได้)
  3. บน lookup: กรอกฟอร์มถูก → submit เปลี่ยน disabled→enabled ต้องต่างกันชัด (enabled = peach fill, disabled = ไม่มี fill/glow) และพิมพ์ผิดอีกรอบต้องกลับ disabled
- **วิธีแก้เมื่อแดง:** ternary styling ที่ทำ disabled เหมือน CTA → ใช้ muted tokens (จะโดน R4 กันไว้ตั้งแต่ source ถ้าเป็น `disabled:` utility); สี label จางเกิน → ขยับเป็น `text-clay-600` ขึ้นไป; ระวัง flip state ผ่าน `transition-colors` 180ms — gate รอ computed bg settle ให้แล้ว อย่าแก้โดยลบ transition

### E2 — No hardcoded white (dark) — `e2e/no-hardcoded-white.spec.ts` (6 tests)

- **กฎ:** สแกน 6 หน้า (home, search, login, register, lookup, privacy) ใน **dark mode**: ห้ามมี surface ที่ computed `backgroundColor` ขาวนวล (r,g,b ≥ 250) ทึบ (alpha ≥ 0.95) และใหญ่พอจะเป็น "การ์ด" (area ≥ 48×48) นอก subtree ที่มี `data-allow-hardcoded-white`
- **Control ในตัว:** ทุก run ฉีด div ขาว 2 ใบ (มี marker / ไม่มี) แล้ว **บังคับให้ scanner เจอพอดี 1 finding (ตัวไม่มี marker)** — scanner พังหรือ marker รั่ว = แดงทันที หน้าไหนว่างเปล่าจน scan ไม่เห็นอะไรก็ไม่มีทางผ่าน
- **วิธีแก้เมื่อแดง:** ใช้ `bg-surface`; ถ้าขาวจำเป็นจริง (QR quiet zone) ครอบ subtree ด้วย `data-allow-hardcoded-white` **และ** ไฟล์นั้นต้องอยู่ใน allowlist ของ R5 ด้วย — gate สองชั้นต้องพร้อมกัน

### E3 — Duplicate DOM ids — `e2e/duplicate-ids.spec.ts` (8 tests)

- **กฎ:** ทุก id ในหน้าต้องไม่ซ้ำ (WCAG 4.1.1 — label/aria พังเมื่อซ้ำ) คลุม: core pages (`/`, `/search`, `/orders/lookup`, `/account/login`, `/checkout`, `/legal/privacy-policy`) **+ crawl ทั้ง sitemap.xml** (ตอนยืนยันบน prod คลุม 58 URLs — product pages รวมอยู่) sitemap ล่มจะ fallback ใช้ core list
- **Control ในตัว:** ก่อน scan ทุกหน้า ฉีด element มี id 2 ตัว (ตัวหนึ่ง aria-hidden) แล้วบังคับให้ scanner รายงานเจอพอดี — scan ว่างไม่มีสิทธิ์ผ่าน
- **วิธีแก้เมื่อแดง:** ดู `owners` ใน report บอก tag ของทั้งคู่แล้วตามไปแก้ — component ต้องใช้ `useId()` (R6 กันไว้ที่ source); ถ้าซ้ำระหว่าง layout กับ component ให้ตัด literal ฝั่ง component; อย่าแก้ด้วยการตั้ง id สุ่มแบบ hardcode ใน render เพราะยังเสี่ยง twin mount

### E4 — Text contrast — `e2e/contrast.spec.ts`

- **กฎ:** text-bearing leaves ทุกตัวต้อง ≥ **4.5:1** คลุม `/`, `/search`, `/account/login`, `/account/register` **ทั้งสองธีม** + `/checkout` ขั้น contact ทั้งสองธีมโดย **seed cart จริง** ลง localStorage (`nk_cart:v2` + `nk_cart_session` — ไม่มี cart หน้า checkout เปล่า จะ scan ไม่เห็นอะไร)
- **วิธีแก้เมื่อแดง:** แก้ที่ token/class ให้ผ่านทั้งสองธีม (อย่า fix เฉพาะ side เดียว) — เคสดัง: ขาวนวลบนการ์ดขาวใน dark 1.06–1.4:1; ถ้าจำเป็นต้องแตะ token พื้นฐาน ให้รัน gate ชุดนี้ + E1 + E2 พร้อมกัน และระวัง page-transition fade 550ms (gate รอ 900ms ให้แล้ว)

### E5 — Touch targets + stats — `e2e/touch-targets.spec.ts`

- **กฎ:** ที่ viewport 390×844 — element ที่แตะได้ต้องมี box ≥ **40px** ส่วน controls ที่ audit กำหนดชัด (taskbar, ตะกร้าใน header, password toggle, consent actions) ต้อง ≥ **44px** (padding ขยาย hit area นับเป็นเป้าหมายได้) + homepage stats ห้ามโชว์ 0 ทั้งที่ catalogue มีสินค้า
- **วิธีแก้เมื่อแดง:** เพิ่ม padding/min-h ของปุ่มหรือ hit area แทนย่อไอคอน; stats แดง = ตัวนับดึงข้อมูลผิด source ให้แก้ที่ data ไม่ใช่ปิด band ทิ้ง

### E6 — Admin refund + resend (modal จัดการออเดอร์) — `e2e/order-refund-resend.spec.ts` (5 เคส)

ต่างจาก E1–E5 ตรงที่ **รันใน CI จริง** (job Browser Smoke) ไม่ใช่แค่ local เพราะสองปุ่มนี้คือสิ่งที่พนักงานกดตอนเงินผิดแล้ว — ถ้าคืนเงินแล้วออเดอร์ไม่เปลี่ยนสถานะ หรือกดส่งเมลแล้วได้ข้อความว่าส่งสำเร็จทั้งที่ไม่มีอะไรออกไป ผู้ใช้จะเจอมันใน production ไม่ใช่ใน PR

- **fixture ใหม่ `NK-…-RFND01`:** ออเดอร์สถานะ `completed` พร้อมโค้ด `delivered` 1 ใบ (เพิ่มใน `seed-management-smoke.mjs`) — ออเดอร์ค้างของ `management.spec.ts` ใช้แทนไม่ได้ เพราะคืนเงินได้เฉพาะจาก `completed` และปุ่ม resend ก็ render เฉพาะ `completed`/`refunded` ก่อนเพิ่ม fixture นี้สองปุ่มนี้ **ไม่มีอะไรให้กดจริง** ในเทสต์
- **ยืนยันจากฐานข้อมูล ไม่ใช่จากข้อความบนจอ:** UI ขึ้น “บันทึกแล้ว” ทันทีที่ endpoint ตอบ 200 สิ่งที่ต้องจริงคือแถว `Refund` + สถานะที่พลิกเป็น `refunded` + โค้ดเป็น `voided` + audit row `refund_issued` ที่ชี้ refund id เดียวกัน (audit เขียนใน transaction เดียวกัน)
- **5 เคส:** กดบันทึกโดยไม่ใส่เลขอ้างอิงเกตเวย์ → error ชัดเจนและ **ไม่มีอะไรเขียนลง DB** · บันทึกจริง (เว้นว่างยอด = ยอดรวม ซึ่งเคยพังเป็นส่ง `0`) · ออเดอร์ที่คืนแล้วซ่อนฟอร์มคืนเงินแต่ยังเหลือปุ่ม resend · resend รายงานว่า**ส่งไม่สำเร็จ**และไม่มีข้อความอ้างว่าส่งแล้ว · ยิง refund ซ้ำที่ endpoint เดิม → 409 `ALREADY_REFUNDED` และยังมีแถวเดียว
- **leg ของ resend คือ “ความล้มเหลวอย่างซื่อสัตย์”:** job นี้ตั้งใจไม่มี `NK_RESEND_API_KEY` และ `lib/email/resend.ts` fail-closed (audit #2) — ถ้าตั้ง key จริงในอนาคต เคสนี้จะ skip อัตโนมัติแทนที่จะเดา การคืนเงินที่ไม่มีผู้ให้บริการเมลถือว่าผ่านได้เพราะ**ไม่มีการโกหกว่าส่งสำเร็จ** ซึ่งคือสิ่งที่ต้องกันไว้มากกว่า
- **หมายเหตุ:** `sendEmailWithRetry` เดิน backoff 2s/4s/8s ตอนไม่มี credential (config error retry ไม่มีทางหาย) — ขานี้จึงใช้ timeout 60s และเวลารันเพิ่มราว 11s ต่อครั้ง
- **สถานะการรัน:** **รันผ่านแล้วใน CI** — run #90 (`70fb2e9`, 2026-10-03) ผ่านทุก step ของ job Browser Smoke รวมถึง `Seed management smoke fixtures` (fixture `RFND01` ใหม่) และ `Run browser smoke tests` บน production build + Postgres จริง ก่อนหน้านั้นยืนยันได้แค่ `tsc` / eslint / `playwright --list` / `node --check` เพราะเครื่อง dev ไม่มี Docker (ดูหัวข้อ CC) — **ยังรันในเครื่องนี้ไม่ได้** ถ้าแก้ spec ต้องดูผลจาก CI รอบถัดไปด้วยเสมอ

### E7 — Admin order search / customer history / delivery reveal — `e2e/admin-search-history-reveal.spec.ts` (5 เคส)

ต่อเนื่องจาก E6: สามเส้นทาง A1–A3 (`GET /orders/search`, `GET /customers/:id/history`, `GET /orders/:id/delivery`) เคยมีแค่ authz-matrix (unit) กับ denied-path smoke — CI เขียวได้โดยที่หน้าแอดมินไม่เคยเรียกมันเลย สเปกนี้ปิดช่องนั้นใน browser จริงต่อ production build + Postgres จริง เหมือน E6

- **สิทธิ์นำมาจาก fixture สองตัวใน `seed-management-smoke.mjs`** (ไม่ใช่ super_admin คนเดียว): `support_agent` (orders:read **masked** + customers:read + orders:delivery:reveal) เป็นขา **allowed** ทั้งสาม flow และ `finance_viewer` (orders:read:full แต่ไม่มี customers:read / reveal) เป็นขา **denied** — พิสูจน์ว่า behavior ขึ้นกับ permission ไม่ใช่ role ที่ล็อกอินอยู่
- **Fixture รหัส plaintext คงที่:** `mgmt-smoke-history@test.local` + ออเดอร์ `NK-…-HIST1` (completed, มีโค้ด delivered หนึ่งใบ, plaintext `HISTSMOKE-E2E-CODE-0001`) — รู้ plaintext จึง assert ได้ทั้งสองฝั่ง: โค้ด **โผล่เฉพาะหลัง reveal ที่ confirm แล้ว** และ **ไม่มีวันอยู่ในหน้า history** (รหัสสุ่มพิสูจน์อะไรไม่ได้)
- **5 เคส:** ค้นหาด้วยอีเมล/เลขออเดอร์โดยอีเมลถูก mask สำหรับ masked role + กรองที่ไม่เจอต้องล้างตารางจริง (ไม่ fallback รายการเต็ม) · history แสดงออเดอร์ + delivery status โดยไม่มี raw code · reveal ต้องผ่าน `window.confirm` — **ยกเลิก = ไม่ fetch ไม่เขียน audit row**, ยืนยัน = โค้ดขึ้นจริง + `order.delivery_revealed` row เพิ่มจริง (อ่านจาก DB เหมือน E6) · finance_viewer เห็น raw email ตอนค้น (orders:read:full) แต่ reveal โดน 403 ขึ้นข้อความ ไม่มีสิทธิ์ ไม่มีโค้ดหลุด ไม่มี audit row · history ที่ API: 200 โดยไม่มี code plaintext สำหรับ support_agent, 403 `INSUFFICIENT_PERMISSIONS` สำหรับ finance_viewer
- **ทำไม denied leg ของ history อยู่ที่ API ไม่ใช่ UI:** list กับ history ใช้สิทธิ์ `customers:read` ตัวเดียวกัน — ไม่มีบทบาท nàoเปิด list ได้แต่ history โดน 403; ทำ UI leg จะได้แค่ "list พัง" ซึ่งไม่ได้วัด gate ที่สเปกนี้มีอยู่
- **สถานะการรัน:** เพิ่มใน `Run browser smoke tests` ของ job Browser Smoke (ci.yml) — ผลจริงดูจาก CI รอบถัดไป ส่วน `tsc` / eslint / `playwright --list` รันในเครื่องตอนเพิ่มสเปก

---

## Audit-log atomicity — `tests/audit-atomicity.test.ts` (audit fix 2026-09-27)

- **กฎ (external audit #5 — High):** `writeAuditLog` เป็น **async ต้อง await** ทุก call site (CI lint/coverage ไม่มีทางลืมได้เพราะไม่ await = ไม่ได้ entry) โดย:
  - **ส่ง `tx`** → row เข้า **transaction ของ caller** แบบ awaited — mutation กับ evidence commit/rollback เป็นหน่วยเดียว (**insert fail = mutation ทั้งก้อน rollback**) — บังคับกับ mutation ที่ sensitive ทุกจุด: role change / staff deactivate / staff password reset / wallet adjust / password reset
  - **ไม่ส่ง `tx`** → insert เข้า global prisma แบบ awaited + ผูกกับ Next `after()` กัน serverless freeze; fail = log แต่ไม่ทำ action ล้ม (non-critical path)
- **เคส regression สองทิศทาง:** (1) audit insert fail ระหว่าง tx → ทั้ง mutation ต้อง reject (2) mutation สำเร็จ → audit ต้องถูกเขียนผ่าน tx client ก่อน transaction callback จบ — เคสเก่าที่ fire-and-forget จะแดงทันที; เคสที่เกี่ยวใน `password-reset.test.ts` / `staff-audit-hardening.test.ts` ก็ถูกย้ายไป assert ฝั่ง tx
- **audit #6 (2026-09-27) — token claim ต้องอยู่ใน tx เดียวกับ mutation:** `resetPasswordWithToken` ย้าย single-use claim (guarded `updateMany usedAt:null`) จากนอก transaction เข้าไปเป็น **write แรกใน tx เดียวกับการเขียนรหัสใหม่** — เคสเก่า crash ระหว่าง claim กับ tx เผาลิงก์ทั้งที่รหัสไม่เปลี่ยน แล้วต้องมี catch-release repair เป็นชั้นสอง; ตอนนี้ claim commit/rollback **พร้อม**หน่วย — tx fail = ลิงก์ยังใช้ได้ **โดยวิศวกรรม** (ไม่มี repair ให้ลืม) — test assert: claim เดินผ่าน tx client (global client ต้องไม่ถูกยิง), claim เรียงก่อน customer write, tx fail = **ไม่มี** updateAny บน global client (regression กลับไป repair-patch = แดง), blocked account ยังเผา claim เหมือนเดิม

## Email outbox — `tests/email-outbox.test.ts` + `tests/email-auth-honesty.test.ts` (audit fix #2, 2026-09-27)

- **กฎ (external audit #2 — Critical):** ห้ามมี "success ปลอม" ในระบบเมลอีกต่อไป ทั้งฝั่ง provider และฝั่ง API ต่อผู้ใช้:
  - **`lib/email/resend.ts` fail-closed** — ไม่มี `NK_RESEND_API_KEY`/`NK_RESEND_FROM_EMAIL` (หรือ key = `re_mock_key`) ทุก send คืน `{ success:false, error:'EMAIL_NOT_CONFIGURED:…' }` ทันที (ไม่ยิง network, ไม่ retry — config ไม่หายด้วยการ retry); **ลบ mock-mode ที่คืน `success:true, messageId:'mock_…'`** — dev/test ที่ต้องการ fake provider ต้อง inject ผ่าน vi.mock เท่านั้น
  - **Outbox tx-bound** — `enqueueEmail({ tx })` ต้องถูกเรียก **ใน transaction ของ caller** เหมือน `writeAuditLog`: แถวเมล commit/rollback พร้อมหน่วย business (จ่ายเงิน+โค้ด+สต๊อก+เมล = หนึ่งเดียว); idempotent ด้วย `idempotencyKey` unique (เช่น `code_delivery:<orderId>`) — pre-check ด้วย findUnique + backstop ด้วย **native upsert (ON CONFLICT DO NOTHING)** เพราะการ catch P2002 กลาง tx ของ Postgres จะทำ tx พิษทั้งก้อน; **enqueue fail = fulfilment ทั้งหน่วย rollback** (รอยเท้า audit-atomicity เดียวกัน)
  - **Delivery worker decoupled** — `processDueEmails` claim แบบ CAS (`pending→sending` guarded availableAt + re-claim แถว `sending` ที่ค้างเกิน 5 นาที = worker ตาย) → concurrent worker ส่งซ้ำไม่ได้; fail ต่อแถว = `attempts+1` + backoff 1/2/4…นาที; ครบ `MAX_OUTBOX_ATTEMPTS` = park `failed` พร้อม `lastError` (ไม่เคยหลุดเงียบ ๆ ไม่เคยปลอมว่าส่งแล้ว); trigger ผ่าน `scheduleOutboxDrain()` (Next `after()`) หลังทุก confirmation + cron ภายนอกยิง `POST /api/v1/internal/email-outbox/drain` (auth ด้วย `NK_CRON_SECRET` หรือ admin JWT; ไม่ตั้ง secret = 503 fail-closed)
  - **จุด enqueue:** `fulfilOrder` (จากนั้น 4 path ทั้งหมด — omise webhook / wallet / slip-verify / admin verify รวม recovery `pending_manual_fulfilment` ที่ resume แล้วก็ส่งเช่นกัน) + `scheduleOutboxDrain` หลัง commit ทุก path; slip-verify เลิกตอบ "ส่งโค้ดให้ทางอีเมลแล้ว" (เท็จ) → "ระบบกำลังจัดส่งโค้ดให้ทางอีเมล"
  - **Auth routes ตอบจริง** — magic-link/forgot-password: ส่งไม่ออก = **503 `EMAIL_DELIVERY_UNAVAILABLE`** (ไม่ตอบ 200 ปลอม) แต่ address ที่ไม่มีบัญชียังได้ 200 uniform เท่าเดิม (no enumeration)
- **เคส regression:** provider fail-closed (`re_mock_key` ไม่นับเป็น configured), enqueue ซ้ำ = no-op, race = upsert ไม่ duplicate, enqueue fail กลาง tx → fulfilment reject, worker fail → pending+backoff → failed+lastError, stale `sending` ถูก re-claim, แถวที่ยังไม่ถึง `availableAt` ไม่ถูกส่ง, route 503 เมื่อ delivery fail, drain endpoint ต้องมี token
- **งานค้างฝั่งคน (ทบทวนทุกครั้ง):** prod ยังไม่มี `NK_RESEND_API_KEY`/`NK_RESEND_FROM_EMAIL` ใน Vercel — ก่อนหน้านี้ระบบจะปลอมว่าส่งสำเร็จ ตอนนี้จะ fail-closed ตามธรรมชาติ: อีเมลทุกฉบับจะ **ค้าง pending ใน outbox พร้อม retry อัตโนมัติ** จนกว่าจะใส่ key จริง (ไม่มีแถวไหนหาย) — ใส่ key แล้ว drain จะส่งทุกฉบับที่ค้างให้เอง

## 2FA backup codes — `tests/admin-backup-codes.test.ts` (audit fix #9, 2026-09-27)

- **กฎ (external audit #9):** รหัสสำรอง 2FA ของแอดมินต้องเป็น recovery path จริง ไม่ใช่ของประดับ — เคสเก่า `setup2fa` generate 10 codes ส่งเข้า UI แต่**ไม่เก็บอะไรเลย** และ `confirm2fa` รับเฉพาะ TOTP 6 หลัก ตอนนี้:
  - **Hash-only at rest** — `AdminBackupCode` เก็บเฉพาะ SHA-256 ของรหัสแบบ normalize (ตัดช่องว่าง/ขีด, uppercase) plaintext มีอยู่ครั้งเดียวใน setup response; ทุก setup/regeneration **ลบชุดเก่าทิ้ง** (replace-any — hash ตายห้ามสะสมไว้ verify ได้)
  - **ใช้ตอนล็อกอินได้จริง** — `confirm2fa` รับ TOTP 6 หลัก **หรือ** รหัสสำรอง XXXX-XXXX (รูปทรงไม่ซ้นกัน — TOTP เป็นเลขล้วน รหัสสำรองมีตัวอักษร); การ consume เป็น **CAS เดียว** ด้วย guarded `updateMany` บน `codeHash + usedAt:null` → ใช้ได้ครั้งเดียวต่อหนึ่งรหัส, แพ้ race = ล็อกอินไม่สำเร็จ, รหัสที่ใช้แล้ว/ไม่รู้จัก = **เข้า 5-strike TOTP lockout เดิม** (รหัสหมดอายุต้องไม่กลายเป็น replay oracle)
  - **UI** — ช่อง 2FA รับได้ทั้งสองรูปแบบ (maxLength 9) + คำอธิบายชัดว่าใช้แทนรหัส 6 หลักได้ครั้งเดียว; route shape-check ยอมรับทั้งแบบมี/ไม่มีขีด
- **เคส regression:** เก็บ hash ไม่ใช่ plaintext, ชุดใหม่ลบชุดเก่า, consume ครั้งเดียว (ครั้งที่สอง fail), รหัสคนอื่นใช้ไม่ได้, `setup2fa` ต้อง persist (เคสเก่าที่โยนทิ้ง = แดง), confirm ด้วยรหัสสำรองที่ยังไม่ใช้ = session + สถานะ used, ใช้แล้ว/ผิด = lockout เดิม, TOTP ล้วนไม่แตะตารางรหัสสำรอง, challenge ถูกใช้ไป/บัญชี locked ต้อง fail ก่อน verification เสมอ
- **งานค้างฝั่งคน (ทบทวนทุกครั้ง):** แอดมินที่ enroll 2FA **ก่อน** commit นี้ยังไม่มีรหัสสำรองใน DB (เคสเก่าไม่เคยเก็บ) — เข้าสู่ระบบครั้งถัดไปยังใช้ TOTP ได้ปกติ; ถ้าต้องการรหัสสำรอง ให้ reset 2FA ผ่าน super-admin เพื่อ enroll ใหม่

## Recovery หลัง fulfilment fail — `tests/payment-recovery.test.ts` (audit fix #4, 2026-09-27)

- **กฎ (external audit #4):** เมื่อเงินถูกพิสูจน์แล้วว่าได้รับ (SlipOK ตรวจสลิปผ่าน / webhook แจ้ง charge.complete) แต่ confirmation tx fail และ **recovery tx ก็ commit ไม่ได้ด้วย** ห้ามกลืนความล้มเหลวแล้วตอบ 200 เด็ดขาด — เคสเก่า `.catch(() => undefined)` กลืนแล้วตอบ `pending_manual_fulfilment` ทั้งที่ order ยัง pending_payment + attempt ยัง pending + **ไม่มีร่องรอยอะไรเลย** (เงินหายจากระบบโดยไม่มีหลักฐาน):
  - **Recovery ต้อง awaited + ตรวจผลก่อนตอบ** — success-shaped response (200) ได้เฉพาะหลัง recovery commit จริง (verified ผ่าน outcome); ตอบ 200 โดยไม่รู้ผล = โกหก
  - **Recovery fail → 5xx + reconciliation record** — `recordPaymentReconciliation` (lib/paymentReconciliation.ts) เขียนแถว `AuditLog` action `payment_reconciliation_required` (actor system) พร้อม trigger/orderId/ref/attemptId/recoveryError — เงินที่พิสูจน์แล้วต้องไม่หายไร้ร่องรอย; ถ้าแม้แต่ record เขียนไม่ได้ = console.error ดัง ๆ เป็น trail สุดท้าย; route ตอบ `RECONCILIATION_REQUIRED` (500) หรือ `FULFILMENT_FAILED` (500) — ไม่มี success-shape
  - **ALREADY_CLAIMED ≠ failure** — แยก race ที่แพ้ออกจาก failure จริงด้วยการอ่านสถานะ order ปัจจุบัน: completed/pending_manual_fulfilment = มีคนจัดการแล้ว (ตอบตามสถานะ ไม่มี record), ยัง pending_payment = failure จริง → record + 5xx
  - **ครอบ 3 path:** slip-verify (recovery + unexpected-fulfilment-failure fallback), admin verify-payment (fresh + resume + unexpected fallback), omise webhook (retries 3 ครั้งหมด → record ก่อน return 200 ต่อ LD-10 — gateway ต้องได้ 200 แต่เราต้องมีหลักฐานฝั่งเรา)
- **เคส regression:** recovery commit → 200 + ไม่มี record, recovery fail → 500 `RECONCILIATION_REQUIRED` + แถว evidence พร้อม trigger/ref/error, ALREADY_CLAIMED race → 409 + ไม่มี record, unexpected failure → 5xx + record เสมอ, `recordPaymentReconciliation` เองต้อง never-throw
- **การตรวจฝั่งคน:** query แถวได้ด้วย `listReconciliationRecords()` (lib เดียวกัน) — ควรผูกเข้าหน้า admin audit viewer ถัดไป

## Real Omise/Opn adapter — `tests/omise-real-adapter.test.ts` (audit fix #1, 2026-09-27)

- **กฎ (external audit #1):** ต้องมี e-payment จริง ไม่ใช่ mock ตลอดชีวิต — adapter เดิม throw `Real Omise API not implemented` นอก mock mode ทำให้ prod PromptPay เป็น 503 ถาวร (ลูกค้าเหลือทางเดียวคือโอนเงิน+ส่งสลิป) ตอนนี้ implement จริงแล้ว:
  - **PromptPay charge** — `POST {base}/charges` แบบ form-encoded (Omise ไม่รับ JSON สำหรับ nested source): `amount` เป็น **สตางค์** (LD-11 server-authoritative), `source[type]=promptpay` inline, `metadata[order_number]`; QR PNG อยู่หลัง secret-key auth → adapter **ดาวน์โหลดเอง server-side** แล้วส่งเป็น data URI ให้ browser; pending charge ที่ไม่มี scannable_code = typed error ไม่ใช่ checkout พัง
  - **Card charge + refund** — `card=token` + `return_uri` (3DS ผ่าน `authorize_uri`), refund `POST /charges/{id}/refunds`
  - **Auth + errors** — HTTP Basic `skey_xxx:` server-only; typed errors `OMISE_NOT_CONFIGURED/OMISE_TIMEOUT/OMISE_NETWORK_ERROR/OMISE_API_ERROR` (แปะ failure_code จาก gateway) — ไม่มี naked fetch exception หลุดออกไป
  - **Webhook signature สองแบบ** — รับทั้ง modern `t=<unix>,v1=<hex>` (HMAC บน `t+rawBody` — แบบที่ Opn ส่งจริงปัจจุบัน) และ legacy plain-hex; malformed header = false เสมอ (review L8 คงเดิม); ห้ามลืม: mock mode ยังผ่อน signature — **ห้าม**เปิด `NK_PAYMENT_MOCK=true` ใน prod (constructor ก็ fail-closed อยู่แล้ว)
  - **initiate route** — มี key จริง → charge จริง; ไม่มี key ใน prod → constructor throw → 503 fail-closed เหมือนเดิม; `PAYMENT_UNAVAILABLE` (not-implemented gate) เก็บไว้แค่เผื่อ deploy เก่า
- **เคส regression:** charge body ถูกต้อง (satang/source/metadata/auth header), QR มาเป็น data URI, pending ไร้ scannable_code → typed error, 4xx → `OMISE_API_ERROR` พร้อม code, network fail → `OMISE_NETWORK_ERROR`, 3DS `authorize_uri`, refund path, signature ทั้งสองแบบรับ/ปฏิเสธถูกต้อง (รวม uppercase hex, tampered body, garbage), webhook payload normalization (charge.complete/failed/unknown/junk), **prod + NK_PAYMENT_MOCK=true ต้องเดิน real path** (offline-safe ผ่าน dead port → `OMISE_NETWORK_ERROR`)
- **Sandbox check (คนรัน):** `node tmp/omise-sandbox-test.js` ด้วย `NK_OMISE_SECRET_KEY`/`NK_OMISE_WEBHOOK_SECRET` sandbox keys + dev server — สร้าง charge จริง, ดาวน์โหลด QR (`DUMP_QR=1` เซฟไฟล์ไว้สแกนจ่ายจริงได้), ยิง webhook ทั้ง signature ถูก/ผิด; **คีย์จริงใส่ใน Vercel เท่านั้น: `NK_OMISE_SECRET_KEY`/`NK_OMISE_PUBLIC_KEY`/`NK_OMISE_WEBHOOK_SECRET`** (ต้องตั้ง webhook URL ใน dashboard ของ Opn ด้วย)

## Production-review patch (2026-09-27, หลัง audit #1–#9)

- **[High] JSON-LD XSS (`tests/jsonld-xss.test.ts`)** — `JSON.stringify` ธรรมดาไม่ปลอดภัยใน `<script>`: product name/description (ซึ่ง catalogue_manager เขียนได้) ที่มี `</script>` ปิด tag แล้ว execute บน public origin — ตอนนี้ทุก inline JSON-LD ผ่าน `serializeJsonLd()` (escape `<` `>` `&` U+2028/2029 เป็น `\uXXXX` หลัง stringify — ทำใน replacer จะ double-escape) JSON decode กลับได้ค่าเดิม แต่ไม่มีทางปิด tag; **ต่อยอดที่ควรทำ:** ย้าย admin refresh token ไป HttpOnly cookie + CSP enforce ไม่มี unsafe-inline
- **[Medium] slip-verify recovery ต้องผ่าน claim helper (`tests/jsonld-xss.test.ts` + `payment-recovery.test.ts`)** — recovery เดิม updateMany ตรง ข้าม `claimOrderForConfirmation` → ออเดอร์ที่มีส่วนลดแล้วเจอ stock ไม่พอ ถูก park โดยไม่จด usage (global/per-customer) → resume แล้วส่วนลดถูกใช้ซ้ำได้; ตอนนี้ recovery claim ผ่าน helper เดียวกันกับ normal path (จดคูปองครั้งเดียว) — static guard กัน re-inline bare updateMany
- **[High] RLS deny-by-default (`prisma/migrations/20260927200000_rls_baseline`)** — ตาราง app ทุกตัว (รวม GiftCode/AdminUser/tokens) `ENABLE ROW LEVEL SECURITY` + REVOKE จาก `anon`/`authenticated`/`supabase_realtime_admin` (guard การมี role เพราะ CI ใช้ Postgres ธรรมดา); **ไม่มี permissive policy ใด ๆ** — ทุก access ต้องไหลผ่าน Next API; **ไม่ใช้ FORCE** (จะผูก owner = role ที่ Prisma connect แล้วแอปพัง); CI concurrency job เพิ่ม step verify ว่าทุกตาราง rowsecurity=true และ client role ไม่มี privilege เหลือ
- **[Medium] Admin logout await revocation (`AdminTopBar.tsx`)** — เดิม fire-and-forget + navigate ทันที → refresh token ถูกขโมยยัง valid; ตอนนี้ await revocation (bounded 4s + keepalive) ก่อนเคลียร์ + navigate; ปุ่ม disabled ระหว่างทำ; ยังคงทำต่อ: ย้าย refresh token ไป HttpOnly cookie เพื่อปิดปัญหานี้ถาวร (รวมกับข้อ XSS ด้วย)
- **[Medium] Rate-limit degrade (ค้าง)** — ตาม report: high-risk routes ควร fail-closed/degraded เมื่อ shared limiter ตาย + แยก low-risk read ที่ fail-open ได้ — ยังไม่ทำ ต้องระวัง lockout ปลอมจาก limiter outage

## Production-review round 2 (2026-09-27, report ที่ faa515a) — `tests/review-fixes.test.ts`

- **[CRITICAL] Breadcrumb JSON-LD XSS** — รอบก่อน escape เฉพาะ `StructuredData` แต่ `Breadcrumb` ยังใช้ `JSON.stringify` ดิบ (`category` จาก attacker-controlled เข้า breadcrumb) — ปิดจบด้วย static guard ใน `tests/review-fixes.test.ts` ที่สแกนว่า **ห้ามมี `dangerouslySetInnerHTML={{ __html: JSON.stringify(` หลงเหลือ** ใน component ใด ๆ อีก; ตัวสแกนชุดนี้ต้องขยายเมื่อเพิ่ม JSON-LD ใหม่; **ค้างฝั่งโครงสร้าง:** admin refresh token ยังอยู่ localStorage (ต้องย้าย HttpOnly) และ CSP ยัง permit unsafe-inline
- **[High] เมลส่งโค้ดจริง** — `enqueueCodeDeliveryEmail(tx, order, delivered)` รับ plaintext codes จาก fulfilment แล้ว render ทุกโค้ด (template รับ `codes: string[]` ต่อบรรทัด); ลิงก์ใช้ `/orders/<confirmationUuid>` (id ภายใน = 404); `siteUrl()` fail-closed ใน production เมื่อไม่ตั้ง `NEXT_PUBLIC_SITE_URL` (เดิมตก localhost) — test assert ทั้ง codes/URL/id ใน outbox row
- **[High] coupon ห้ามกลืนเงินที่โอนแล้ว** — `claimOrderForConfirmation(..., { paidExternally: true })` สำหรับ path ที่เงินออกไปแล้วจริง (webhook จาก Opn / slip-verify / admin ที่ถือสลิป): coupon หมดอายุ/ถูกปิด/แพ้ usage race = **จด usage ตามจริง + log ดัง** แต่ไม่ throw (wallet/admin strict paths คงเดิม) — ทดสอบทั้ง strict/non-strict ครบ
- **[High] ประตูสร้าง order เป็น union** — Opn ตั้งค่าครบ **หรือ** manual transfer เปิด = สร้างได้ (เดิมต้องมี manual เสมอ → Opn-only ถูกล็อก); `isOpnConfigured()` probe แบบไม่ construct adapter; ไม่มีช่องทางเลย = 503 เหมือนเดิม
- **[High] webhook ตรวจ charge อิสระ** — signature ไม่ผ่าน ≠ ทิ้ง event อีกต่อไป: `retrieveCharge()` ดึง charge จาก Opn API แล้ว verify **livemode/amount/status** ก่อนใช้ (ตาม model ที่ Opn แนะนำ); payload จาก webhook ถูกแทนด้วยข้อมูลจาก source of truth; ปลอมไม่ได้ (id ไม่รู้จัก/ยอดไม่ตรง/livemode คลาด = discard)
- **[High] migration ติด deploy gate** — vercel `buildCommand` รัน `prisma migrate deploy` ก่อน build (ต้องมี `DATABASE_URL` แบบ direct ใน build env); migration ล้ม = deploy ล้ม
- **[Med] Build job depend ครบ** — `needs: [lint, test, audit, concurrency-tests]` — check ใดตก build (และ deploy ที่ตามมา) ไม่เกิด
- **ค้างต้องทำฝั่งคน/infra:** ย้าย admin refresh token → HttpOnly cookie; CSP enforce ตัด unsafe-inline; DNS `nong-kati.com`/`.co.th` (ยัง NXDOMAIN ทั้งคู่) + ตั้ง `NEXT_PUBLIC_SITE_URL` เป็น domain จริง; ยืนยันว่า Vercel Production ชี้ branch master; Upstash Redis ใน prod (rate limit ยัง degrade ต่อ instance); pin actions เป็น commit SHA; branch protection

## Cookie-backed admin sessions + hardening (2026-09-27, review round 3) — `tests/admin-cookie-session.test.ts`

**CRITICAL-1 ปิดสมบูรณ์ (HttpOnly cookies):** access/refresh token ของแอดมินไม่อยู่ใน `localStorage` อีกต่อไป —
อยู่ใน cookie `HttpOnly; SameSite=Lax; Secure(prod)` (`nk_admin_at` 15 นาที, `nk_admin_rt` 30 วันเมื่อจดจำ /
browser-session เมื่อไม่จดจำ) ที่ JS อ่านไม่ได้ XSS จึงขโมย session ไม่ได้ ส่วนที่เหลือ:

- **ทุก admin API ยังรับ `Authorization: Bearer`** (43 route ผ่าน `getAdminToken()` — Bearer มาก่อน, cookie fallback) ดังนั้น scripts/tests/แอดมิน API ภายนอกไม่พัง
- **Markers ไร้ความลับ** `nk_admin_flag`/`nk_admin_exp` (ไม่ httpOnly) ให้ client รู้ว่ามี session/ก่อนหมดอายุ — ไม่มี token หลุดเข้า JS
- Refresh/logout/2fa จัดการ cookie ครบ: rotate พร้อมกัน, dead refresh = เคลียร์ cookie, ตอบกลับ browser แบบไม่ echo token
- **⑤ MEDIUM-1 strict limiter:** `NK_RATE_LIMIT_STRICT=true` → high-risk routes (auth/orders/payments/admin/pdpa/cart) **fail-closed 503 `RATE_LIMITER_UNAVAILABLE`** เมื่อ Upstash ล่ม (แทนที่จะยอมให้แต่ละ instance มี counter เอง); low-risk (products) ยัง fail-open + header `X-RateLimit-Degraded`
- **③ HIGH-4 diagnostics:** `GET /api/v1/internal/build-info` (internal token หรือ admin JWT) รายงาน `gitSha` (vercel inject `GIT_SHA`), migration ล่าสุดที่ finished จริง, RLS per-table — ไม่มี secret/PII; ใช้เทียบ SHA↔deploy↔DB ตอน release
- **② CSP staged:** `NK_CSP_STRICT=true` → ตัด `unsafe-inline` ออกจาก script-src (JSON-LD เป็น data-only script ไม่กระทบ) — เปิดใน preview ก่อน แล้วค่อย enforce ใน prod
- **④ Actions pinned:** `actions/checkout|setup-node|upload-artifact` ล็อกเป็น commit SHA (major v4 เดิม) + comment กำกับ

Test: 14 เคส — Bearer/cookie resolution, HttpOnly+markers, browser-session cookie, clear ครบทุกชื่อ, rotation ไม่ echo token, dead refresh เคลียร์ cookie, logout เคลียร์แม้ไม่มี body, strict 503/fail-open, build-info 401/token/RLS drift

## Roadmap hardening (2026-09-27, §1–§6) — `tests/roadmap-hardening.test.ts`

**§1 ปิดช่องโหว่ครบวงจร:**

- **CSP enforced + nonce (default ON ใน prod):** middleware ออก `script-src 'self' 'nonce-<per-request>'` **ไม่มี `unsafe-inline`** — Next.js รับ nonce จาก request CSP header (official pattern) ส่วน theme pre-paint init ย้ายเป็น static file `/theme-init.js` (`<Script strategy="beforeInteractive">`) JSON-LD เป็น data-only script ไม่กระทบ Escape hatch: `NK_CSP_UNSAFE_INLINE=true` คืนพฤติกรรมเดิมโดยไม่ต้องแก้โค้ด, staging ยังใช้ `NK_CSP_REPORT_ONLY=true` ได้
- **Migration `20260927300000_revoke_stale_admin_sessions`:** revoke AdminSession ที่ยังมีชีวิตทั้งหมด (kill session ที่อาจรั่วจาก XSS ก่อน deploy cookies) — แอดมินต้อง login ใหม่หนึ่งครั้ง

**§2 เมล reliable:** Resend รับ `Idempotency-Key` (outbox ส่ง key ของแถวให้ provider — ยิงซ้ำไม่มีวันได้เมลซ้ำ) + outbox ที่หมดทางหายใจ (8 attempts) เขียน audit row `email_outbox_dead_letter` = alert ที่มองเห็นนอก log (never-throw)

**§4 gate = union:** `src/lib/paymentChannels.ts` — `resolvePaymentChannels()` รวม **Opn / manual transfer / wallet** (wallet = มี customer session ที่ valid) ไม่มีช่องทางใดเลย → 503 NO_PAYMENT_CHANNEL (matrix ครบใน test: Opn-only / manual-only / wallet-only / ว่าง)

**§5 release identity:** `GET /api/v1/version` — public, ตอบ `{gitSha, gitRef}` เท่านั้น (GIT_SHA inject จาก vercel.json); ตัวเต็ม (migration/RLS) ยังอยู่หลัง auth ที่ `/api/v1/internal/build-info`

**§6 operations:**

- `GET /api/v1/admin/reconciliation` (perm `orders:read`) — queue ของ operator: payment reconciliation rows (**resolved ดูจากสถานะ order ปัจจุบัน**), email dead letters, และ **webhook-gaps** (order `pending_payment` ที่มี attempt `succeeded` = เงินเข้าแต่ order ค้าง)
- `GET /api/v1/internal/ops-health` (internal token/admin JWT) — สัญญาณ uptime: paid-unfulfilled, dead letters, open reconciliations, stuck-sending emails, migration state, limiter mode (shared/memory/strict)
- §3 state machine: คงสถานะ `pending_payment → completed | pending_manual_fulfilment | refunded` เดิม (reconciliation row คือ exceptional state อยู่แล้ว) — การเพิ่ม enum กลางคันจะทำให้ทุก consumer ต้องรู้สถานะใหม่โดยไม่มีผลประโยชน์เชิงความปลอดภัย

Test: 14 เคส + static guards (ไม่มี inline script ใน layout, migration SQL รูปแบบถูก, gate ใหม่)

## Reconciliation UI + operator re-run (2026-09-27, ต่อยอด roadmap §6) — `tests/reconciliation-rerun.test.ts`

- **หน้า `/management/reconciliation`** (nav `orders:read`) — คิวงานของ operator 3 ตาราง: การชำระที่ต้องดำเนินการ (resolved ดูจากสถานะ order ปัจจุบัน), อีเมล dead-letter, และเงินเข้าแต่ออเดอร์ค้าง (webhook gaps) — ปุ่ม **ส่งมอบอีกครั้ง** ต่อรายการ + ปุ่ม **ส่งใหม่ทั้งหมด** ของ outbox drain
- **`POST /api/v1/admin/reconciliation/[id]/rerun-fulfilment`** (perm `orders:write` — เข้า authz matrix แล้ว):
  - claim = **CAS บนสถานะ order** (`pending_payment`|`pending_manual_fulfilment` → `payment_confirmed`) — แพ้ race = 0 แถว → อ่านสถานะจริงแล้วตอบตามผล (completed = 200 ตามสถานะ, อื่น ๆ = 409) — double-allocation เป็นไปไม่ได้ตามเงื่อนไขเดียวกับ fulfilment
  - fulfilment strict + settle attempt `pending → succeeded` + **ทั้งหมดใน tx เดียว** (Serializable) — เมล code_delivery เป็น outbox row unique ต่อ order ลูกค้าไม่มีทางได้เมลซ้ำ
  - ตอบตรงไปตรงมา: `ALREADY_SETTLED` (completed/refunded) 409, `UNEXPECTED_STATUS` 409, `ORDER_NOT_FOUND` 404
  - INSUFFICIENT_STOCK → recovery park ที่ awaited+verified (ตาม audit #4); recovery พัง → evidence ใหม่ผ่าน `recordPaymentReconciliation` + 500 `RECONCILIATION_REQUIRED`; ความล้มเหลวอื่น → evidence + 500 `RERUN_FAILED` — ไม่มี success ปลอมแม้แต่บรรทัดเดียว
- **เคส regression (11):** gate 401/403/404, ALREADY_SETTLED/UNEXPECTED_STATUS ไม่แตะ fulfilment, happy path (ส่งมอบ 2 โค้ด + settle + drain), resume ไม่ re-settle, race แพ้รายงานสถานะจริง, stock ไม่พอ → park กลับ, park พัง → evidence+500, unexpected → evidence+500

## Coupon per-customer cap — wallet pay path (2026-10-03) — `tests/wallet-coupon-race.test.ts`

`perCustomerLimit` เป็นค่าที่แอดมินตั้งได้ต่อคูปอง (`null` = ไม่จำกัด) และเดิมถูกenforce แบบ read-then-act ใน `claimOrderForConfirmation` (นับแถว `CouponRedemption` แล้วเทียบกับ limit) — ที่ Read Committed ลูกค้าคนเดียวกันกดจ่ายเงินกระเป๋า 2 ออเดอร์พร้อมกันจะอ่าน count เห็นค่าเดียวกันแล้วทั้งคู่ commit ได้ → เกิน `perCustomerLimit` (ต่างจาก `usageLimit` ที่ปลอดภัยเพราะใช้ conditional update เป็น atomic guard)

- **ทางแก้:** `pay-wallet` รัน transaction ที่ `isolationLevel: 'Serializable'` และ retry เมื่อเจอ P2034 (`runWalletPayment`, mirror `runStaffMutation` ใน `api/adminStaff.ts`) — เป็นจุด claim แบบ strict จุดเดียวที่ยังเป็น Read Committed; call site อีก 6 จุดเป็น `paidExternally` (soft — cap แค่ log ไม่ throw) หรือ Serializable อยู่แล้ว
- **gate 5 เคส:** transaction ขอ Serializable · P2034 ถูก retry แล้วคืนผลของรอบที่ retry · error ที่ไม่ใช่ P2034 ไม่ถูก retry · P2034 ครบ 3 รอบแล้วหยุด (ไม่วนไม่จบ) · balance guard ยังมาก่อน coupon check เสมอ · retry แล้วห้ามหักเงินซ้ำ (`customer.updateMany` + `topUpLog.create` รันครั้งเดียว)
- **ไม่ได้ใช้ `@@unique([couponId, customerId])`:** constraint อ่านค่า `perCustomerLimit` ไม่ได้ จึงกด cap ทุกคูปองให้เหลือ 1 และ error จะถูก catch ที่ `orders.ts:540` กลืนเป็น idempotent retry — cap จะผ่านโดยไม่มีใครรู้ตัว
- **ข้อจำกัดที่ต้องรู้:** เทสต์นี้ mock prisma จึงพิสูจน์แค่ "route ขอ Serializable + retry ถูก" **ไม่ได้** พิสูจน์ว่า DB serialize จริง — ต้องมี real-Postgres test ถึงจะปิด gap นี้
## Coupon per-customer cap — REAL Postgres (2026-10-03) — `tests/coupon-cap-concurrency.test.ts`

> **สถานะ: ยังไม่เคยรัน และยังไม่ได้ต่อเข้า CI.** เขียนขึ้นเพื่อปิด gap ที่ W ทิ้งไว้ (เทสต์ W mock prisma จึงพิสูจน์ได้แค่ว่า route "ขอ" Serializable — ไม่ได้พิสูจน์ว่า DB serialize จริง) แต่ยังไม่เคย execute แม้แต่ครั้งเดียว เพราะเครื่อง dev นี้ไม่มี Postgres (Docker daemon ไม่ทำงาน) — **อย่าคิดว่าผ่านจนกว่าจะเห็นผลรันจริง** รายการ gate จึงเขียนกำกับว่ายังไม่ต่อ CI โดยเจตนา การใส่เข้า job `Concurrency (DB races)` ต้องรันเขียวก่อน เพราะ job นั้นอยู่ใน `needs` ของ Build

- **ทำอะไร:** ยิง `POST /api/v1/orders/[id]/pay-wallet` พร้อมกัน **8 request** โดยลูกค้า **คนเดียว** กดจ่ายคูปองเดียวที่ `perCustomerLimit = 1` แล้วยืนยันว่า cap ถูกบังคับจริงบน DB จริง
- **assert:** สำเร็จพอดี 1 · อีก 7 ต้องได้ 409 `COUPON_PER_CUSTOMER_LIMIT` (code เดียวกับที่ checkout UI ใช้ fallback ไป PromptPay โดยไม่ใช้คูปอง) · `CouponRedemption` มี 1 แถว · `usageCount` = 1 · `TopUpLog` แบบ `wallet_spend` มี 1 แถว · wallet ถูกหักครั้งเดียวเท่ายอด 1 ออเดอร์ · ออเดอร์ที่ไม่ผ่านต้องกลับเป็น `pending_payment` ครบ (เงินหักแล้วทิ้งจะแย่กว่าบั๊กเดิม)
- **ทำไมต้อง 8 ไม่ใช่ 2:** request 2 อันอาจ serialize กันเองโดยธรรมชาติ — อันหลังจะเห็นแถว redemption ของอันแรกแล้วถูกปฏิเสธถูกต้อง **แม้โค้ดยังไม่ได้แก้** เทสต์แบบนั้นผ่านได้เปล่าๆ 8 อันที่ค้างพร้อมกันทำให้เกิด overlap แทบจำเป็น ซึ่งคือสิ่งที่ให้ assert นี้อำนาจจับ regression ได้จริง
- **stock ตั้งสูงกว่าจำนวน contender ตั้งใจ:** `pay-wallet` fulfil แบบ strict ถ้าของขาดจะได้ `INSUFFICIENT_STOCK` มาบังโค้ด coupon ที่เรากำลังจะ assert
- **ต้องมีอะไร:** dev server + Postgres จริง (`NK_TEST_BASE_URL`) — ไม่มีก็ skip เงียบๆ เหมือน `admin-concurrency.test.ts` ไม่ทำให้ `npm test` แดง
## Customer resend-email — 3 per order per hour (2026-10-03) — `tests/customer-resend-rate-limit.test.ts`

`resendOrderEmail` มี doc comment สัญญาว่า “3 resends per order per hour” มานานแล้ว แต่ body ไม่ได้ enforce อะไรเลย — เดินจาก order lookup ไปหยุดที่ provider ทันที ถ้า mount เป็น route จริงคือ endpoint ส่งอีเมลไม่จำกัด และแย่กว่านั้นคือเป็น **amplification**: ใครก็ตามที่รู้ orderId ก็สั่งให้อีเมลลูกค้าถูกยิงซ้ำได้เรื่อย ๆ

- **สิ่งที่สำคัญที่สุดคือ “ลำดับ” ไม่ใช่ตัวเลข:** quota ที่ check **ก่อน** ยืนยันอีเมล เป็นอาวุธ — ผู้โจมตีที่เดา orderId จะกินโควตาของเจ้าของจนหมด แล้วลูกค้าของจริงก็ติดล็อกตาม เคสนี้จึง assert เป็น “ยิงผิดอีเมล 10 ครั้ง โควตาของเจ้าของยังครบ 3” ไม่ใช่แค่ assert ว่า block ครบ 3
- **ใช้ limiter ตัวจริงจาก `lib/rateLimit`** (ไม่ใช้ counter เขียนเอง) เทสต์จึงพิสูจน์ code path เดียวกับที่ route จะใช้
- **`retryAfterSec` คือ “จำนวนวินาที” ไม่ใช่ epoch-ms** — `checkRateLimit` คืน `resetAt` มาเป็น timestamp ถ้าส่งตรง ๆ client จะถูกบอกให้รอ ~1.8 ล้านล้านวินาที (เทสต์จับได้: `toBeLessThanOrEqual(3600)` แดงทันทีถ้าแก้กลับไปส่ง `resetAt` ดิบ)
- **admin path ไม่โดนจำกัด** — route หลังบ้านเรียก `sendOrderConfirmationEmail` ตรง ๆ (ไม่ผ่าน `resendOrderEmail`) เพราะผู้ดูแลที่กำลังแก้ปัญหาส่งไม่ถูกคุม และจุดนี้ทำให้ admin กับ customer ไม่แชร์โควตากัน
- **ที่ยังต้องเติมที่ route:** cap ต่อ order กันการยิงซ้ำไป order เดิมไม่ได้ ยังต้องมี per-IP limit (key ด้วย `getClientIp(req)`) ตาม pattern ของ magic-link / forgot-password ไม่งั้นยิงกระจายหลาย order จาก IP เดียวได้

## Admin resend-email — error contract (2026-10-03) — `tests/admin-resend-email.test.ts`

Route เดิมตอบ provider outage ด้วย `result.error` ดิบในช่อง `error` แต่ค่านั้นเป็น **ข้อความระดับ transport** จาก `lib/email/resend.ts` (`EMAIL_NOT_CONFIGURED: …`, `EMAIL_PROVIDER_ERROR: Resend 422 …`) ไม่ใช่ code ของ API นี้ ส่วน modal ในหลังบ้านแตก error ด้วย `msg.includes('EMAIL_SEND_FAILED')` → **ไม่มีวัน match** ข้อความที่เขียนไว้เจาะจงว่า "ผู้ให้บริการอีเมลอาจมีปัญหา" จึงเป็น dead code และทุก outage ไปตกที่ข้อความกลาง ๆ "ลองใหม่"

- **ทำไมถึงรอดมานาน:** ไม่มีอะไรแดง ก็จริง — route ยังตอบ 502 และยังไม่กล่าวอ้างว่าส่งสำเร็จ แค่**ความเจาะจงของข้อความที่ผู้ใช้เห็นหายไป** และหายเฉพาะในเคสที่เขียนข้อความนั้นไว้เพื่อ
- **ทางแก้:** `error` ต้องเป็น code ของ route (`EMAIL_SEND_FAILED`) ส่วนข้อความจริงของ provider ย้ายไป `detail` + log ฝั่งเซิร์ฟเวอร์ (ตัด 300 ตัวอักษร) ตามแบบเดียวกับที่ `settings/email-test` ทำ (`SMTP_NOT_CONFIGURED` + `detail`)
- **gate 8 เคส:** ไม่มี token → 401 · role ที่ไม่มี `orders:write` → 403 และไม่ส่งเมล · order ไม่มี → 404 · ส่งสำเร็จ → 200 และ `sentTo` เป็น **อีเมลของออเดอร์เอง** เสมอ (ไม่ใช่ที่ผู้เรียกกรอก) · provider outage → `EMAIL_SEND_FAILED` + `detail` · provider ไม่ได้ตั้งค่า → ยังเป็น `EMAIL_SEND_FAILED` ไม่ใช่ชื่อ env var · **ข้อความ provider ที่มีคำว่า `FORBIDDEN` ปนอยู่ก็ยังต้องตอบ `EMAIL_SEND_FAILED`** · ข้อความยาวเกินถูกตัด
- **เคส `FORBIDDEN` ปนคือหัวใจของบั๊ก:** client แตก error ด้วย `includes(...)` ถ้าเอาข้อความ provider ไปใส่ `error` ตรง ๆ คำว่าใด ๆ ในนั้นจะพา UI ไปเข้าข้อความของ error อื่น — เคสนี้คือไปโทษว่าแอดมินไม่มีสิทธิ์ ทั้งที่จริงเป็นแค่ outage
- **ไม่ mock ตัวตรวจสิทธิ์:** ใช้ JWT จริงผ่าน `checkPermission` จริง — `verifyAdminJwt` อ่านแถว `admin_users` สดทุกครั้ง (ถ้าโดนลดสิทธิ์ token เดิมตายทันที) การ mock ทิ้งไปก็คือการถอดส่วนที่ควรตรวจออก ปลอดแค่ prisma, การหาออเดอร์ และการส่งเมล

## CI env secrets ต้องผ่านเกณฑ์เดียวกับที่โค้ดบังคับ (2026-10-03) — `tests/ci-env-secrets.test.ts`

job `Build` ตั้ง `NK_JWT_SECRET: ci-test-secret` (14 ตัวอักษร) ขณะที่ `src/lib/jwt.ts` ปฏิเสธการเซ็น/ตรวจ token ที่สั้นกว่า 32 ตัวด้วย `JWT_SECRET_TOO_WEAK` — **ไม่มีอะไรแดงเลย** เพราะ job นี้ยังไม่เคยรัน: มันอยู่หลัง gate ของ Security Audit ที่แดงอยู่ จึงเป็น `skipped` ทุก push และ build ผ่านเพราะ `next build` ไม่เคยเซ็น token จึงไม่เคยไปถึงบรรทัดที่จะ throw

- **รูปแบบบั๊กคือไม่ใช่ “ค่าผิด” แต่คือ “ค่าที่ผิดเฉพาะใน path ที่ยังไม่มีใครรัน”** วันที่ audit ถูกแก้และ job นี้ได้รันครั้งแรก มันจะผ่านด้วยโชค หรือเริ่ม throw โดยสาเหตุอยู่ไกลจากบรรทัดที่ต้องแก้
- **อ่านเกณฑ์จากซอร์ส ไม่เขียนซ้ำในเทสต์:** ดึง `MIN_SECRET_LENGTH` จาก `src/lib/jwt.ts` มาใช้จริง ๆ ถ้า gate เขียนตัวเลข 32 ซ้ำแล้วโค้ดเปลี่ยนเป็น 40 ทั้งสองฝั่งจะ “ถูก” พร้อมกันแต่ไม่ตรงกัน — ซึ่งคือทางที่บั๊กตัวต่อไปจะเข้ามา
- **gate ตัว guard เอง:** ถ้าหา `MIN_SECRET_LENGTH` ไม่เจอ เทสต์จะ **error พร้อมบอกว่าให้ไปแก้เทสต์ตาม** ไม่ใช่ผ่านเงียบ ๆ ทำให้การ refactor ที่ทำให้ gate ตาบอดต้องเป็นเรื่องที่เห็นผล
- **สแกนข้อความ ไม่ parse YAML — และนี่คือจุดที่สำคัญ:** `js-yaml` มีใน `node_modules` แต่เป็น transitive dep ของ eslint เท่านั้น (ยังมี `.pnpm-store` อยู่ข้าง ๆ) การพึ่งมันคือผูก gate ไว้กับ npm hoisting แต่ที่สำคัญกว่า regex ตรวจได้**คุณสมบัติที่แข็งกว่า** คือ “ไม่มีค่าผิดที่ไหนเลย” ไม่ใช่ “ไม่มีค่าผิดใน env block ที่ผมนึกไปเช็ก” — บั๊กนี้เกิดเพราะ **secret ของ job `Build` อยู่ระดับ step ไม่ใช่ระดับ job** การไล่ดูแค่ระดับ job จึงมองข้าม ส่วนการนับบรรทัดไม่สนระดับการเยื้อง
- **gate 5 เคส:** ทุกค่า literal ผ่านเกณฑ์ (พร้อมอ้างอิง `ไฟล์:บรรทัด` ในข้อความแดง) · ไม่มีค่าที่เป็น block scalar หรือว่าง (พวกนั้น parse ผ่านแต่เป็นกับดักตอนรัน) · ค่าที่เป็น `${{ secrets.X }}` ระบุชื่อไว้ว่าเช็คไม่ได้ แทนที่จะผ่านเงียบ · job `Build` ยังต้องมี JWT secret อยู่จริง (กันการแก้ปัญหาด้วยการ “ลบทิ้งไปเลย” ซึ่งจะทำให้ build เซ็น token ไม่ได้โดยไม่มีใครเห็น) · พบเกณฑ์ entropy ในซอร์สจริง
- **mutation ยืนยันแล้ว:** คืนค่าเดิม 14 ตัวอักษร → แดง 2 เคสพร้อมชี้ `ci.yml:120 / 188 / 309` · ตั้ง gift-code key เป็น `deadbeef` → แดง · เปลี่ยนชื่อ `MIN_SECRET_LENGTH` → แดงพร้อมข้อความบอกวิธีแก้

## Combobox keyboard (2026-10-04, WCAG 2.1.1) — `tests/combobox-keyboard.test.ts` + `e2e/smoke.spec.ts`

กล่องค้นหาทั้งสอง (navbar และ `/search`) ประกาศสัญญา ARIA ครบทั้งชุด — `role=combobox`, `aria-expanded`, `aria-controls`, listbox ที่มี `role=option` — แต่**ไม่ได้ทำอะไรตามสัญญานั้นเลย** มีแต่ Escape กับเมาส์ ผู้ใช้คีย์บอร์ดหรือ screen reader **ไม่มีทางไปถึง suggestion ใดๆ ได้เลย** ทั้งที่ ARIA ประกาศว่ามี ผิด WCAG 2.1.1 (Keyboard) และแย่กว่าที่ฟังเป็นเพราะ ARIA บอกผิดว่ามีการนำทางอยู่

- **ตัดสินใจแยกเป็น pure function (`resolveComboboxKey`) เพราะ repo นี้ไม่มี DOM test environment** — vitest รัน `environment: 'node'` ไม่มี jsdom/testing-library ถ้าเทสต์ hook ผ่านการ render ล้วนๆ มันจะเทสต์ไม่ได้เลย: pure function โดน unit เทสต์ครบทุกเคสใน `tests/combobox-keyboard.test.ts` ส่วนผลข้าง DOM (`aria-activedescendant` ถูกเรนเดอร์จริง, `scrollIntoView`, keypress จริงวิ่งเข้าถึง input) โดน e2e จับใน `e2e/smoke.spec.ts` ที่ยิง key จริงในเบราว์เซอร์จริง **เทสต์เขียวฝั่ง unit พิสูจน์แค่ว่าคณิตถูก มีแต่ e2e เท่านั้นที่พิสูจน์ว่าต่อสายถูก**
- **Enter ต้อง fallthrough ไม่ใช่กลืนทิ้ง:** ตอนไม่มีอะไรถูกไฮไลต์ Enter ต้องปล่อยให้ form submit ตามปกติ ไม่งั้นพฤติกรรมเดิม “Enter เพื่อค้น” จะหายไป นี่คือเคสที่ naive implementation จะพังเงียบๆ และมีเทสต์กันไว้
- **index เก่าต้องปลอดภัย:** ถ้ารายการย่อลงตอนที่ผู้ใช้กดลูกศรอยู่ Enter ต้อง commit ไม่ใช่ select index ที่ไม่มีอยู่จริง
- **ไม่แย่ง Home/End และ Tab:** ในช่องพิมพ์สองปุ่มนี้เป็นของ caret ข้อความ การไปยึดจะทำให้แก้ข้อความกลายเป็นการเลื่อนลิสต์
- **คำค้นใน e2e ดึงจากแค็ตตาลจริง ไม่ hardcode** — CI seed คนละชุดกับ production และ endpoint ไม่ match สระ/substring ทั่วไป ลิเตอรัลที่ดูสมเหตุสมผลอย่าง `"a"` จะคืน 0 suggestion แล้วเทสต์ผ่านมั่วหรือพังวูบวาบ การถาม API ก่อนแล้ว `test.skip` พร้อม annotation คือเวอร์ชันเดียวที่โกหกไม่ได้
- **mutation ยืนยันแล้ว:** ถอด wrap-around → แดง · Enter ไม่เคย select → แดง 3 เคส · ลูกศรไม่ ignore เมื่อลิสต์ว่าง → แดง · ดัก Tab → แดง · ถอด `aria-activedescendant` ออกจาก DOM จริง → e2e แดง 3 จาก 4

## โครงสร้างเมนูแอดมิน 17 รายการ → 7 หมวด (2026-10-05) — `tests/admin-nav-sections.test.ts`

sidebar เดิมเป็นรายการแบน 17 รายการ พนักงานต้องเลื่อนหาหน้าที่ใช้ทุกวัน และงานที่เกี่ยวกันกัน (คำสั่งซื้อ / ประวัติเติมเงิน / Reconciliation) ถูกกระจายอยู่คนละที่ รวมเป็น 7 หมวดตามการออกแบบใหม่

- **URL เดิมทุกตัวไม่เปลี่ยนเลย** — เป็นการจัดกลุ่มที่ชั้นการแสดงผลอย่างเดียว ไม่มีการลบ route ไม่มี redirect บุ๊กมาร์กและลิงก์ที่ staff เคยกดไว้ยังใช้ได้ เทสต์อ่าน `src/app/management/**/page.tsx` จริงแล้วยืนยันว่าเหลือเฉพาะ `login` กับ `dev-seed` ที่ไม่อยู่ในเมนู (ไม่ใช่หน้าที่หายไปเงียบๆ)
- **`dashboard:read` แยกออกมาจาก `reports:read`** — เดิม dashboard ต้องใช้ `reports:read` ทำให้ catalogue / order / support manager (คนที่ใช้หลังบ้านจริงทุกวัน) ไม่เห็นเมนูและถ้ากดก็ได้ 403 แต่ถ้าให้ `reports:read` เพื่อแก้อาการนั้น พวกเขาจะได้เห็น Analytics & Reports ด้วยซึ่งไม่ใช่ที่ต้องการ การแยก permission แก้อาการเข้าไม่ได้โดยไม่เปิดรายงานหลุด
- **role model ถูกถอดเป็นเทสต์ตารางตรงๆ จากที่ผู้ใช้เขียนไว้** — 3 กฎ (Order Manager เห็น Dashboard/Orders/Customers/Support · Catalogue Manager เห็น Dashboard/Catalog/Reports · Super Admin เห็นทั้งหมด) เป็นตาราง `ROLE_RULES` ที่ถอดคำพูดตรงๆ เทสต์นี้เขียนก่อนแก้ permission matrix แล้ว**แดงก่อน** พอดี เพราะก่อนหน้านี้มีเทสต์ชื่อว่า "matches the agreed role model" ที่ไม่ได้แตะกฎใดเลยแม้แต่ข้อเดียว
- **เทสต์ยืนยันสองอย่างแยกกัน ไม่ใช่ "ตรงทั้งหมด"** — (1) **ทุกหัวข้อที่ผู้ใช้ระบุ ต้องมองเห็น** และ (2) **ต้องไม่มีหัวข้อนอกเหนือ (ที่ระบุ + ที่มีอยู่เดิม)** เวอร์ชันแรกใช้ equality อย่างเดียว ซึ่งบังคับให้ต้อง**ลบสิทธิ์ที่มีอยู่เดิมออก**เพื่อให้เมนูตรงกับรายการ — นั่นคือการให้เทสต์มีอำนาจเหนือกว่าคำขอของผู้ใช้ ซึ่งผิด
- **สิทธิ์เดิมของ catalogue_manager ยังอยู่ครบ** — `coupons:read`/`coupons:write` ไม่ถูกแตะ เพราะกฎที่ผู้ใช้เขียนบอกว่า "เห็นหัวข้อเหล่านี้" ไม่ได้หมายความว่า "ต้องไม่มีสิทธิ์อื่นเลย" ผลที่ได้จริงคือ **catalogue_manager เห็น 4 หัวข้อ**: Dashboard · Catalog · ลูกค้าและโปรโมชั่น (มีแค่คูปอง เพราะไม่มี `customers:read`) · วิเคราะห์และรายงาน หัวข้อที่เพิ่มมานอกรายการคือหัวข้อที่**มีมาก่อนหน้างานนี้อยู่แล้ว** เทสต์บันทึกไว้ใน `PRE_EXISTING` และการลบสิทธิ์นั้นจะทำให้เทสต์แดง
- **หน้า dashboard กับ PII ถูกพิสูจน์จากตาราง permission ไม่ใช่รายชื่อที่เขียนไว้** — ทุก role ที่มี `dashboard:read` ถูกทดสอบอัตโนมัติ: ตัวที่ไม่มี `customers:read:full` ต้องได้อีเมล์หมุก **ทั้ง payload** ตัวที่มีก็ได้อีเมล์จริง `catalogue_manager` เพิ่งเข้ากลุ่มนี้เพราะได้ `dashboard:read` และถูกจับโดยอัตโนมัติโดยไม่ต้องแก้เทสต์
- **หัวข้อ (section) โผล่เมื่อ "ลูกที่มองเห็นอย่างน้อย 1 อัน" ไม่ใช่ตาม permission ของหัวข้อเอง** — เวอร์ชันแรก gate หัวข้อ "ลูกค้าและโปรโมชั่น" ด้วย `customers:read` ผลคือ **catalogue_manager หายคูปองทั้งที่เขาบริหารคูปองอยู่**
- **active route ต้อง match ยาวสุด** — โค้ดเดิมใช้ `startsWith()` เดียว ทำให้ `/management/reports/customer-sales` ไฮไลต์ทั้ง "รายงาน" และ "ยอดซื้อรายคน" พร้อมกัน ตอนนี้เลือก href ที่ยาวที่สุด และ `/management/report` ไม่เผลอไฮไลต์ `/management/reports` ด้วย
- **`aria-current` ต้องไม่โกหก (เจอจากการเล่นจริง)** — sidebar แบบย่อเคยประกาศ `aria-current="page"` ให้ไอคอนหัวข้อเสมอ เช่นยืนอยู่ที่ `/management/reports/slow-stock` แต่กลับประกาศว่า `/management/analytics` คือ "หน้าปัจจุบัน" ทั้งที่ผู้ใช้ไม่ได้อยู่ที่นั้น screen reader จึงบอกผิดตำแหน่ง `ariaCurrentFor(pathname, node)` แยกให้ชัดว่า **`page`** คืออยู่หน้านั้นจริง · **`location`** คืออยู่ภายในกิ่งนั้น · ไม่มีค่าเมื่อไม่เกี่ยว จุดสำคัญคือไอคอนหัวข้อชี้ไปที่ **หน้าแรกของหัวข้อ** ซึ่งเป็น *พี่น้อง* ของหน้าที่ผู้ใช้ยืนอยู่ ไม่ใช่บรรพบุรุษ การเทียบแค่ prefix ของ href จึงมองไม่เห็น ต้องถามว่าหน้าปัจจุบันอยู่ใน subtree ของ node นั้นหรือไม่
- **โครงสร้างที่เหลืออยู่ (อ่านก่อนแก้ sidebar)** —
  - `src/lib/adminNav.ts` เป็นเจ้าของ **ตรรกะทั้งหมด** ของเมนู: ต้นไม้ 7 หัวข้อ, การกรองตาม role, การหา active route, `aria-current` — ไม่มี React เลย ทดสอบได้ตรงๆ
  - `src/components/layout/AdminSidebar.tsx` รับผิดชอบ **แค่การเรนเดอร์** ทั้งแบบเต็มและแบบราง (rail) ใช้ `NavLinkRow` ตัวเดียวกันผ่าน prop `iconOnly`
  - `src/components/layout/AdminShell.tsx` เป็นเจ้าของ **state ที่เป็นค่ากำหนดของผู้ใช้** (`sidebarCollapsed`) ซึ่งเก็บใน localStorage เพราะ shell นี้ถูก mount ใหม่ทุกหน้า
  - `mobileNavOpen` **ตั้งใจไม่ persist** — ลิ้นชักเป็น state ชั่วคราว ถ้าค้างเปิดข้าม navigation หรือ reload จะผิดพฤติกรรม (และ `AdminSidebar` ปิดมันให้อยู่แล้วเมื่อ pathname เปลี่ยน)
- **rail ยุบแล้วต้องอยู่ยุบต่อ (เจอจากการเล่นจริง)** — `sidebarCollapsed` เคยเป็น `useState` ธรรมดาใน shell ที่ถูก mount ใหม่ทุกหน้า พอคลิกไอคอนใดก็ตาม sidebar กระโดดกลับมาเปิดทันที ตอนนี้เก็บใน `localStorage` (`nk_admin_sidebar_collapsed`) แล้วอ่านคืนหลัง mount จึงอยู่ข้ามทั้งการนำทางและการรีโหลด ทดสอบในเบราว์เซอร์จริงแล้วว่ายุบ 64px → คลิกไอคอนยัง 64px → รีโหลดยัง 64px และกดขยายแล้วรีโหลดก็กลับมา 256px (ไม่ค้างที่ยุบ)
- **rail แบบย่อต้องอ่านออกเป็นชื่อ ไม่ใช่แค่คำว่า "link"** — ตอนยุบเหลือ 64px แถวเมนูไม่มีข้อความเหลือเลย ถ้าชื่อมาจาก `title` อย่างเดียว screen reader จะพูดแค่ "link" ซึ่งคือการพังข้อ 4.1.2 (WCAG 2.2) ตอนนี้ `NavLinkRow` ตั้ง `aria-label={node.label}` **เฉพาะตอน `iconOnly`** ซึ่งไม่ใช่คำใหม่ที่แต่งขึ้น แต่เป็นชื่อหัวข้อที่มีอยู่แล้วใน `adminNav.ts` ส่วน **แบบเต็มไม่มี `aria-label`** เพราะมีข้อความให้อ่านอยู่แล้ว การใส่ทั้งสองอย่างคือชื่อกับข้อความที่มองเห็นอาจไม่ตรงกัน และ screen reader อ่านชื่อซ้ำ
- **ลิงก์ "กลับหน้าร้าน" ใน rail ก็เคยพึ่ง `title` อย่างเดียวเหมือนกัน** — `title` เป็นขั้นสุดท้ายของการคำนวณชื่อ (บาง screen reader ไม่อ่าน) เพิ่ม `aria-label` ให้ตรงกับแถวเมนู และไอคอน lucide ที่ Chrome ส่งออกเป็น `image` node ที่ไม่มีชื่อ ก็ใส่ `aria-hidden` (เป็นของตกแต่ง)
- **บทเรียนจากการวัดผิดวิธี (สำคัญกว่าตัวแก้)** — สคริปต์ตรวจรอบแรกรายงานว่าผ่าน 100% แต่จริงๆ ตรวจได้ **0 ลิงก์** เพราะกรองด้วย `node.url?.value` ซึ่ง CDP รุ่นที่ใช้อยู่ไม่คืนค่าให้ลิงก์เลย ผลคือเทสต์ที่ผ่านโดยไม่ได้ทดสอบอะไรเลย ตอนนี้เปลี่ยนไปเรียก `Accessibility.getPartialAXTree` ต่อ DOM node ตรงๆ ซึ่งได้ชื่อที่เบราว์เซอร์คำนวณจริง **และยืนยันจำนวนลิงก์มากกว่า 0 ก่อนตัดสินทุกครั้ง** รวมถึงพิสูจน์ด้วยการกด `Tab` จริงว่าลิงก์ใน rail เข้า focus ได้ครบและอ่านชื่อถูกต้อง (วัดจริง: rail 7/7 มีชื่อ · กด Tab ได้ครบทั้ง 8 ลิงก์ · แบบเต็ม 19 ลิงก์ มี `aria-label` 0 อัน และชื่อที่อ่านได้ตรงกับข้อความที่เห็นทุกอัน)
- **ที่ยังไม่ทำ (เจตนา ไม่ใช่ลืม)** — ไอคอน lucide ที่อยู่ในหัวข้อแบบเต็ม, ปุ่มปิดลิ้นชักมือถือ และลิงก์ส่งต่อเก็บเป็น `image` node ที่ไม่มีชื่ออยู่ รอบนี้แตะเฉพาะ rail ตามขอบเขต การไล่ `aria-hidden` ให้ครบทั้งไฟล์ควรแยกเป็นอีกงานที่มีขอบเขตชัดเจน
- **ผลข้างเคียงที่วัดได้แต่ยังไม่แก้:** `AdminShell` ยิง `GET /api/v1/auth/admin/me` ทุกครั้งที่ mount จึงเพิ่มขึ้น **1 ครั้งต่อการนำทางในหลังบ้าน** (วัดจริง: 3 ครั้งที่นำทาง = 3 ครั้งเพิ่ม) การย้าย shell ไปไว้ใน `src/app/management/layout.tsx` จะแก้ทั้งสองปัญหาพร้อมกัน แต่ต้องแก้ ~17 หน้าให้ถอด wrapper ออก จึงยังไม่ทำในรอบนี้
- **Dev Seed ถูกปิดทั้งหน้าใน production** — เดิมปิดแค่ API (404) แต่หน้าเว็บยังขึ้นและมีปุ่มตายอยู่ตรงนั้น ตอนนี้เพิ่ม server layout ที่ `notFound()` เมื่อ `NODE_ENV === 'production'`
- **สินค้าค้างสต๊อกเข้าจากหน้าคลังได้แล้ว** — ตามที่ขอให้ "staff จะลงมือที่นั่น" ใส่ลิงก์ในหัวหน้าหน้าคลัง และมีเทสต์กันไว้ว่า **ทุก role ที่เข้าคลังได้ต้องถือ `reports:read` ด้วย** ไม่งั้นลิงก์นี้คือ 403 ที่แน่นอน
- **ตัดโค้ดซ้ำ 2 จุด** — `subtreeHasMatch` มีอยู่สองฝั่ง (ใน `adminNav.ts` กับซ้ำอีกชุดใน sidebar) รวมเป็นตัวเดียวที่ export · rail แบบย่อและแบบเต็มใช้ `NavLinkRow` ตัวเดียวกันผ่าน prop `iconOnly` แทนที่จะเขียน `<Link>` + `aria-current` + class ซ้ำอีกชุด
- **พิสูจน์ด้วยเบราว์เซอร์จริงทุก role ไม่ใช่แค่ unit test** — ตัว admin shell ใช้ cookie `nk_admin_flag` + `nk_admin_exp` ในการ admit session แล้วดึง role จาก `GET /api/v1/auth/admin/me` การ stub แค่ endpoint นั้นจึง render เมนูของแต่ละ role ได้จริง **โดยไม่เขียนฐานข้อมูลเลย** ได้ผลตรงตามที่กฎระบุ: order_manager เห็น 4 หัวข้อ · catalogue_manager เห็น 3 หัวข้อ · super_admin เห็น 7 หัวข้อ
- **หมายเหตุเรื่อง PDPA:** หน้า PDPA **อยู่ใต้หัวข้อ "การดูแลระบบ" ตามที่ตัดสิน ไม่ย้ายไปฝ่ายสนับสนุน** เหตุผลคือ `pdpa:action` คือการอนุมัติ/ปฏิเสธคำขอเข้าถึง–ลบข้อมูลส่วนบุคคล ซึ่งเป็นการกำกับดูแล ไม่ใช่งาน triage ของฝ่ายสนับสนุน ตอนนี้ `pdpa:read` มีแต่ super_admin ที่ถือ ถ้าธุรกิจต้องการให้ support agent เห็นคำขอ PDPA ต้องตัดสินใจแยกเรื่องสิทธิ์นี้ชัดเจนก่อน ไม่ใช่แถมมากับการจัดกลุ่มเมนู

## ชุดอบรมหลังบ้าน (เผยแพร่ 5 ต.ค. 2569) — `tests/admin-training-artifacts.test.ts`

คู่มือ + วิดีโออธิบายเมนูหลังบ้านรูปแบบใหม่อยู่ที่ `webapp/nong-kati/admin-training/` — **อยู่นอก repo นี้โดยตั้งใจ** เพื่อไม่ให้ไฟล์ binary หลายสิเมกะไบต์ไหลเข้า remote สาธารณะ ผลข้างเคียงคือ **ไม่มีอะไรมาคุม** และของจริง 2 อย่างหลุดเข้าไปโดยไม่มีใครเห็น:

- **คำบรรยายทับกัน 8 ช่วง** — ทุก cue ใน `th.srt` เริ่มก่อน cue ก่อนหน้าจะจบราว 0.6 วินาที libass จึงวางซ้อนกัน **สองประโยคพร้อมกัน** วัดแล้วแถบคำบรรยายสูง 47px แทนที่จะเป็น 21px คนดูเห็นเป็นคำบรรยายซ้อนทุกช่วงเปลี่ยนบท แก้โดยตัด**ปลาย**ของ cue ให้เท่ากับต้นของ cue ถัดไป (ไม่ใช่เลื่อนต้น) เพื่อให้จังหวะที่หน้าเว็บกระโดดไปยังตรงกับคำบรรยายของตัวเองเสมอ
- **หน้าเว็บคัดลอกข้อเท็จจริงจากคู่มือมาอีกชุด** — `index.html` เคยเขียนหัวข้อ 7 หัวข้อ เมนูของแต่ละบทบาท และความกว้าง rail เอง แม้วันที่เขียนจะตรงกับคู่มือ แต่ไม่มีอะไรหยุดคนต่อไปแก้ไฟล์หนึ่งแล้วหน้าเว็บขัดกับอีกไฟล์แบบเงียบ ๆ ตอนนี้**คู่มือหมวด 0 เป็นเจ้าของข้อเท็จจริงชุดเดียว** และเกตนี้ยืนยันว่าหน้าเว็บจะไม่มีสำเนากลับมาโดยไม่ตั้งใจ

**ประตูที่รันทุก `npm test` (ไม่ต้องใช้เบราว์เซอร์ ไม่ต้องใช้เน็ต)**

| ตัว | บังคับว่า |
|---|---|
| D1 | หมวด 0 มีหัวข้อครบ 7 แถว และแถว role ครบ 3 บรรทัด (7 / 4 / 4) |
| D2 | รายการในสารบัญของหมวด 0 ชี้ไปที่หัวข้อจริง |
| D3 | หมวด 0 ยังเขียนไว้ครบสิ่งที่วิดีโออ้างว่าได้สาธิต (rail 64px · ลิ้นชักมือถือ · หมายเหตุ 403) |
| A1 | `index.html` ไม่คัดลอกข้อเท็จจริงใด ๆ จากหมวด 0 กลับมา |
| A2 | ทุก `href`/`src` ที่เป็นไฟล์บนดิสก์ใน `index.html` ต้องมีอยู่จริง |
| A3 | จำนวนบท = จำนวน cue และเวลาที่แต่ละบทกระโดดไปต้องอยู่ในช่วงของ cue ตัวเอง |
| S1 | `th.srt` ต้องไม่มีช่วง cue ที่ทับกัน และ cue สั้นที่สุดต้องยาวเกิน 1.5 วินาที |

**เกตนี้พังได้จริง — ทดสอบด้วยการใส่บั๊กกลับ ไม่ใช่แค่เขียนแล้วเขียว**

- ยืดปลาย cue 1 ให้ทับ cue 2 → S1 แดง: `cue 1 overruns cue 2 by 0.60s`
- ใส่คำว่า "การดูแลระบบ" กลับเข้า `index.html` → A1 แดง: `page restates "การดูแลระบบ"`
- ลบ beat หนึ่งแถว → A3 แดง: `expected 12 to be 13`
- เปลี่ยนลิงก์ `th.srt` เป็นชื่อที่ไม่มี → A2 แดง: `broken local references: th-subtitles.srt`

**ที่ยังตรวจอัตโนมัติไม่ได้ (ต้องรันเองก่อน burn ใหม่)** — การพิสูจน์ระดับพิกเซลว่าไม่มีคำบรรยายทับแถบเมนู และที่ตัวอักษรไทยเป็นตัวอักษรจริง (ไม่ใช่กล่อง `.notdef`) ต้องใช้ ffmpeg และใช้เวลาราว 90 วินาที จึงไม่รวมไว้ใน `npm test` แต่ทำซ้ำได้เองด้วยสองคำสั่งนี้ (ไม่ต้องพึ่งสคริปต์ภายนอก repo) — รันจากโฟลเดอร์ `webapp/nong-kati/admin-training/`:

```bash
# 1) เมนูด้านซ้ายกว้าง 272px — คำบรรยายต้องไม่มีพิกเซลของคำบรรยายตกในช่วง x < 272
ffmpeg -hide_banner -loglevel error -y -ss 5.0 -i admin-walkthrough-th.mp4 -frames:v 1 /tmp/frame.png

# 2) ดูด้วยตาจริงว่าเป็นตัวอักษรไทย ไม่ใช่กล่องสี่เหลี่ยม และไม่มีสองบรรทัดซ้อนกัน
ffmpeg -hide_banner -loglevel error -y -ss 5.0 -i admin-walkthrough-th.mp4 -frames:v 1 /tmp/frame.png
```

ถ้าจะ burn ใหม่ ต้องสร้าง `base.mp4` (คลิปตัดดิบไม่ทับซ้อน) ก่อน แล้วค่อย burn `th.ass` ทับ โดย `th.ass` ต้องตั้ง `PlayResX/Y` เท่าขนาดวิดีโอจริง (1280×800) — ถ้าไม่ตั้ง libass จะ scale จาก 384×288 ทำให้ `FontSize` และ `MarginV` ไม่เป็นค่าที่เขียนไว้จริง ๆ

## คู่มือฟีเจอร์ "เติมสต๊อกบัญชี" (5 ต.ค. 2569) — `tests/admin-restock-howto.test.ts`

`docs/admin-restock-howto-th.md` เป็นคู่มือไทยที่เขียน **เจาะหนึ่งฟีเจอร์** ไม่ใช่ทั้งหลังบ้าน (หมวด 3 ของคู่มือหลักย่อยหมดนี้แล้วและลิงก์ไปหาไฟล์นี้) ปัญหาที่เป็นแบบของมันคือ **อ่านเหมือนเอกสาร แต่ไม่มีใครเช็คว่าตรงกับโค้ดจริงหรือเปล่า** — ตอนเขียนพบว่าคู่มือหลักหมวด 3 ผิดไปแล้ว 3 จุด:

- **ปุ่มถูกเรียกผิด** — คู่มือเดิมบอกว่า "จัดการสต๊อก (ไอคอนรูปกุญแจ)" แต่ tooltip ที่พนักงานเห็นคือ **เติมสต๊อกบัญชี** และไอคอนเป็นกล่องพัสดุที่มีเครื่องหมาย `+`
- **ตัวคั่นถูกอธิบายผิดที่สุด** — คู่มือเดิมบอกว่าเลือก Comma / Semicolon / Tab ได้เมื่อข้อมูลเป็น `user,pass` จริง ๆ แล้ว **ปุ่มตัวคั่นถูก disable ในแบบสั้น และ route ไม่เคยอ่านค่า `separator` เลย** บล็อกแบบยาวถูกส่งให้ลูกค้าตามต้นฉบับเต็มก้อน (doc-comment ของ route เองยังเขียนคอมมิตแบบเก่าไว้ — เกตนี้ยืนยันเจตนานั้นไว้เป็น assertion)
- **ไม่บอกสิทธิ์เลย** — พนักงานจึงไม่รู้ว่าทำไม Order Manager กดแล้วได้ 403

| ตัว | บังคับว่า |
|---|---|
| RH1 | tooltip `เติมสต๊อกบัญชี` และชื่อหน้าต่าง `จัดการข้อมูลบัญชี` ตรงกับที่โค้ดเขียนไว้ |
| RH2 | หน้า **สินค้า** และ **คลังสินค้า** เปิด dialog ตัวเดียวกันจริง (คู่มือบอก 2 ทาง) |
| RH3 | สิทธิ์ที่ route ตรวจคือ `products:write` และ **ตาราง role ในคู่มือตรงกับ `ROLE_PERMISSIONS` ทุก role ไม่ตกหล่น** (วนจากโค้ดจริง ไม่ต้องเขียนชื่อเอง) |
| RH4 | กฎแบบยาว = บรรทัดว่าง 2 บรรทัด (`blankRun >= 2`) และรายการตัวคั่นในคู่มือตรงกับ `SEPARATORS` |
| RH5 | **route ยังไม่อ่าน `separator` หลังแยก body เสร็จ** — ถ้ามีคนไปทำให้ตัวคั่นมีผลจริง เกตนี้จะแดงเพื่อให้แก้คู่มือพร้อมกัน |
| RH6 | การข้ามโค้ดซ้ำ · StockMove `restock` · เฉพาะแพ็กเกจที่เปิดใช้งาน (`NO_VARIANTS`) · เข้ารหัสก่อนเก็บ |
| RH7 | การแจกโค้ดวนรอบ (`order[cursor % order.length]`) และการล็อกแพ็กเกจด้วยชื่อที่ตรงเป๊ะ |
| RH8 | กับดักบรรทัดขึ้นต้นด้วย `ID:` / `Ref:` / `Order:` / `Inv:` ที่ถูกตัดทิ้งทั้งบรรทัด |
| RH9 | คู่มือหลักหมวด 3 ยังลิงก์มาที่นี่ และไม่มีข้อความเก่าที่อ้างว่าตัวคั่นใช้ได้ในแบบสั้น |

**พังได้จริง — ทดสอบด้วยการใส่มั๊กกลับ**

- แทรก `void separator;` ลงใน parser ของ route → RH5 แดง: `expected 'const apply = …' not to match /\bseparator\b/`
- เปลี่ยนแถว `| Catalogue Manager | ได้ |` เป็น `ไม่ได้` → RH3 แดง: `Catalogue Manager should read "ได้"`
- เปลี่ยนคำว่า `เติมสต๊อกบัญชี` ในคู่มือทั้งไฟล์เป็น `เติมสต๊อกโค้ด` → 2 เคสแดง
- คืนไฟล์แล้วรันซ้ำ → 25 เคสผ่าน

## กวาดออเดอร์ที่ยังไม่จ่าย (5 ต.ค. 2569) — `tests/order-expiry-sweep.test.ts`

รีวิวหน้าร้านข้อ 2: checkout สร้างออเดอร์ `pending_payment` **จริง** ตั้งแต่กด "Continue" ก่อนลูกค้าจะยืนยันการจ่ายเงิน (`src/app/checkout/page.tsx` `handleContactSubmit` → `createOrder`) แต่ **ไม่มีโค้ดสักบรรทัดใน repo ที่หมดอายุมันได้** — `updateOrderStatus` อนุญาต `pending_payment → expired` แต่ไม่มีผู้เรียกเลย และคิว inventory ที่ `mockQueue.ts` เขียนไว้ว่า *"Reservation sweep (5min), expiry sweep (15min)"* มี `registerJobHandler` ที่ **ไม่เคยถูกเรียกที่ไหนเลย**

หมายเหตุสำคัญที่ตรวจเจอระหว่างลงมือ: รีวิวเดิมเสนอให้ "คืน stock reservation" ด้วย — **ทำไม่ได้และไม่จำเป็น**: `createOrder` แค่ *ตรวจ* สต๊อก (โยน `OUT_OF_STOCK`) ส่วนการหักสต๊อกจริงเกิดใน transaction ตอนยืนยันการจ่ายเงิน (`src/lib/fulfilment.ts`) ออเดอร์ที่หมดอายุจึง**ไม่ถือของไว้** ส่วน `releaseExpiredReservations` เดินบน `mockCodeStore` ในหน่วยความจำซึ่งว่างเปล่าตอน cold start บน serverless — เอามาเรียกจาก cron คือทำลายเพื่อไม่ได้อะไร เกตนี้จึงยืนยันว่า**ไม่** import มัน

| ตัว | บังคับว่า |
|---|---|
| EX1 | กวาดเฉพาะ `pending_payment` ที่เก่ากว่าหน้าต่างชำระเงิน (ค่าเริ่มต้น 30 นาที = `order_payment_timeout_minutes` ใน 06-database) และตั้ง `expiredAt` ที่ไม่เคยมีใครเขียนมาก่อน |
| EX2 | **`updateMany` ต้องย้ำ `status: 'pending_payment'` ใน `where` อีกครั้ง** — นี่คือ CAS ที่ทำให้ cron tick ปลอดภัยเมื่อชน webhook การจ่ายเงินพอดี ถ้ามีคนไปลบ predicate นี้ทิ้ง "ล้างโค้ด" ออเดอร์ที่จ่ายเงินแล้วจะถูกพลิกเป็น `expired` ได้ |
| EX3 | แข่งกันแล้วไม่ซ้ำซ้อน — `scanned > expired` คือสัญญาณว่า webhook ชนก่อน |
| EX4 | ทำงานเป็น batch ไม่ใช่ประโยคเดียวจบ (หนี้สต๊อกค้างครั้งแรกต้องไม่ล้ม) · รันซ้ำแล้วเป็น no-op |
| EX5 | **ไม่แตะสต๊อกและไม่แตะ gift code เลย** — ยืนยันด้วยการเรียกจริง ไม่ใช่อ่านซอร์สอย่างเดียว พร้อมดริฟต์การ์์ว่า `reservation.ts` ยังเป็น mock อยู่จริง |
| EX6 | route `/api/v1/internal/orders/expire` เหมือน drain ของอีเมลทุกประการ: 503 เมื่อไม่ตั้ง `NK_CRON_SECRET` (fail-closed) · 401 เมื่อ token ผิด · รับ admin JWT เพื่อกดจากแผง · clamp `?batch` |
| EX7 | drift guard — `expired` ยังเป็น transition ที่ถูกต้องใน `VALID_TRANSITIONS` ของ `src/api/orders.ts` |

**พังได้จริง — ทดสอบด้วยการใส่มั๊กกลับ**

- ลบ `, status: 'pending_payment'` ออกจาก `where` ของ `updateMany` → EX2 แดง: `re-asserts status=pending_payment in the updateMany where-clause`

## แคตตาล็อกอันดับตามสต๊อก (5 ต.ค. 2569) — `tests/catalog-stock-ordering.test.ts`

- **กฎ:**
  - สินค้าที่มีสต๊อก > 0 ต้องมาก่อนสินค้าหมดสต๊อกเสมอ ไม่ว่าจะเรียงแบบไหน
  - การเรียงลำดับคำนวณจากชุดทั้งหมดก่อนตัดหน้า ไม่ใช่ตัดหน้าก่อนเรียง
  - สต๊อกรวมจาก variants ที่ active เท่านั้น
- **ที่มา:** review พบว่าการเรียงไม่เคยคำนึงสต๊อกเลย เพราะ query ไม่ fetch ฟิลด์ stock
- **วิธีแก้เมื่อแดง:** ตรวจสอบว่า catalogOrderSelect มี stock ใน variants หรือไม่

## การ parsed ข้อความสต๊อก (SP) — `tests/stock-parser.test.ts`

- **กฎ:**
  - รองรับทั้ง LF และ CRLF line endings (normalize ก่อน parse)
  - รองรับ blank lines ภายใน multiline records (single blank = ส่วนหนึ่งของ record, 2+ consecutive blanks = แยก record)
  - รองรับ Thai text และ emoji ใน content
  - รองรับ comma, semicolon, tab separators
  - รองรับ reference prefix เช่น `id:`, `ref:`, `order:`
  - แจ้ง error ชัดเจนเมื่อ record ไม่สามารถ parse ได้
  - Preview count ต้องตรงกับ saved count
- **ที่มา:** client feedback เรื่อง parser แชร์สต๊อกไม่รับ formatted input 일부
- **วิธีแก้เมื่อแดง:** ตรวจสอบว่า parseStockContent จัดการ line endings และ blank line logic ถูกต้องหรือไม่

## Stored accounts — `tests/admin-stored-accounts.test.ts`

รีวิวหน้าร้านข้อ 3: หน้าหมวดหมู่เรียงด้วย `createdAt desc` ล้วน ๆ ไม่มีตัวเลือกเรียง ไม่มีฟิลเตอร์ และ**ไม่มี pagination เลย** (หน้า 1 เสมอ 24 รายการ) ส่วน `getCatalogProducts` มี 5 วิธีเรียงแต่ **ไม่วิธีไหนดูสต๊อกเลย** เพราะ ordering select เดิมดึงแค่ `variants: { select: { price: true } }` — ไม่มี `stock` ให้เรียงด้วยซ้ำ

สิ่งที่แก้: ย้ายการเรียงไปทับ **ทุก** sort (ไม่ใช่แค่เพิ่มตัวเลือกใหม่ เพราะการฝังสินค้าที่ซื้อได้ไว้ใต้ของที่หมด ต้องเข้าถึงไม่ได้แม้ "ลืมเลือก sort"), เพิ่ม sort `available` (มีของเยอะก่อน), เพิ่ม `?available=1` ที่หน้าหมวดหมู่และหน้าค้นหา, และเปลี่ยนหน้าหมวดหมู่ให้เรียงทั้งชุดแล้วค่อยตัดหน้า (เดิมใช้ `skip/take` ต่อหน้า ทำให้ลำดับข้ามหน้าไม่ตรงกัน)

| ตัว | บังคับว่า |
|---|---|
| CSO1 | **มีของมาก่อนของหมด ทุก sort ทั้ง 6** (แคสต์โหด: ของหมดชนะทุก key อื่น — ราคาถูก ราคาถูกสุด ฟีเจอร์ ใหม่สุด — แต่ยังต้องไปอยู่หลังของที่ซื้อได้) |
| CSO2 | variant ที่ `isActive: false` ถึงมีสต๊อกก็**นับเป็นไม่มีของ** เพราะ `createOrder` กรอง `isActive: true` — แคตตาล็อกห้ามโฆษณาของที่ checkout จะตอบ `OUT_OF_STOCK` |
| CSO3 | sort `available` เรียงตามสต๊อกมาก→น้อย |
| CSO4 | `?available=1` ใส่ predicate `{ some: { stock: { gt: 0 }, isActive: true } }` และไม่ใส่เมื่อปิด |
| CSO5 | **หน้า 2 ต่อจากหน้า 1 พอดี** — เรียงทั้งชุดครั้งเดียวแล้ว slice ไม่มีของซ้ำและไม่มีของหาย |
| CSO6 | deterministic — key ที่เท่ากันตกไปที่ชื่อแล้ว id กันสลับหน้า |
| CSO7 | **ordering select ต้องดึง `stock` กับ `isActive` จริง ๆ** — เคสนี้จับได้เฉพาะการดู shape ของ select เพราะ prisma mock คืนค่าที่เทสต์ให้เสมอ ไม่ว่า select จะเขียนอะไร |
| CSO8 | `getProductsByCategory` (ที่หน้าหมวดหมู่ใช้) stock-aware เหมือนกัน และไม่มี `skip/take` + `orderBy` ในดับของการเรียงแล้ว |

**พังได้จริง — ทดสอบด้วยการใส่มั๊กกลับ**

- เปลี่ยน `byAvailability(a, b) || cmp(a, b)` เป็น `cmp(a, b)` → 4 เคสแดง
- ตัด `stock: true, isActive: true` ออกจาก ordering select → CSO7 แดง 2 เคส (เคสนี้แรกที่พังหลังเขียนเทสต์เสร็จแล้ว คือเคสที่เทสต์พฤติกรรมจับไม่ได้ — ต้องเพิ่ม CSO7 ถึงจะเห็น)

## บัญชีที่ต้องเปลี่ยนรหัสผ่าน (5 ต.ค. 2569) — `tests/admin-forced-password-change.test.ts`

ลูกค้าแจ้ง: **Super Admin** เปิดหน้าสินค้าแล้วเจอแถบแดง `INSUFFICIENT_PERMISSIONS` ทับ "0 รายการ" — แต่**เมนูด้านซ้ายยังครบทั้ง 7 หมวด** รีวิวแล้วไม่ใช่บั๊กตารางสิทธิ์ (super_admin ได้ `products:read` อยู่แล้ว) สาเหตุคือบัญชีนั้นมี `mustChangePassword = true` ค้างไว้

ห่วงโซ่ที่ทำให้เกิดอาการนี้ — และทำไมถึงไม่มีใครจับได้ทั้งที่ผ่าน 466 เทสต์:

1. `mustChangePassword` ตั้งไว้ (ครั้งแรกที่ล็อกอิน หรือถูกบังคับเปลี่ยนจากหน้าพนักงาน)
2. [`verifyAdminJwt`](../../webapp/nong-kati/nong-kati/src/lib/jwt.ts) **ตัดสิทธิ์ใน token ทิ้งทั้งหมด** — ตั้งใจให้รหัสชั่วคราวไม่ได้อะไรเลย
3. **เมนูข้างซ้ายเช็คด้วย role ไม่ใช่ token** (`visibleNav` → `roleHasPermission` → `ROLE_PERMISSIONS[role]`) เลยยังโชว์ครบทุกหมวด
4. **API เช็คด้วยสิทธิ์ใน token** ทุกตัวก็ 403 หมด → เมนูกับ API ขัดกันเอง และข้อความบอกว่า "สิทธิ์ไม่พอ" ทั้งที่ที่จริงคือ "ยังไม่ได้เปลี่ยนรหัสผ่าน"
5. **ไม่มีอะไรฝั่ง server บังคับเปลี่ยน** — มีแค่ `router.push` ฝั่ง client ในหน้า login ถ้าพลาด (หรือเข้าผ่าน bookmark) ก็ติดอยู่อย่างเดียว

ทำไมเทสต์เดิมไม่จับ: [`admin-authz-matrix.test.ts`](../../webapp/nong-kati/nong-kati/tests/admin-authz-matrix.test.ts) ฮาร์ดโค้ด `mustChangePassword: false` ไว้ทั้ง 53 endpoint × 6 role — **สถานะนี้ไม่เคยถูกทดสอบเลย** เลยไปถึง production แบบเขียว

| ตัว | บังคับว่า |
|---|---|
| FP1 | บัญชีที่ต้องเปลี่ยนรหัส **ยังถูกตัดสิทธิ์เหมือนเดิม** — งานนี้ไม่ได้ทำให้ประตูหลวมลง |
| FP2 | `verifyAdminJwt` ตั้งธง `passwordChangeRequired` เพื่อบอกเหตุผลจริง (ธงนี้อยู่ฝั่ง server ไม่ได้อยู่ใน token ที่เซ็น) |
| FP3 | `checkPermission` ตอบ `PASSWORD_CHANGE_REQUIRED` — **ไม่ใช่** `INSUFFICIENT_PERMISSIONS` |
| FP4 | การปฏิเสธสิทธิ์จริง (เช่น finance_viewer ขอ `products:read`) ยังตอบ `INSUFFICIENT_PERMISSIONS` เหมือนเดิม — สาขาใหม่ต้องไม่กวาดความผิดพลาดนี้ |
| FP5 | หน้าสินค้าตอบ 403 ด้วยโค้ดที่สุจริต **และไม่ leak รายการสินค้า** |
| FP6 | layout ยิง `/api/v1/auth/admin/me` (route นี้ auth-only ไม่ต้องมีสิทธิ์ — เพราะฉะนั้นถึงบัญชีที่ไม่มีสิทธิ์เลยก็ถามได้) แล้ว `router.replace` ไปที่ `/management/settings?tab=security` |
| FP7 | ยกเว้นเฉพาะหน้า settings ตรง ๆ ไม่งั้นจะวนลูป — และไม่รันตอนหน้า login |
| FP8 | การเช็คล้มเหลว **ห้าม** กลายเป็นการล็อกคนออก — 403 ของแต่ละ route ยังเป็นด่านสุดท้าย |
| FP9 | ทางออกยังเปิดอยู่: change-password ไม่ต้องมีสิทธิ์ · `changeAdminPassword` **ต้อง** เคลียร์ธงและ revoke session (ถ้าลืมเคลียร์ = เปลี่ยนรหัสแล้วยังล็อกอยู่ตลอด) · หน้า settings ไม่มี permission gate |

**พังได้จริง — ทดสอบด้วยการใส่มั๊กกลับ**

- ถอด `passwordChangeRequired: true` ออกจาก `verifyAdminJwt` → FP1/FP3/FP5 แดง 3 เคส
- ลบบรรทัด `if (pathname === FORCED_CHANGE_EXEMPT_PATH) return;` ออกจาก layout → FP7 แดง (นี่คือบรรทัดที่กัน redirect วนไม่ให้)

## ดู / ปิดใช้งานบัญชีที่เก็บไว้ (5 ต.ค. 2569) — `tests/admin-stored-accounts.test.ts`

ลูกค้าถามว่า “เพิ่มบัญชีเข้าสินค้าแล้วดูยังไง ลบยังไง” — ปรากฏว่า **ฟีเจอร์นี้ถูกออกแบบและประกาศสิทธิ์ไว้แล้ว แต่ไม่เคยเขียนโค้ดจริง** มีทั้ง permission (`inventory:reveal`, `inventory:void`) และชื่อ route ในตารางมาตั้งแต่สมัยทำ inventory แต่โฟลเดอร์ route ไม่เคยถูกสร้าง

| ตัว | บังคับว่า |
|---|---|
| GC1 | `reveal` ถอดรหัสได้จริง (ทดสอบด้วย ciphertext จริง ไม่ใช่ตัวแทน) และ**เขียน audit ทุกครั้ง** — เพราะสิทธิ์ที่ไม่มีบันทึกถือว่าตรวจสอบย้อนหลังไม่ได้ |
| GC2 | **audit ห้ามมี plaintext** — ถ้าเขียนลง `diff` ก็เท่ากับถอดการเข้ารหัสทิ้งสำหรับข้อมูลที่อ่อนไหวที่สุดในระบบ |
| GC3 | บัญชีสถานะ voided/expired ตอบ **409 ไม่ใช่ 403** — คนที่เรียกมีสิทธิ์อยู่แล้ว แค่แถวนี้เปิดดูไม่ได้ 403 จะโกหก |
| GC4 | decrypt ไม่สำเร็จต้องตอบ 500 แบบไม่มีรายละเอียด ไม่รั่ว ciphertext หรือ key version |
| GC5 | `void` ทำ 4 อย่างใน**transaction เดียว**: พลิกสถานะ · ลดสต๊อก · เขียน StockMove · audit (audit ต้องอยู่ใน tx เดียวกัน) |
| GC6 | **CAS** — void ซ้ำต้องไม่ลดสต๊อกซ้ำ และขายไปแล้วห้ามถูกปิดเงียบ ๆ (409) |
| GC7 | รายการ masked ต้อง**ไม่หลุด plaintext** ออกไปทาง response แม้แต่ตัวอักษรเดียว |
| GC9 | การส่งบัญชีให้ลูกค้ารายตัว: ผูกกับ variant ที่ออเดอร์ซื้อจริงเท่านั้น · **ห้ามออเดอร์ที่ยังไม่จ่าย** · CAS · ไม่คืน plaintext · audit ใน tx เดียวกัน |
| GC8 | **ratchet: route ที่ประกาศใน `ROUTE_PERMISSIONS` ต้องมีไฟล์จริง** — ทิศทางที่เกตน์เดิมไม่เคยตรวจ |
| GC10 | แก้ไขบัญชีที่พิมพ์ผิด: เข้ารหัสใหม่ + **nonce ใหม่เสมอ** · hash ใหม่ · ชนบัญชีอื่นต้องตอบ 409 · **สต๊อกไม่ขยับ** · ขาย/จองแล้วแก้ไม่ได้ · ขวัญเหตุคือ `inventory:reveal` ไม่ใช่ `inventory:write` |

**GC10 — เรื่องนี้ค้างมาตั้งแต่รอบ GC:** มี "ดู" กับ "ลบ" แล้ว แต่**ไม่มี "แก้"** พิมพ์ผิดตัวเดียว = ต้องกินสต๊อกทิ้ง 1 ชุ้นผ่าน void ทั้งที่เป็นแค่ typo · `codeHash` เป็น UNIQUE ระดับทั้งระบบ ถ้าแก้ไปชนบัญชีที่มีอยู่แล้วต้องตอบ **409 DUPLICATE_CODE** ไม่ใช่ปล่อยให้ query พังเป็น 500 · nonce ห้ามใช้ซ้ำเด็ดขาด (GCM) และ audit ต้องเป็น `diff: null` เพราะค่า "ก่อนแก้" คือ plaintext เดิม

**พังได้จริง — ทดสอบด้วยการใส่มั๊กกลับ**

- ถอน `status: 'available'` ออกจาก CAS ของ void → GC5 แดง
- เปลี่ยน audit ของ reveal เป็น `diff: { before: { plaintext } }` → GC2 แดง
- แก้ `codeHash: nextHash` ใน edit เป็น `codeHash: code.codeHash` (เก็บ hash เก่า) → GC10 แดง (พิสูจน์แล้ว 5 ต.ค. 2569)

**GC8 เจอเจอะทันทีตอนรันครั้งแรก — เจอ route ประกาศไว้แต่ไม่มีอีก 8 ตัว** นอกจาก reveal/void ที่เพิ่งสร้าง: `PATCH products/:id/status` · `POST inventory/:id/upload` · `POST inventory/:id/codes` · `POST orders/:id/assign-code` · `PATCH customers/:id/tier` · `PATCH staff/:id/role` · `PATCH staff/:id/deactivate` · `GET dashboard/stats` — เก็บไว้ใน `KNOWN_UNBUILT` ในเทสต์ (ต้องลบทีละตัวเมื่อสร้างเสร็จ **รายการใหม่ที่โผล่เพิ่มจะทำให้เกตน์แดง**)

## Security Audit — แยก production (blocking) กับ dev (report) (2026-10-03)

job นี้แดงมาตั้งแต่รอบที่ 88 และเป็นเหตุผลที่ job `Build` ถูก `skipped` ทุก push — สาเหตุไม่ใช่ dependency ของตัวแอปแต่อยู่ใน **toolchain ฝั่ง dev** ทั้งหมด: `tailwindcss → micromatch/chokidar → braces` และ `eslint-config-next → fast-glob → micromatch → braces` ซึ่งรันแค่ตอน lint/build ไม่เคยรันใน production

- **`npm audit --omit=dev` = 0 ช่องโหว่** — ต้นไม้ production สะอาดจริง ไม่ใช่แค่คิดว่าสะอาด
- **แก้อันที่แก้ได้:** `brace-expansion@<=1.1.20` มี 1.1.21 ออกมาแล้ว → `overrides` แบบ **จำกัดขอบเขต** `"brace-expansion@<=1.1.20": "^1.1.21"` ต้องมี `@<=1.1.20` เพราะในต้นไม้มีทั้ง 1.1.18 (ผ่าน eslint ต้องแก้) และ 5.0.12 (ผ่าน @typescript-eslint ไม่ต้องแก้) ถ้าใส่ key เดี่ยว ๆ npm จะดัน 5.0.12 ลงมาเป็น 1.1.21 ซึ่งพัง minimatch@10
- **ที่แก้ไม่ได้เลย:** `braces` **ไม่มีเวอร์ชันที่แก้ได้เลยแม้แต่เวอร์ชันเดียว** — 3.0.3 คือเวอร์ชันล่าสุดที่เคยมีออกมา advisory ครอบคลุม `*` และสิ่งเดียวที่ npm เสนอคือ `tailwindcss@4` ซึ่งเป็น breaking major: ต้องเขียน Tailwind config ใหม่ + เปลี่ยน PostCSS + ตรวจ design-token gate ทั้ง 6 gate ที่สแกน class usage ใหม่ทั้งชุด — **ไม่ใช่การตัดสินใจที่ควรถูกบังคับให้เกิดจาก CI ที่แดง**
- **ดังนั้น gate แยกสองชั้น:** production ตรวจแบบ blocking (`--omit=dev`) คือของจริงที่รันบนเซิร์ฟเวอร์ ส่วน dev ไม่ block แต่**ไม่ซ่อน** — ออกเป็น `::warning::` พร้อมบอกว่าต้องแก้ด้วยอะไร และเก็บ `audit-report.json` เป็น artifact เหมือนเดิม
- **พิสูจน์ว่า gate ยังแดงได้ (ไม่ใช่ตรายประทับ):** ใส่ `lodash@4.17.15` ที่มี CVE ลง `dependencies` ชั่วคราว → gate exit 1 พร้อมชี้ `node_modules/lodash` แล้วคืนค่าเดิม
- **ผล:** `brace-expansion` 1.1.18 → 1.1.21 (eslint ได้) ส่วน 5.0.12 ของ @typescript-eslint **ไม่ถูกแตะ** · high ทั้งหมด 8 → 7 · lockfile เปลี่ยน 7 บรรทัด · eslint/tsc/345 tests/`next build` เขียว (สำคัญ: `brace-expansion` อยู่ในเส้นทาง `minimatch` ของ eslint เอง)
- **ค้างไว้ให้ตัดสินใจทีหลัง:** การย้าย Tailwind 3 → 4 จะเคลียร์ `braces` ได้ แต่เป็นงานระดับ migration ไม่ใช่งานแก้บั๊กความปลอดภัย อย่าให้ CI ตัดสินใจแทน

## CI pipeline (`.github/workflows/ci.yml`)

| Job                         | ทำอะไร                                                                  | ผูกกับ gate                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Lint & Typecheck            | `eslint .` + `tsc --noEmit`                                             | —                                                                                                              |
| Security Audit              | **blocking:** `npm audit --audit-level=high --omit=dev` (ต้นไม้ production เท่านั้น) · **report:** audit เต็มแสดงเป็น `::warning::` + `audit-report.json` | —                                                                      |
| Unit Tests                  | `npm test` (vitest ~345 เคส)                                          | R1–R6, authz matrix, PII, outbox, backup codes, recovery, Omise real, JSON-LD XSS (concurrency skip อัตโนมัติ) |
| Concurrency (DB races)      | Postgres 16 service + migrate + `next dev -p 4200` + `NK_TEST_BASE_URL` | Concurrency                                                                                                    |
| Browser Smoke (CSP + checkout) | Postgres 16 + migrate + seed สินค้า/ช่องทางโอน + seed management fixture (admin+TOTP / stranded order / completed order + delivered code / codes) + **prod build** `next start` + Playwright (`e2e/smoke.spec.ts` + `e2e/management.spec.ts` + `e2e/order-refund-resend.spec.ts`) — **build step เก็บ log ไว้เป็น artifact + emit `::error::` annotation ตอนพัง เพราะ step log ของ GitHub เปิดได้เฉพาะคนมีสิทธิ์ admin เท่านั้น** (run #89 build ตายใน 10s เหลือแต่คำว่า "exit code 1" ไม่มีอะไรให้ดู) — ฝั่งร้าน: หน้าแรกโหลดใต้ CSP nonce จริง + hydrate, prerendered routes ต้องมี inline script ครบ nonce, guest checkout ถึง order `pending_payment` ที่ลิงก์ confirmation เปิดได้, `/api/v1/version` ต้องรายงาน SHA ของ commit ที่ทดสอบ — ฝั่งหลังบ้าน: admin login ด้วย TOTP จริง → หน้า reconciliation → rerun-fulfilment ซ่อมออเดอร์ที่เงินเข้าแต่ค้างส่งมอบจน `completed` + ปิดรับ rerun ซ้ำ (ALREADY_SETTLED) + modal จัดการออเดอร์ (E6): คืนเงิน — ไม่ใส่เลขอ้างอิงเกตเวย์แล้วไม่เขียน DB · บันทึกจริงแล้วได้ `Refund` row + โค้ดเป็น `voided` + audit `refund_issued` + ออเดอร์เป็น `refunded` + คืนซ้ำได้ 409; resend — ต้องรายงานว่าส่งไม่สำเร็จ (job นี้ไม่มี email provider อยู่ดี ๆ จึงพิสูจน์ว่าไม่มีการโกหกว่าส่งสำเร็จ) | §6/§7/§8 smoke สุดท้าย |
| Build                       | `next build` ด้วย env ปลอม                                              | —                                                                                                              |
| report-build-status, deploy | ของ Vercel (Git integration)                                            | —                                                                                                              |

ทุก push บน `master` = CI 9 checks + deploy prod อัตโนมัติ (Build job ถูก gate ด้วยทุก job รวม browser-smoke)

---

## Checklist ก่อน merge

- [ ] `npm test` เขียว (R1–R6 + matrix + PII)
- [ ] **เพิ่ม admin endpoint?** → เพิ่ม row ใน `ROUTE_COVERAGE` (ทันทีที่ลืม suite แดง — นี่คือ by design)
- [ ] **แตะ UI/component ใหม่?** → `npm run test:e2e` เขียว (อย่างน้อย E1–E5 ชุดที่เกี่ยว)
- [ ] **แตะสี/token?** → R1–R6 + E1 + E2 + E4 ต้องพร้อมกัน
- [ ] Component ใหม่มี input/label → ids จาก `useId()` ไม่ใช่ literal
- [ ] endpoint ใหม่คืนข้อมูลลูกค้า → ตรวจว่าอยู่ใต้ branch mask ของ PII ด้วย (เพิ่มเคสใน `admin-pii-masking.test.ts`) — รวมถึง **CSV/excel export ทุกรูปแบบ**: mask ต้องเกิดก่อนเขียนไฟล์ (อ้างแบบ `reports/customer-sales/export` + `lib/reports/customerSales`)
- [ ] export ใหม่ที่โหลดไฟล์ออกจากระบบ → ผ่าน formula-injection guard (`isFormulaInjection`)

**ปิดแล้วเดิม:** route `POST /api/v1/admin/settings/email-test` (ปุ่ม Test connection ของ Email settings) พร้อมครบตาม checklist — row ใน `ROUTE_COVERAGE` (perm `settings:write`), SSRF guard ที่ `probeSmtp` + แบน localhost ใน route, audit `settings.email_test` (เก็บแค่ผล per-step ไม่มี credential) — คลุมด้วย `tests/admin-email-test.test.ts` (fake SMTP server ต่อ TCP จริง + route guard/override/fallback)
