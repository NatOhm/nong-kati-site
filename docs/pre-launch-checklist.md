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
- [ ] CSRF double-submit cookie on /auth/refresh endpoints — `src/lib/csrf.ts`
      exists with the full pattern but has **zero consumers**; not wired.
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
- [ ] Real Omise gateway ยังไม่ implement (PromptPay/บัตร ตอบ 503 ตามดีไซน์ —
      prod ใช้โอนเงิน+สลิป) — รอ sandbox keys
- [ ] คูปอง per-customer limit ยัง raceable เชิง concurrency (กันด้วย
      Serializable รอบ claim เท่านั้น) — ควรมี DB constraint/advisory lock
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
- [ ] Canonical URLs set correctly — `<link rel="canonical">` **not emitted**
      on any page yet (metadataBase is now correct, so adding
      `alternates: { canonical: '/' }` per page is the remaining step)
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
      ส่วน E2E purchase-flow จริง (สั่ง→จ่าย→รับโค้ด) ยังไม่มี spec (ดูข้อถัดไป)
- [ ] P0 purchase-flow E2E (สั่งซื้อ→โอน+สลิป→ยืนยัน→รับโค้ด) — ยังไม่มี spec
      อัตโนมัติ; รอเปิดบัญชีโอนเงินจริงแล้วค่อยเขียนให้ตรง flow จริง
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
- [ ] Admin order list/detail/resend/refund works — list + detail +
      **verify-payment** verified against real DB (และแข็งขึ้น 2026-09-26:
      transaction เดียวพร้อม recovery state); resend-email and refund
      endpoints not implemented yet
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
- [x] Post-deploy smoke test: `GET /api/v1/health` returns 200 — verified on
      production (`status: healthy`, `database: ok`)

## 5. Launch Success Criteria (00-project-charter.md §13.1)

- [ ] Uptime ≥ 99.9% first 30 days — measurable only after launch
- [ ] Payment success ≥ 98% — needs live traffic
- [ ] Code delivery < 60s P95 ≥ 95% of orders — needs live traffic
- [x] ≥ 30 SKUs live — 37 products
- [x] PDPA pages live — consent banner + 4 legal pages + data-request page
- [ ] ≥ 1 real paid order — test orders only so far (all cleaned up) —
      **BLOCKER ปัจจุบัน**: บัญชีโอนเงินในแอดมิน (การตั้งค่า → โอนเงินแมนนวล)
      ยังไม่ถูกเปิด (`manual-info.enabled = false` บน prod ณ 26 ก.ย.) —
      ลูกค้าไม่มีช่องทางจ่ายที่มองเห็นจนกว่าจะเปิด
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
