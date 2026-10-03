# Pre-Launch Checklist — Nong-Kati

Consolidated from:

- `13-security.md §17` — Pre-Launch Security Checklist
- `14-seo.md §14.1` — Pre-Launch SEO Checklist
- `15-testing.md §18` — Pre-Launch QA Checklist
- `16-devops.md §20` — Pre-Launch Deployment Checklist

> **Audit status legend (2026-09-26 re-verification):**
>
> ทบทวนทุกข้อกับโค้ด/prod จริงอีกรอบหลังรอบแก้ security review + UX audit
> (commits a7b1271, 307fd4e, 8a2120a, 771fdd2, d07ac09) — ข้อที่สถานะเปลี่ยน
> มีหมายเหตุกำกับทุกบรรทัด
>
> **สถานะเดิม (2026-09-19):**
>
> - `[x]` — verified passing with real evidence (headers fetched, E2E run,
>   code audit). Where noted, verified on production
>   (https://nong-kati.vercel.app) or fixed and pending the deploy of
>   2026-09-19.
> - `[ ]` — still open. Each open item says what is missing and why it
>   couldn't be verified from this environment (external tools, budgets,
>   live traffic, or features not yet built).
>
> This pass ran: a 28/28 admin-auth E2E suite (`scripts/checklist-e2e.mjs`),
> full-route smoke tests (local + production), security-header and SEO
> fetches against production, dependency audit, and code greps for the
> injection/XSS/secret-hygiene items.

---

## 1. Security Checklist (13-security.md §17)

- [x] CSP deployed — **report-only in production** (verified live:
      `Content-Security-Policy-Report-Only` header present with report-uri
      `/api/v1/csp-report`). Enforcing-on-staging step not yet flipped; see
      note. _(partial — flip `NK_CSP_REPORT_ONLY` off after report review)_
- [x] HSTS header present on all responses (`max-age=63072000; includeSubDomains; preload`) — verified on production
- [x] X-Frame-Options DENY on all responses — verified on production
- [x] X-Content-Type-Options nosniff on all responses — verified on production
- [x] Referrer-Policy strict-origin-when-cross-origin — verified on production
- [x] Permissions-Policy: camera=(), microphone=(), geolocation=() — verified on production
- [x] Rate limiting functional on API routes — was written but wired to
      nothing; **fixed 2026-09-19**: middleware now applies the sliding-window
      limiter to `/api/*` (proved live: X-RateLimit headers decrement, and a
      140-request burst against the 120/min rule returned exactly 120×200 +
      20×429). Admin-auth rules corrected to the real `/api/v1/auth/admin/*`
      paths. Per-account brute force is additionally covered by the DB
      lockout (5 fails → 15-min lock, verified in E2E).
- [x] CSRF double-submit cookie on /auth/refresh endpoints — **wired
      2026-09-28**: middleware seeds a non-HttpOnly `nk_csrf` cookie; every
      admin auth mutation (login / 2fa / refresh / logout) runs the origin
      check, and cookie-authenticated refresh+logout must echo it in
      `x-csrf-token` (`src/lib/adminCsrf.ts`, 403 ORIGIN_MISMATCH / 409
      CSRF_TOKEN_*). Unit-tested in `tests/admin-csrf.test.ts` and proven
      live against `next start` (cross-site Origin → 403; missing/mismatched
      echo → 409; clean API client → passes).
- [x] Brute-force lockout verified: admin 5 fails → 15-min lock persisted in
      DB (E2E). _(customer login lockout not separately exercised — same
      adminLogin pattern not present on the customer path; see gap note)_
- [x] Webhook signature verification (Omise HMAC-SHA256) implemented —
      `verifyWebhookSignature` on raw body before parse; invalid sigs logged
      and dropped. _(signature path code-audited; live HMAC replay not
      exercised — requires a real gateway event)_
- [x] `npm audit` zero **known-fixable** high/critical in first-party deps —
      **ยืนยันใหม่ 2026-09-26: 0 vulnerabilities** (Next ขึ้น 15.5.26 แล้ว —
      เงื่อนไข "รอ Next 15" จากรอบก่อนปิดแล้ว)
- [x] No `queryRawUnsafe`/`executeRawUnsafe` in codebase (grep: zero hits)
- [x] No `dangerouslySetInnerHTML` except sanitised static content (4 hits,
      all server-built JSON-LD/CSS/theme-init constants — no user input)
- [x] JWT keys not dev defaults — `NK_JWT_SECRET` set in Vercel (Preview +
      Production), distinct from repo defaults — **เข้มขึ้น 2026-09-26**
      (a7b1271): secret ต้อง ≥32 ตัวอักษร ไม่งั้น throw; production ไม่มี
      secret = fail-closed (ไม่มี dev fallback) — ครอบคลุม slip token key ด้วย
- [x] Gift code encryption key rotated from dev defaults —
      `NK_GIFT_CODE_ENCRYPTION_KEY` + `_V1` set in Vercel; AES-256-GCM with
      env-derived key
- [x] Admin passwords changed from defaults — **done 2026-09-22 (security
      pass)**: request-path seeding removed (`ensureSeedAdmin` deleted);
      all seeded accounts rotated via `scripts/create-admin.ts --rotate`
      (unique passwords + unique TOTP secrets); 78 live sessions revoked;
      credentials scrubbed from all docs and stored gitignored.
- [x] `.env.local` not committed to git (git ls-files: zero .env files; no
      .env blobs in history)
- [x] No secrets in error messages returned to client — API errors are
      stable codes (`INVALID_EMAIL`, `TOTP_INVALID`, …), verified in E2E
- [x] Audit log append-only verified (no UPDATE/DELETE) — **เปลี่ยนจาก [ ]
      2026-09-26**: เขียนตาราง `AuditLog` จริงแล้ว (เลิก in-memory mock);
      grep ทั้งโค้ดไม่มี `auditLog.update/delete/upsert` แม้แต่รายการเดียว —
      append-only จริง, fire-and-forget ไม่ทำ business action ล้ม
- [x] Last-Super-Admin protection functional — **เปลี่ยนจาก [ ] 2026-09-26**:
      staff CRUD เป็น route จริง (`/api/v1/admin/staff`) พร้อมป้องกัน
      `LAST_SUPER_ADMIN` + `CANNOT_MODIFY_SELF` (409) ใน [id]/route.ts
- [x] PDPA cookie consent banner functional — renders, no longer covers the
      mobile bottom nav (fixed 2026-09-19), accepts/rejects persist
- [x] Legal pages live: Privacy Policy, Terms, Refund Policy, Cookie Policy —
      all 200 on production (+ /legal/data-request) — **แก้เพิ่ม 2026-09-26**
      (8a2120a): ลิงก์ consent ใน checkout เคยชี้ /terms /privacy ที่ 404 —
      ชี้ /legal/terms-of-service + /legal/privacy-policy ถูกต้องแล้ว

### เพิ่มจาก security review 2026-09-26 (แก้แล้วใน a7b1271)

- [x] Admin verify-payment เป็น transaction เดียว (claim+fulfil+settle
      Serializable) — ปิดช่องออเดอร์จ่ายแล้วค้าง pending
- [x] slip-verify ต้องมี capability token ก่อนยิง SlipOK/กินโควตา
- [x] Magic Link: ไม่ส่งเมลถ้าไม่มีบัญชี (ไม่ enumerate) + throttle 10/15น ต่อ IP
- [~] Real Omise/PromptPay gateway — **โค้ด implement ครบแล้ว** (`src/lib/payment/omise.ts`,
      `OmiseAdapter implements PaymentGateway`; ต่อกับ `payments/initiate` +
      `webhooks/omise`; `orders` อ่าน `isOpnConfigured`; เทสต์ `omise-real-adapter`
      เขียว) — **ยังเปิดใช้จริงไม่ได้จนกว่าจะใส่ sandbox keys** (prod ใช้โอนเงิน+สลิป)
      — แก้เมื่อ 2026-10-03
- [x] คูปอง per-customer limit race — **ปิดแล้ว 2026-10-03**: จุดเดียวที่ยัง race คือ
      `pay-wallet/route.ts` ซึ่งเรียก `claimOrderForConfirmation` แบบ strict
      (ที่ `route.ts:125`) — ตอนนี้ transaction เป็น `isolationLevel: 'Serializable'`
      (`route.ts:56`) และ retry เมื่อเจอ P2034 write-conflict ผ่าน `runWalletPayment`
      (`route.ts:82`, 3 ครั้ง) ลูกค้าคนเดียวกันที่กดจ่าย 2 ออเดอร์พร้อมกันจะผ่าน
      `perCustomerLimit` แค่ฝั่งเดียว อีกฝั่งถูก abort แล้ว retry มาเจอแถว
      `CouponRedemption` ของอีกฝั่ง → ได้ 409 `COUPON_PER_CUSTOMER_LIMIT` — claim มี 7 จุด:
      3 จุดแบบ strict (`verify-payment:186`, `omise:223`, `pay-wallet`) เป็น Serializable
      ครบแล้ว อีก 4 จุดเป็น `paidExternally` (soft — cap แค่ log ไม่ throw) เป็น
      Serializable 2 จุด แต่ `slip-verify:223` กับ `omise:174` ยังเป็น Read Committed
      ซึ่งกระทบแค่ความแม่นยำของ count ใน audit ไม่ใช่การให้ส่วนลดเกิน
      — **ตั้งใจไม่ใช้ `@@unique([couponId, customerId])`**: constraint อ่านค่า
      `perCustomerLimit` (ที่แอดมินตั้งได้, `null` = ไม่จำกัด) ไม่ได้ จึงกด cap ทุกคูปอง
      ให้เหลือ 1 และ error ยังถูก catch ที่ `orders.ts:540` กลืนเป็น idempotent retry
      — เทสต์ `wallet-coupon-race` เขียว 5 เคส
- [ ] Supabase RLS/Auth/Storage advisors — ตรวจไม่ได้จาก environment นี้ (ต้อง
      access Supabase dashboard แบบ read-only)

## 2. SEO Checklist (14-seo.md §14.1)

- [x] `sitemap.xml` generated and accessible — 200 on production
- [x] `robots.txt` present and correct — 200; **fixed 2026-09-19**: sitemap
      URL no longer falls back to `localhost:3000`/`nong-kati.com` (defaults
      to the canonical vercel.app domain; `NEXT_PUBLIC_SITE_URL` overrides)
- [ ] `robots: { index: false }` on staging — no separate staging
      environment exists; single production project. Create a staging
      deployment env with the noindex flag before true staging traffic.
- [x] All pages have `<title>` and `<meta description>` — verified on home,
      search, product detail (metadata exports)
- [x] Open Graph tags present on product/category/homepage — `og:title` etc.
      verified in served HTML; metadataBase fixed to canonical origin
      2026-09-19
- [x] Twitter Cards present — `name="twitter*"` tags in served HTML
- [x] JSON-LD: Organization + WebSite on homepage — `application/ld+json`
      blocks present (verified in served HTML)
- [x] JSON-LD: Product on product detail pages — `"@type":"Product"`
      verified on /product/hbo-max-7-4k-4
- [x] JSON-LD: BreadcrumbList on product pages — verified in served HTML
- [x] Canonical URLs set correctly — `<link rel="canonical">` emit ผ่าน `alternates`
      ในทุกหน้าที่มี `generateMetadata` (10 ไฟล์: หน้าแรก, /search, category,
      product, legal 5 หน้า, /docs/manual) — ไม่มีหน้าไหนตกหล่น — ยืนยัน 2026-10-03
- [x] `hreflang` not needed (Thai-only) — confirmed single-locale
- [x] Images have `alt` attributes — homepage: zero imgs missing alt;
      ProductCard renders `alt={name}`
- [ ] No broken links (404s) — **อัปเดต 2026-09-26**: ลิงก์ legal ที่ 404 ใน
      checkout แก้แล้ว (8a2120a); คำโฆษณาบัตรเครดิต/สถิติปลอมที่ audit จับ
      ลบหมดแล้ว — full crawl (linkinator) ยังไม่ได้รัน
- [x] `X-Robots-Tag: noindex, nofollow` on /checkout/_, /account/_,
      /management/_ — **fixed 2026-09-19**: the middleware matcher missed the
      bare `/checkout` path (trailing-slash-only entries); now matches both;
      verified on /checkout and /checkout/confirmation/_
- [ ] Lighthouse CI passes performance budgets — no Lighthouse run/budget
      config in the repo; needs a CI job or a local lhci run

## 3. QA Checklist (15-testing.md §18)

- [x] All P0 E2E specs pass (Playwright) — **เปลี่ยนจาก [ ] 2026-09-26**:
      มี Playwright gates ถาวรแล้ว — contrast (8 เทสต์ ทั้งสองธีม), landmarks + H1 (4), touch targets 44px (6) = 18/18 ผ่านบน dev และ CI ทุก push —
      ส่วน E2E purchase-flow จริง (สั่ง→จ่าย→รับโค้ด) มี spec แล้ว แต่ยังรันไม่ได้เพราะรอเปิดใช้ Slip2Go (ดูข้อถัดไป)
- [~] P0 purchase-flow E2E — spec: e2e/purchase-flow.spec.ts (tsc-clean; unrun until Slip2Go whitelist + NK_SLIP2GO_SECRET stored by client)
      ครอบคลุม: เพิ่มสินค้า → checkout → อัปโหลดสลิป → แอดมินยืนยัน → ได้รหัสโค้ด → เปิดหน้ายืนยันผ่าน UUID
- [x] Full integration suite green (Vitest) — **เปลี่ยนจาก [ ]**: tests/ =
      security-fixes (14) + phone-otp (18) + security-remediations (10) =
      **42/42 ผ่าน** (26 ก.ย.)
- [x] Full unit suite green (Vitest) — ชุดเดียวกัน 42/42
- [ ] AC-001 through AC-012 traceable and passing — acceptance criteria not
      mapped to automated checks; manual trace pending
- [ ] EC-001 through EC-027 traceable and passing — same as above
- [ ] k6 flash-sale scenario: 100 orders/min for 10 min, zero unhandled 5xx —
      สคริปต์มีแล้ว (`tests/load/flash-sale.js`) แต่ยังไม่เคยรันจริง (ต้อง
      staging DB แยก)
- [ ] Code delivery < 60s P95 ≥ 95% of orders — not measurable without real
      paid traffic; delivery pipeline is synchronous on payment webhook
- [ ] Payment success rate ≥ 98% — needs production traffic data
- [ ] Manual accessibility audit: NVDA + VoiceOver — not performed (needs
      human screen-reader session). Automated basics done: focus traps in
      modals, aria-hidden fixed on the hamster mascot (2026-09-19) —
      **เพิ่ม 2026-09-26** (8a2120a): drawer มือถือเป็น modal ครบ (focus-in,
      Tab-trap, Escape, scroll-lock, คืน focus), error ฟอร์มทุกจุดประกาศ
      role=alert + aria-invalid/describedby, FAQ aria-expanded
- [ ] axe-core zero WCAG 2.1 AA violations — axe scan not run
- [ ] Cross-browser testing: Chrome, Safari, Firefox — Chrome/Edge (Chromium)
      exercised via headless audits; Safari/Firefox not tested
- [x] Mobile responsive: all key flows tested on 375-390px viewport — full
      390×844 playtest 2026-09-19: zero overflow, zero console errors on all
      routes; cookie-banner/nav collision, tap targets, iOS zoom fixed;
      checkout flow driven end-to-end on-device profile
- [x] Cart persists across page reload (localStorage) — verified live
      (`nk_cart:v2` + separate session UUID key; reload keeps badge count)
- [x] Order lookup by email + order number works — **fixed 2026-09-19**: the
      page imported a Prisma/Resend server function into a client component
      (runtime error → every lookup failed with "เกิดข้อผิดพลาด"); now goes
      through `POST /api/v1/orders/lookup` (correct email → redirect to
      order page; wrong email → 404, no enumeration — verified in browser)
- [x] Admin login with 2FA works — 28/28 E2E (credentials → TOTP → session,
      single-use challenge, lockout, RBAC, rotation, change-password)
- [~] Admin order list/detail/resend/refund — list + detail +
      **verify-payment** verified against real DB (แข็งขึ้ง 2026-09-26:
      transaction เดียวพร้อม recovery state); **resend-email + refund
      implement แล้ว 2026-10-03**
      _(เดิม: ฝั่ง client `adminResendOrderEmail` / `adminRefundOrder` —
      `src/api/adminOrders.ts` — อ่านจาก `mockOrders.find(...)`) และ**ไม่มี route
      ฝั่งเซิร์ฟเวอร์เลย**; ที่สำคัญกว่านั้น `adminRefundOrder` เขียน audit row
      `refund_issued` จริง ๆ ทั้งที่แก้แค่ array ใน memory — audit log
      จะบันทึกว่าคืนเงินแล้วทั้งที่ order ไม่เคยเปลี่ยน)_

      - **`POST /api/v1/admin/orders/[id]/refund`** (`orders:refund`) — เป็น
        transaction เดียวที่ `Serializable` (retry P2034) ได้แก่ void
        GiftCode ของออเดอร์ → insert `Refund` → เดิน order
        `completed → refunded` → เขียน audit row **ส่ง `tx` เข้าไปด้วย** ให้
        rollback พร้อมกัน; `Refund.orderId` unique กันคืนซ้ำ (P2002 → 409)
      - **record-only โดยเจตนา** — admin กดคืนเงินที่ gateway dashboard ก่อน
        แล้วมาบันทึกที่นี่ พร้อม gateway reference เป็นหลักฐาน; route **ไม่เรียก
        gateway** เลย เพื่อไม่ให้ retry หรือกดสองครั้งแล้วคืนเงินซ้ำ
      - **ข้อจำกัดที่ต้องรู้:** void โค้ดได้แค่ฝั่งร้าน — โค้ดที่ส่งให้ลูกค้าไปแล้ว
        ยังใช้ได้ (ดึงคืนไม่ได้) และ **ยังไม่คืน stock** เพราะ 07-api.md §22
        ไม่ได้นิยาม semantics ของ restock — เดาผิดจะทำให้ stock เพี้ยน
      - **`POST /api/v1/admin/orders/[id]/resend-email`** (`orders:write`) —
        ส่งอีเมลยืนยันซ้ำ ใช้ `sendOrderConfirmationEmail` ตัวเดียวกับฝั่ง
        ลูกค้า (แยก logic ไว้ที่เดียว ไม่ให้ drift); ไม่มี email-match check เพราะ
        ผู้เรียกถือ permission แล้ว และปลายทางคือ `customerEmail` ของออเดอร์เสมอ
        — มีปุ่มใน UI แล้วที่ order detail modal ของหลังบ้าน (ปุ่ม resend โผล่เฉพาะ
        order ที่ `completed`/`refunded`)
      - ทั้งสอง route อยู่ใน `ROUTE_COVERAGE` แล้ว (authz matrix เช็คทุก role)
      - เทสต์ `admin-refund` 15 เคส เขียว + ยืนยันด้วย mutation (ถอด `tx`
        ออกจาก audit แล้วแดง, ถอด `Serializable` แล้วแดง)
      - ฝั่ง **ลูกค้า** `POST /orders/:id/resend-email` **ยังไม่มี route** แต่ตัว
        implementation มี rate limit จริงแล้ว (2026-10-03): `resendOrderEmail`
        บังคับ 3 ครั้ง **ต่อ order** ต่อชั่วโมง และ check **หลัง** ยืนยันอีเมล
        ตรงกับออเดอร์ — ถ้าสลับลำดับ ผู้โจมตีที่เดา orderId จะกินโควตาของ
        เจ้าของจนลูกค้าจริงติดล็อก (เทสต์ `customer-resend-rate-limit`
        assert เคสนี้ตรง ๆ)
      - **ที่ยังต้องเพิ่มตอน mount route:** per-IP limit (key ด้วย
        `getClientIp(req)`) ตาม pattern ของ magic-link / forgot-password —
        cap ต่อ order กันการยิงซ้ำไป order เดิมไม่ได้ ยังกันการกระจายยิง
        หลาย order จาก IP เดียวไม่ได้; และ route ต้องแปลง `RATE_LIMITED`
        เป็น 429 พร้อม header `Retry-After` จาก `retryAfterSec`
- [ ] CSV code upload pipeline works (parse → dedup → encrypt → insert) —
      upload route exists (`/api/v1/admin/upload`); end-to-end CSV run not
      exercised this pass
- [x] Stock decrements on purchase with StockMove ledger — verified in
      earlier passes (order engine writes StockMove rows; admin edits log
      moves)

## 4. Deployment Checklist (16-devops.md §20)

- [x] Production environment provisioned (Vercel + Supabase) — live
- [x] Production database migrated — migrations applied; **fixed 2026-09-19**:
      the migration ledger was behind the schema (earlier `db push` bypassed
      it) — reconciled with `migrate resolve`; `AdminChallengeConsumed`
      table created
- [x] Seed data loaded (≥30 SKUs across categories) — 37 products live
- [x] Environment variables set in production — verified via `vercel env ls`:
      DATABASE*URL, NK_JWT_SECRET, NK_GIFT_CODE_ENCRYPTION_KEY(\_V1),
      NEXT_PUBLIC_SITE_URL, NK_OMISE*_, NK*RESEND*_, UPSTASH\_\*, NK_SENTRY_DSN
      — **หมายเหตุ 2026-09-26**: NK_JWT_SECRET ถูกบังคับ ≥32 chars ตั้งแต่ boot
      (a7b1271); คีย์ LINE/Facebook/Twilio/SlipOK ยังไม่ใส่ (owner จะใส่เอง —
      ช่องทางนั้นซ่อน/503 จนกว่าจะพร้อม)
- [ ] DNS configured: `nong-kati.co.th` → Vercel — current production is the
      vercel.app domain; custom domain not connected (owner action at the
      registrar)
- [x] SSL certificate active (Vercel auto-managed) — HTTPS enforced
- [ ] CDN configured: `cdn.nong-kati.co.th` — subdomain not set up (images
      currently served from /products/ on the app domain)
- [ ] `deploy-production.yml` dry-run rehearsed — no GitHub Actions deploy
      workflow in repo; deploys are manual push → preview → promote
- [x] Rollback procedure rehearsed — vercel promote flow exercised repeatedly
      this week (previous deployments re-promotable from the dashboard)
- [ ] Backup restore drill performed — Supabase PITR not tested with a real
      restore
- [x] Smoke tests pass against production — all routes 200, health endpoint
      returns `{"status":"healthy"}`, orders API 401-guarded, admin APIs 401
- [ ] Monitoring alerts configured (Sentry, uptime) — `NK_SENTRY_DSN` env var
      exists but no Sentry SDK is installed in the app; no uptime monitor
      _(ยืนยัน 2026-10-03: grep `Sentry` ใน `src/` = 0 hit, ค่าใน `.env.example` ว่าง)_
- [x] Post-deploy smoke test: `GET /api/v1/health` returns 200 — verified on
      production (`status: healthy`, `database: ok`)

## 5. Launch Success Criteria (00-project-charter.md §13.1)

- [ ] Uptime ≥ 99.9% first 30 days — measurable only after launch
- [ ] Payment success ≥ 98% — needs live traffic
- [ ] Code delivery < 60s P95 ≥ 95% of orders — needs live traffic
- [x] ≥ 30 SKUs live — 37 products
- [x] PDPA pages live — consent banner + 4 legal pages + data-request page
- [ ] ≥ 1 real paid order — test orders only so far (all cleaned up) —
      ยังไม่ถูกเปิด — **ยืนยันซ้ำ 2026-10-03**: `GET /api/v1/payments/manual-info`
      บน prod ตอบ `enabled:false, accountName:null, accountNumber:null` ทำให้
      `manualUsable=false` (`orders/route.ts:78`) — ถ้าไม่มี Omise keys
      (`NK_OMISE_SECRET_KEY` + `NK_OMISE_WEBHOOK_SECRET`) ด้วย `POST /api/v1/orders`
      จะตอบ **503 NO_PAYMENT_CHANNEL** = ลูกค้าจ่ายไม่ได้เลย
- [ ] Zero unresolved OWASP Top 10 findings — see §1: CSRF wiring, DB-backed
      audit log, enforced CSP, and the Next 15 upgrade remain

---

## The 2026-09-19 pass fixed (summary)

1. **Rate limiting wired** — the limiter existed but nothing called it;
   middleware now enforces it on all API routes (429 proven live)
2. **Admin challenge single-use** — replayed login challenges could mint
   sessions; now recorded in `AdminChallengeConsumed` (E2E-proven)
3. **/checkout noindex gap** — middleware matcher missed the bare path
4. **robots.txt sitemap URL** — no longer falls back to localhost/wrong domain
5. **metadataBase** — canonical origin fallback corrected
6. **Guest order lookup** — was importing Prisma into a client component
   (every lookup errored); now a proper API route (browser-verified)
7. **next 14.2.5 → 14.2.35** — clears the critical cache-poisoning and
   RSC-deserialization advisories
