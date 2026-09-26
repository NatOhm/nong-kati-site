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

## CI pipeline (`.github/workflows/ci.yml`)

| Job                         | ทำอะไร                                                                  | ผูกกับ gate                                           |
| --------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| Lint & Typecheck            | `eslint .` + `tsc --noEmit`                                             | —                                                     |
| Security Audit              | `npm audit --audit-level=high` (blocking)                               | —                                                     |
| Unit Tests                  | `npm test` (vitest ~101 tests)                                          | R1–R6, authz matrix, PII (concurrency skip อัตโนมัติ) |
| Concurrency (DB races)      | Postgres 16 service + migrate + `next dev -p 4200` + `NK_TEST_BASE_URL` | Concurrency                                           |
| Build                       | `next build` ด้วย env ปลอม                                              | —                                                     |
| report-build-status, deploy | ของ Vercel (Git integration)                                            | —                                                     |

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

**งานค้างที่เกี่ยว:** route `POST /api/v1/admin/settings/email-test` (ปุ่ม Test connection ของ Email settings, ใช้ `src/lib/email/smtpProbe.ts` ที่เสร็จแล้ว) เมื่อเพิ่ม ต้อง: เพิ่ม row ใน `ROUTE_COVERAGE` (perm `settings:write`) + ครอบ SSRF guard ที่ lib มีให้ + เพิ่มเคส PII หาก response มีข้อมูลอ่อนไหว
