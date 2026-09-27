# Quality Gates — Nong-Kati

คู่มือรวม quality gates ทั้งหมดของโปรเจกต์: แต่ละ gate **enforce อะไร**, **อยู่ไฟล์ไหน**, **รันยังไง** และ **แก้อย่างไรเมื่อแดง**

> ทุก gate ถูกทดสอบด้วย negative control แล้ว (ฉีด violation ปลอมเข้าไป → ต้องแดงทันที) และ scanner ของ gate ที่รันบน browser มี control ในตัว self-verify ทุกครั้งที่รัน

---

## ภาพรวม

| #     | Gate                                                  | ไฟล์ test                          | ตัวรัน               | CI job                 |
| ----- | ----------------------------------------------------- | ---------------------------------- | -------------------- | ---------------------- | --- | --- | ---------------------------------------- | --------------------------------- | ---------- | ---------- |
| R1–R6 | Design-token / duplicate-ID (static source scan)      | `tests/design-token-gates.test.ts` | `npm test` (vitest)  | Unit Tests             |
| A     | Admin authz matrix (53 endpoints × no-auth + 6 roles) | `tests/admin-authz-matrix.test.ts` | `npm test`           | Unit Tests             |     | P   | PII masking (permission-scoped response) | `tests/admin-pii-masking.test.ts` | `npm test` | Unit Tests |
| C     | Concurrency (DB races — refresh CAS, lockout)         | `tests/admin-concurrency.test.ts`  | vitest + live server | Concurrency (DB races) |
| E1    | Disabled-state affordance (WCAG 1.4.1)                | `e2e/disabled-state.spec.ts`       | `npm run test:e2e`   | (local/preview)        |
| E2    | No hardcoded white in dark mode                       | `e2e/no-hardcoded-white.spec.ts`   | `npm run test:e2e`   | (local/preview)        |
| E3    | Duplicate DOM ids (ทั้งไซต์ผ่าน sitemap)              | `e2e/duplicate-ids.spec.ts`        | `npm run test:e2e`   | (local/preview)        |
| E4    | Text contrast ≥ 4.5:1 (WCAG 1.4.3)                    | `e2e/contrast.spec.ts`             | `npm run test:e2e`   | (local/preview)        |
| E5    | Touch targets 44px + stats consistency                | `e2e/touch-targets.spec.ts`        | `npm run test:e2e`   | (local/preview)        |

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

## CI pipeline (`.github/workflows/ci.yml`)

| Job                         | ทำอะไร                                                                  | ผูกกับ gate                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Lint & Typecheck            | `eslint .` + `tsc --noEmit`                                             | —                                                                                                              |
| Security Audit              | `npm audit --audit-level=high` (blocking)                               | —                                                                                                              |
| Unit Tests                  | `npm test` (vitest ~203 tests)                                          | R1–R6, authz matrix, PII, outbox, backup codes, recovery, Omise real, JSON-LD XSS (concurrency skip อัตโนมัติ) |
| Concurrency (DB races)      | Postgres 16 service + migrate + `next dev -p 4200` + `NK_TEST_BASE_URL` | Concurrency                                                                                                    |
| Build                       | `next build` ด้วย env ปลอม                                              | —                                                                                                              |
| report-build-status, deploy | ของ Vercel (Git integration)                                            | —                                                                                                              |

ทุก push บน `master` = CI 8 checks + deploy prod อัตโนมัติ

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
