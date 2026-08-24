# Pre-Launch Checklist — Nong-Kati

Consolidated from:
- `13-security.md §17` — Pre-Launch Security Checklist
- `14-seo.md §14.1` — Pre-Launch SEO Checklist
- `15-testing.md §18` — Pre-Launch QA Checklist
- `16-devops.md §20` — Pre-Launch Deployment Checklist

---

## 1. Security Checklist (13-security.md §17)

- [ ] CSP deployed enforcing (not report-only) on staging
- [ ] HSTS header present on all responses (`max-age=63072000; includeSubDomains; preload`)
- [ ] X-Frame-Options DENY on all responses
- [ ] X-Content-Type-Options nosniff on all responses
- [ ] Referrer-Policy strict-origin-when-cross-origin
- [ ] Permissions-Policy: camera=(), microphone=(), geolocation=()
- [ ] Rate limiting functional on all routes (auth: 5/15min customer, 5/30min admin)
- [ ] CSRF double-submit cookie on /auth/refresh endpoints
- [ ] Brute-force lockout verified: customer 5/15min, admin 5/30min, TOTP 5/30min
- [ ] Webhook signature verification (Omise HMAC-SHA256) functional
- [ ] `npm audit` zero high/critical vulnerabilities
- [ ] No `queryRawUnsafe`/`executeRawUnsafe` in codebase
- [ ] No `dangerouslySetInnerHTML` except sanitised rich text fields
- [ ] JWT keys rotated from dev defaults
- [ ] Gift code encryption key rotated from dev defaults
- [ ] Admin passwords changed from defaults
- [ ] `.env.local` not committed to git
- [ ] No secrets in error messages returned to client
- [ ] Audit log append-only verified (no UPDATE/DELETE)
- [ ] Last-Super-Admin protection functional
- [ ] PDPA cookie consent banner functional
- [ ] Legal pages live: Privacy Policy, Terms, Refund Policy, Cookie Policy

## 2. SEO Checklist (14-seo.md §14.1)

- [ ] `sitemap.xml` generated and accessible
- [ ] `robots.txt` present and correct
- [ ] `robots: { index: false }` on staging
- [ ] All pages have `<title>` and `<meta description>`
- [ ] Open Graph tags present on product/category/homepage
- [ ] Twitter Cards present
- [ ] JSON-LD: Organization on homepage
- [ ] JSON-LD: WebSite with SearchAction on homepage
- [ ] JSON-LD: Product on all product detail pages
- [ ] JSON-LD: BreadcrumbList on all pages
- [ ] Canonical URLs set correctly
- [ ] `hreflang` not needed (Thai-only)
- [ ] Images have `alt` attributes
- [ ] No broken links (404s)
- [ ] `X-Robots-Tag: noindex, nofollow` on /checkout/*, /account/*, /management/*
- [ ] Lighthouse CI passes performance budgets

## 3. QA Checklist (15-testing.md §18)

- [ ] All P0 E2E specs pass (Playwright)
- [ ] Full integration suite green (Vitest)
- [ ] Full unit suite green (Vitest)
- [ ] AC-001 through AC-012 traceable and passing
- [ ] EC-001 through EC-027 traceable and passing
- [ ] k6 flash-sale scenario: 100 orders/min for 10 min, zero unhandled 5xx
- [ ] Code delivery < 60s P95 ≥ 95% of orders
- [ ] Payment success rate ≥ 98%
- [ ] Manual accessibility audit: NVDA + VoiceOver
- [ ] axe-core zero WCAG 2.1 AA violations
- [ ] Cross-browser testing: Chrome, Safari, Firefox
- [ ] Mobile responsive: all key flows tested on 375px viewport
- [ ] Cart persists across page reload (localStorage 24h)
- [ ] Order lookup by email + order number works
- [ ] Admin login with 2FA works
- [ ] Admin order list/detail/resend/refund works
- [ ] CSV code upload pipeline works (parse → dedup → encrypt → insert)

## 4. Deployment Checklist (16-devops.md §20)

- [ ] Production environment provisioned (Vercel + Supabase/Railway)
- [ ] Production database migrated (`prisma migrate deploy`)
- [ ] Seed data loaded (≥30 SKUs across categories)
- [ ] Environment variables set in production
- [ ] DNS configured: `nong-kati.co.th` → Vercel
- [ ] SSL certificate active (Vercel auto-managed)
- [ ] CDN configured: `cdn.nong-kati.co.th`
- [ ] `deploy-production.yml` dry-run rehearsed
- [ ] Rollback procedure rehearsed
- [ ] Backup restore drill performed
- [ ] Smoke tests pass against production
- [ ] Monitoring alerts configured (Sentry, uptime)
- [ ] Post-deploy smoke test: `GET /api/v1/health` returns 200

## 5. Launch Success Criteria (00-project-charter.md §13.1)

- [ ] Uptime ≥ 99.9% first 30 days
- [ ] Payment success ≥ 98%
- [ ] Code delivery < 60s P95 ≥ 95% of orders
- [ ] ≥ 30 SKUs live
- [ ] PDPA pages live
- [ ] ≥ 1 real paid order
- [ ] Zero unresolved OWASP Top 10 findings
