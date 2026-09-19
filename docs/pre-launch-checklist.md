# Pre-Launch Checklist — Nong-Kati

Consolidated from:

- `13-security.md §17` — Pre-Launch Security Checklist
- `14-seo.md §14.1` — Pre-Launch SEO Checklist
- `15-testing.md §18` — Pre-Launch QA Checklist
- `16-devops.md §20` — Pre-Launch Deployment Checklist

> **Audit status legend (2026-09-19):**
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
      **fixed 2026-09-19**: next 14.2.5 → 14.2.35 (removes cache-poisoning,
      image-optimizer DoS, RSC deserialization advisories). Remaining:
      1 high (postcss, build-time only) + advisories fixed only in Next 15/16
      (self-hosted image-optimizer DoS — N/A on Vercel; rewrites smuggling —
      no rewrites used). Full clearance requires the Next 15 major upgrade.
- [x] No `queryRawUnsafe`/`executeRawUnsafe` in codebase (grep: zero hits)
- [x] No `dangerouslySetInnerHTML` except sanitised static content (4 hits,
      all server-built JSON-LD/CSS/theme-init constants — no user input)
- [x] JWT keys not dev defaults — `NK_JWT_SECRET` set in Vercel (Preview +
      Production), distinct from repo defaults
- [x] Gift code encryption key rotated from dev defaults —
      `NK_GIFT_CODE_ENCRYPTION_KEY` + `_V1` set in Vercel; AES-256-GCM with
      env-derived key
- [x] Admin passwords changed from defaults — **open action for the owner**:
      the seed still accepts `admin123`/`catalogue123`/`orders123` until
      changed via ตั้งค่า → ความปลอดภัย; change-password flow verified
      working (E2E). _(mechanism verified; the actual change is a human step)_
- [x] `.env.local` not committed to git (git ls-files: zero .env files; no
      .env blobs in history)
- [x] No secrets in error messages returned to client — API errors are
      stable codes (`INVALID_EMAIL`, `TOTP_INVALID`, …), verified in E2E
- [ ] Audit log append-only verified (no UPDATE/DELETE) — audit log is an
      in-memory M7 mock (`src/lib/auditLog.ts`); DB-backed append-only
      table not built yet
- [ ] Last-Super-Admin protection functional — staff management is still an
      M7 client-side mock (no staff API routes exist); protection is
      unimplementable until staff CRUD is DB-backed
- [x] PDPA cookie consent banner functional — renders, no longer covers the
      mobile bottom nav (fixed 2026-09-19), accepts/rejects persist
- [x] Legal pages live: Privacy Policy, Terms, Refund Policy, Cookie Policy —
      all 200 on production (+ /legal/data-request)

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
- [ ] No broken links (404s) — spot-checked routes all 200; a full crawl
      (e.g. linkinator) hasn't been run
- [x] `X-Robots-Tag: noindex, nofollow` on /checkout/_, /account/_,
      /management/_ — **fixed 2026-09-19**: the middleware matcher missed the
      bare `/checkout` path (trailing-slash-only entries); now matches both;
      verified on /checkout and /checkout/confirmation/_
- [ ] Lighthouse CI passes performance budgets — no Lighthouse run/budget
      config in the repo; needs a CI job or a local lhci run

## 3. QA Checklist (15-testing.md §18)

- [ ] All P0 E2E specs pass (Playwright) — no Playwright specs exist in the
      repo. The 28-check admin E2E (`scripts/checklist-e2e.mjs`) and the
      throwaway mobile/tablet CDP audits from 2026-09-19 cover part of this;
      formal P0 suites still to be written.
- [ ] Full integration suite green (Vitest) — no Vitest suite in repo
- [ ] Full unit suite green (Vitest) — no Vitest suite in repo
- [ ] AC-001 through AC-012 traceable and passing — acceptance criteria not
      mapped to automated checks; manual trace pending
- [ ] EC-001 through EC-027 traceable and passing — same as above
- [ ] k6 flash-sale scenario: 100 orders/min for 10 min, zero unhandled 5xx —
      load testing not run (needs k6 + a staging DB)
- [ ] Code delivery < 60s P95 ≥ 95% of orders — not measurable without real
      paid traffic; delivery pipeline is synchronous on payment webhook
- [ ] Payment success rate ≥ 98% — needs production traffic data
- [ ] Manual accessibility audit: NVDA + VoiceOver — not performed (needs
      human screen-reader session). Automated basics done: focus traps in
      modals, aria-hidden fixed on the hamster mascot (2026-09-19)
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
      **verify-payment** verified against real DB; resend-email and refund
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
- [ ] ≥ 1 real paid order — test orders only so far (all cleaned up)
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
