# Project Charter
## Nong-Kati — Digital Gift Card E-Commerce Platform

---

> **Document Control**
> | Field | Value |
> |---|---|
> | Document ID | 00-project-charter |
> | Version | 1.0.0 |
> | Status | Approved — Single Source of Truth |
> | Created | 2026-06-27 |
> | Last Updated | 2026-06-27 |
> | Owner | Founder / Product Owner |
> | Audience | All stakeholders, engineering team, outsourced developers |
>
> All subsequent documents (architecture, PRD, design system, API spec, deployment runbook) **must** reference and remain consistent with this charter. Any conflict between a downstream document and this charter must be resolved in favour of this charter unless a formal amendment is issued.

---

## Table of Contents

1. [Vision](#1-vision)
2. [Mission](#2-mission)
3. [Business Goals](#3-business-goals)
4. [Target Market](#4-target-market)
5. [Competitor Analysis](#5-competitor-analysis)
6. [Revenue Model](#6-revenue-model)
7. [Key Performance Indicators (KPIs)](#7-key-performance-indicators-kpis)
8. [Risk Register](#8-risk-register)
9. [Project Scope](#9-project-scope)
10. [Out of Scope](#10-out-of-scope)
11. [Technology Constraints](#11-technology-constraints)
12. [Compliance & Legal Requirements](#12-compliance--legal-requirements)
13. [Success Criteria](#13-success-criteria)
14. [Assumptions & Dependencies](#14-assumptions--dependencies)
15. [Stakeholders](#15-stakeholders)
16. [Budget & Timeline](#16-budget--timeline)
17. [Glossary](#17-glossary)

---

## 1. Vision

> **To become the most trusted, fastest, and most convenient digital gift card destination for Thai consumers — where every top-up, gift, and subscription starts.**

Nong-Kati envisions a Thailand where purchasing digital gift cards is as effortless as buying a convenience-store snack: instant, secure, always available, and priced fairly. The platform will be the single destination Thai consumers reach for across gaming credits, streaming subscriptions, and e-commerce top-ups — delivered within seconds of payment.

---

## 2. Mission

Nong-Kati's mission is to **deliver a fast, reliable, and secure online storefront** that:

- Sells digital gift cards across gaming, streaming, and e-commerce categories to Thai consumers.
- Provides instant or near-instant code delivery after confirmed payment.
- Accepts the payment methods Thai consumers already use — PromptPay / Thai QR and credit/debit cards.
- Operates with full Thai regulatory compliance from day one (VAT 7%, PDPA B.E. 2562).
- Scales from medium volume at launch to high volume within 12 months without re-architecture.

---

## 3. Business Goals

### 3.1 Short-Term Goals (0–3 Months)

| # | Goal | Measurable Target |
|---|---|---|
| BG-01 | Launch a production-ready storefront | Live in ≤ 8 weeks from project start |
| BG-02 | Achieve first revenue | First paid order within 7 days of launch |
| BG-03 | Establish core product catalogue | Minimum 30 distinct gift card SKUs across 3 categories at launch |
| BG-04 | Process payments reliably | Payment success rate ≥ 98% from week 1 |
| BG-05 | Deliver codes instantly | ≥ 95% of orders delivered within 60 seconds of payment confirmation |

### 3.2 Medium-Term Goals (3–6 Months)

| # | Goal | Measurable Target |
|---|---|---|
| BG-06 | Reach monthly order volume target | 1,000–10,000 orders per month |
| BG-07 | Build a returning customer base | Repeat purchase rate ≥ 20% |
| BG-08 | Establish brand recognition | 500+ organic search impressions/day (Thai-language SEO) |
| BG-09 | Achieve operational break-even | Monthly revenue covers hosting + ops + COGS |
| BG-10 | Expand catalogue | 80+ SKUs across 5+ sub-categories |

### 3.3 Long-Term Goals (6–12 Months)

| # | Goal | Measurable Target |
|---|---|---|
| BG-11 | Scale to high volume | 10,000–100,000 orders per month |
| BG-12 | Grow gross margin | Gross margin ≥ 15% across all categories |
| BG-13 | Gain competitive market share | Top 5 organic Thai search ranking for 10+ high-intent keywords |
| BG-14 | Achieve full PDPA compliance audit | Pass internal PDPA compliance review |
| BG-15 | Enable affiliate / referral growth | Referral programme contributing ≥ 10% of new orders |

---

## 4. Target Market

### 4.1 Primary Market

**Geography:** Thailand (domestic only — Thai Baht, Thai language)

**Primary Consumer Segments:**

| Segment | Description | Size Estimate | Purchase Behaviour |
|---|---|---|---|
| **Gamers** | Thai consumers aged 13–35 who play online/mobile games (PUBG Mobile, ROV, Genshin Impact, Steam games) | ~15M active gamers in Thailand (2024 est.) | Frequent, high-intent, price-sensitive, buy in bulk |
| **Streamers** | Netflix, Spotify, YouTube Premium, Disney+ subscribers looking to top up or gift | Urban Thai, 18–45, middle income | Monthly recurring need, gift-occasion driven |
| **Online Shoppers** | Shopee, Lazada, JD Central buyers who want wallet top-ups or gift cards | Broad demographic, 18–50 | Seasonal spikes (11.11, 12.12, Songkran, New Year) |

### 4.2 Secondary Market

| Segment | Description |
|---|---|
| **Corporate gifters** | SMEs purchasing gift cards in bulk for employee rewards or client gifts |
| **Parents** | Adults aged 30–50 buying gaming cards for children |
| **Gift occasion buyers** | Birthday, graduation, New Year gifters seeking a digital gift solution |

### 4.3 Customer Persona Profiles

**Persona A — "The Gamer" (แก้ม, 19, University Student)**
- Plays Mobile Legends and Steam games daily
- Uses PromptPay from a mobile banking app
- Wants the cheapest price, fastest delivery, and no registration friction
- Pain point: Current top-up sites are slow, ugly, or feel untrustworthy

**Persona B — "The Gift-Giver" (สมชาย, 34, Office Worker)**
- Wants to send a Netflix gift to a friend's birthday
- Pays by credit card (KBank or SCB)
- Needs a receipt / tax invoice for personal record-keeping
- Pain point: Can't easily find gift cards in Thai language with trusted UX

**Persona C — "The Bulk Buyer" (ร้านเกมส์, SME reseller)**
- Buys 50–200 units per month for resale
- Needs volume pricing and a reliable supply
- Pays by bank transfer or PromptPay
- Pain point: No reliable wholesale digital card source with API

---

## 5. Competitor Analysis

### 5.1 Direct Competitors (Thai Market)

| Competitor | Strengths | Weaknesses | Threat Level |
|---|---|---|---|
| **Buku (buku.co.th)** | Established brand, wide catalogue, LINE Pay integration | Outdated UX, slow delivery on some SKUs | High |
| **Codashop Thailand** | Massive brand in gaming, trusted by gamers | Gaming-only, no streaming/e-commerce cards | Medium |
| **Shopee Gift Cards** | Enormous user base, trusted payment | Not a specialised destination, limited catalogue depth | Medium |
| **GCardShop / TopupPlaza** | Low prices, broad inventory | Poor UX, limited payment methods, trust concerns | Medium |
| **Garena Top-Up** | Direct publisher top-up for Garena games | Single publisher only, not a marketplace | Low |

### 5.2 Indirect Competitors

| Competitor | Nature of Competition |
|---|---|
| **7-Eleven / Top-Up Kiosks** | Physical top-up — convenience vs. digital speed |
| **Facebook / LINE Group Sellers** | Peer-to-peer reselling — price competitive but untrustworthy |
| **Official Publisher Stores** | Direct top-up portals (e.g., Steam Wallet website) |

### 5.3 Competitive Advantages — Nong-Kati

| Differentiator | Description |
|---|---|
| **Speed** | Sub-60-second code delivery targeting as the core brand promise |
| **Trust & UX** | Clean, modern, Thai-language-first UI with professional brand identity |
| **Payment Convenience** | PromptPay QR + credit/debit card — the two dominant Thai payment methods |
| **Mixed Catalogue** | One destination for gaming + streaming + e-commerce cards |
| **SEO-First** | Thai-language keyword strategy from day one to acquire organic traffic |
| **PDPA Compliance** | Builds trust with privacy-conscious consumers |

---

## 6. Revenue Model

### 6.1 Primary Revenue Stream — Retail Margin on Gift Cards

Nong-Kati purchases digital gift cards (codes) from suppliers/distributors at wholesale cost and resells them to end consumers at retail price.

```
Revenue = Retail Price × Units Sold
Gross Profit = (Retail Price − Wholesale Cost) × Units Sold
Gross Margin % = (Retail Price − Wholesale Cost) / Retail Price × 100
```

**Target Gross Margin by Category:**

| Category | Example SKU | Target Gross Margin |
|---|---|---|
| Gaming (Steam, PSN, Xbox) | Steam Wallet ฿100 | 5–10% |
| Gaming (Mobile — Garena, Codashop) | ROV ฿50 | 8–15% |
| Streaming (Netflix, Spotify) | Netflix Gift ฿300 | 5–12% |
| E-commerce (Shopee, Lazada) | Shopee Gift Card ฿100 | 3–8% |
| **Blended Average** | — | **~8–12%** |

> **Note:** Margins in digital gift cards are thin at retail. Volume and operational efficiency are the primary levers for profitability. Target blended margin of ≥ 10% at scale.

### 6.2 Secondary Revenue Streams (Post-Launch, Month 6+)

| Stream | Description | Target Contribution |
|---|---|---|
| **Affiliate / Referral Commissions** | Reward users who refer purchasers with store credit | 10% of new orders |
| **Promotional Placements** | Supplier-funded featured placement on homepage | ฿5,000–฿20,000/month per supplier |
| **Bulk / B2B Orders** | Volume pricing for SME resellers with slight margin premium | 10–15% of revenue |

### 6.3 Pricing Strategy

- **Competitive Pricing:** Match or undercut top 3 competitors by 1–3% where possible.
- **Transparent Pricing:** No hidden fees. All prices inclusive of VAT 7%.
- **No Subscription / No Account Required:** Guest checkout supported to reduce friction.
- **Loyalty Store Credit:** Accumulated purchase rewards redeemable as store credit (Phase 2).

### 6.4 Unit Economics Model

| Metric | Conservative | Base Case | Optimistic |
|---|---|---|---|
| Monthly orders (Month 6) | 1,000 | 5,000 | 10,000 |
| Average order value (AOV) | ฿150 | ฿200 | ฿250 |
| Gross margin | 8% | 10% | 12% |
| **Monthly Gross Profit** | **฿12,000** | **฿100,000** | **฿300,000** |
| Operating costs (hosting, ops) | ฿15,000 | ฿20,000 | ฿30,000 |
| **Net (before tax)** | **(฿3,000)** | **฿80,000** | **฿270,000** |

> Break-even requires ~2,500 orders/month at ฿200 AOV and 10% margin.

---

## 7. Key Performance Indicators (KPIs)

### 7.1 Business KPIs

| KPI | Definition | Target (Month 3) | Target (Month 12) |
|---|---|---|---|
| **Monthly Orders** | Total completed orders per month | 1,000 | 50,000 |
| **Monthly Revenue** | Gross revenue before COGS | ฿150,000 | ฿10,000,000 |
| **Gross Margin %** | (Revenue − COGS) / Revenue | ≥ 8% | ≥ 10% |
| **Average Order Value (AOV)** | Revenue / Orders | ฿150 | ฿200 |
| **Repeat Purchase Rate** | % orders from returning customers | 15% | 25% |
| **Customer Acquisition Cost (CAC)** | Marketing spend / New customers | < ฿50 | < ฿30 |
| **Return on Ad Spend (ROAS)** | Revenue attributable to paid ads / Ad spend | ≥ 3× | ≥ 5× |

### 7.2 Product & Technical KPIs

| KPI | Definition | Target |
|---|---|---|
| **Code Delivery Time (P95)** | 95th percentile time from payment confirmation to code delivery | < 60 seconds |
| **Payment Success Rate** | Successful payments / Total payment attempts | ≥ 98% |
| **Storefront Uptime** | Monthly availability | ≥ 99.9% |
| **Page Load Speed (LCP)** | Largest Contentful Paint on product pages | < 2.5s (mobile) |
| **Cart Abandonment Rate** | Abandoned carts / Initiated checkouts | < 30% |
| **Error Rate (5xx)** | Server errors / Total requests | < 0.1% |
| **Core Web Vitals** | Google CWV pass rate | ≥ 90% pages passing |

### 7.3 Customer Experience KPIs

| KPI | Definition | Target |
|---|---|---|
| **Customer Satisfaction (CSAT)** | Post-purchase rating (1–5) | ≥ 4.5 / 5 |
| **Support Ticket Rate** | Tickets per 100 orders | < 2 |
| **Refund / Dispute Rate** | Refunds / Total orders | < 1% |
| **Time to Resolution (TTR)** | Avg. time to resolve support ticket | < 4 hours |

### 7.4 SEO / Marketing KPIs

| KPI | Definition | Target (Month 6) | Target (Month 12) |
|---|---|---|---|
| **Organic Sessions / Month** | Google Search-driven sessions | 5,000 | 50,000 |
| **Keyword Rankings (Top 10)** | Thai-language high-intent keywords in top 10 | 5 | 20 |
| **Conversion Rate (CVR)** | Orders / Sessions | ≥ 2% | ≥ 3% |
| **Bounce Rate** | Single-page sessions / Total sessions | < 55% | < 45% |

---

## 8. Risk Register

### 8.1 Risk Matrix

| Risk ID | Risk | Category | Likelihood | Impact | Severity | Mitigation Strategy | Owner |
|---|---|---|---|---|---|---|---|
| R-01 | Gift card supplier fails to deliver codes on time | Supply Chain | Medium | Critical | **High** | Multi-supplier strategy; buffer stock for top-selling SKUs; automated low-stock alerts | Founder |
| R-02 | Payment gateway outage (PromptPay or card processor) | Technical | Low | Critical | **High** | Integrate two payment gateways (primary + fallback); implement circuit breaker pattern | Engineering |
| R-03 | Code fraud / reselling stolen gift card codes | Security | Medium | High | **High** | Purchase only from authorised distributors; verify all suppliers; implement order velocity limits | Founder |
| R-04 | PDPA non-compliance leading to regulatory action | Legal | Medium | High | **High** | Implement PDPA compliance from day one (consent management, data subject rights, DPO-lite); legal review before launch | Founder |
| R-05 | Customer receives invalid / already-used code | Operational | Medium | High | **High** | Automated code validation before delivery; instant replacement SLA; supplier accountability clause | Operations |
| R-06 | Competitor price undercutting erodes margin | Market | High | Medium | **High** | Focus on speed, trust, and UX as non-price differentiators; loyalty programme; SEO moat | Founder |
| R-07 | Platform DDoS / bot abuse (credential stuffing, coupon abuse) | Security | Medium | High | **High** | Cloudflare WAF + rate limiting; CAPTCHA on checkout; bot detection | Engineering |
| R-08 | Budget overrun on outsourced development | Financial | Medium | High | **High** | Fixed-scope contract with outsourced team; milestone-based payments; scope locked by this charter | Founder |
| R-09 | Supplier changes API without notice | Technical | Low | Medium | **Medium** | Abstraction layer in code (Adapter pattern); supplier contracts with change notice clauses | Engineering |
| R-10 | Thai VAT registration delay | Legal/Financial | Low | Medium | **Medium** | Engage Thai tax advisor pre-launch; build VAT-inclusive pricing from day one | Founder |
| R-11 | Low organic traffic at launch | Marketing | High | Medium | **Medium** | Pre-launch SEO content strategy; social media seeding; paid ads for initial traction | Founder |
| R-12 | Outsourced dev team quality / delivery risk | Operational | Medium | High | **High** | Detailed technical specification documents; weekly milestone reviews; code review process | Founder |
| R-13 | Chargeback fraud (buy card, chargeback credit card) | Financial/Security | Medium | High | **High** | 3DS2 authentication required; velocity checks; flag high-risk orders; chargeback dispute process | Engineering |

### 8.2 Risk Response Plan Summary

- **R-01, R-03, R-05** (Supply / Code Quality): Establish supplier SLAs before launch. Implement automated code validation pipeline. Maintain ≥ 7-day buffer stock on top 10 SKUs.
- **R-04** (PDPA): Engage a Thai legal advisor for a one-time PDPA readiness review (budgeted at ฿10,000–฿20,000). Implement cookie consent, privacy policy, and data subject request flow before go-live.
- **R-07, R-13** (Security / Fraud): Cloudflare Free/Pro tier from day one. 3DS2 via payment gateway. Order velocity limits in application logic.
- **R-08, R-12** (Dev Risk): This charter and subsequent technical documents serve as the fixed specification. Outsourced team must sign off on scope before coding begins.

---

## 9. Project Scope

### 9.1 In-Scope — MVP (Launch in ≤ 8 Weeks)

#### Storefront
- Thai-language-first responsive web application (desktop + mobile)
- Homepage with featured products, categories, promotional banners
- Category pages (Gaming, Streaming, E-Commerce)
- Product detail pages (denomination variants, description, delivery info)
- Search functionality (Thai and English product names)
- Cart and guest checkout flow (no mandatory account creation)
- Order confirmation page with instant code display
- Order confirmation email with code delivery (Thai language)
- Basic SEO: meta tags, Open Graph, sitemap.xml, robots.txt, structured data (Product schema)

#### Product Catalogue Management
- Admin panel: add / edit / remove gift card products
- SKU management with denomination variants (e.g., ฿50, ฿100, ฿300, ฿500)
- Category and tag management
- Stock / code inventory management (upload codes in bulk via CSV)
- Low-stock alerts (email notification to admin)
- Product visibility controls (published / draft / out-of-stock)

#### Order Management
- Order lifecycle: pending → payment confirmed → code delivered → completed
- Automated code assignment and delivery on payment confirmation
- Order history (accessible by order ID + email, no account required)
- Admin order dashboard: view, search, filter, manually resend code
- Refund / void capability in admin panel

#### Payments
- **PromptPay / Thai QR Payment** via payment gateway
- **Credit / Debit Card** (Visa, Mastercard) via payment gateway
- Payment webhook handling with idempotency
- VAT 7% calculated and displayed at checkout
- Tax invoice / receipt generation (PDF, downloadable post-purchase)
- 3DS2 authentication for card payments

#### Security & Trust
- HTTPS (TLS 1.3) enforced site-wide
- Cloudflare WAF and DDoS protection
- Rate limiting on checkout and payment endpoints
- CAPTCHA on checkout (Google reCAPTCHA v3)
- Order velocity limits per IP / email
- 3DS2 for card payments (chargeback protection)
- Admin panel protected by 2FA

#### PDPA Compliance (Day-One Requirements)
- Cookie consent banner (Thai language) with granular consent controls
- Privacy Policy page (Thai + English)
- Terms of Service page (Thai + English)
- Data subject rights request form (access, deletion, correction)
- Consent audit log stored in database

#### Basic Analytics
- Google Analytics 4 integration
- Google Search Console setup
- Conversion tracking (purchase event)

### 9.2 In-Scope — Phase 2 (Months 2–6, Post-Launch)

- Optional customer account creation (order history, saved preferences)
- Loyalty / points system redeemable as store credit
- Affiliate / referral programme
- Promotional voucher / discount code engine
- LINE OA integration (order notifications via LINE)
- Admin dashboard analytics (revenue, top SKUs, conversion funnel)
- Bulk order / B2B order flow
- Supplier API integration (auto-fulfilment where supplier provides API)

---

## 10. Out of Scope

The following are explicitly excluded from this project. They must not be built, estimated, or designed unless a formal scope change is approved.

| # | Out-of-Scope Item | Reason |
|---|---|---|
| OOS-01 | **Multi-vendor marketplace** (other sellers listing on Nong-Kati) | Single-brand store only |
| OOS-02 | **Physical goods fulfilment** | Digital products only |
| OOS-03 | **Subscription billing / recurring payments** | One-time purchase model only |
| OOS-04 | **Multi-language (English, Chinese, etc.)** | Thai market only at launch |
| OOS-05 | **Multi-currency** | Thai Baht (THB) only |
| OOS-06 | **Mobile native app** (iOS / Android) | Web-first; app is Phase 3+ |
| OOS-07 | **Custom payment gateway development** | Use existing Thai-licensed gateway |
| OOS-08 | **Crypto / Web3 payments** | Not in target market payment behaviour |
| OOS-09 | **International shipping or fulfilment** | Domestic Thai market only |
| OOS-10 | **Live chat support system** | Phase 2; use LINE OA for support initially |
| OOS-11 | **DRM / digital rights management** | Gift card codes have no DRM requirement |
| OOS-12 | **Auction / bidding / dynamic pricing engine** | Fixed retail pricing only |
| OOS-13 | **ERP / accounting system integration** | Manual reconciliation at this scale |
| OOS-14 | **Custom CMS for blog / editorial content** | Use static pages for SEO content at launch |

---

## 11. Technology Constraints

### 11.1 Mandatory Constraints

| Constraint | Rationale |
|---|---|
| **Thai Baht (THB) only** | Single-currency Thai market; no forex complexity |
| **Thai-language-first UI** | Primary customers are Thai speakers; all customer-facing copy must be Thai |
| **Payment gateway must be BOT-licensed** | Bank of Thailand requires payment processing to use licensed Payment Service Providers |
| **VAT 7% must be calculated and remitted** | Thai Revenue Department requirement for digital goods sold domestically |
| **PDPA compliance from day one** | Personal Data Protection Act B.E. 2562 (PDPA) is enforceable — non-compliance carries fines up to ฿5M per violation |
| **TLS 1.3 / HTTPS enforced** | Security baseline; required by all payment gateways |
| **3DS2 for card payments** | Required by card schemes (Visa, Mastercard) for CNP (card-not-present) transactions in Thailand |
| **No storing raw card data** | PCI-DSS — card data must never touch Nong-Kati servers; tokenisation via gateway only |

### 11.2 Budget-Driven Technology Constraints (฿150K Ceiling)

Given the ฿150,000 budget ceiling and solo-founder / outsourced team model, the following constraints apply:

| Area | Constraint | Rationale |
|---|---|---|
| **Hosting** | Use managed cloud (e.g., Vercel + Supabase, or Render + Railway) over bare-metal or self-managed Kubernetes | Minimise DevOps overhead; no dedicated DevOps engineer |
| **Payment Gateway** | Use a single Thai-licensed gateway at launch (Omise/Opn Payments or 2C2P) | Dual-gateway is Phase 2 once revenue justifies the fee |
| **Email Delivery** | Use transactional email SaaS (Resend, SendGrid, or Postmark) | No self-hosted mail server |
| **CDN / WAF** | Cloudflare Free or Pro tier | Under budget; handles DDoS and caching |
| **Framework** | Next.js (React) — SSR + SSG for SEO | Most Thai outsourced developers are familiar; strong ecosystem |
| **Database** | PostgreSQL (managed) | Relational model suits order/inventory/product data; ACID guarantees |
| **No microservices at launch** | Monolith-first architecture | Team size and budget do not support distributed systems; modular monolith designed for future extraction |

### 11.3 Recommended Technology Stack (Guidance for Outsourced Team)

| Layer | Technology | Notes |
|---|---|---|
| **Frontend** | Next.js 14+ (App Router), TypeScript, Tailwind CSS | SSR for product pages (SEO); client components for cart/checkout |
| **Backend** | Next.js API Routes or separate Node.js (Express/Fastify) | To be confirmed in architecture document |
| **Database** | PostgreSQL 15+ (managed: Supabase or Railway) | |
| **ORM** | Prisma | Type-safe, migration management |
| **Auth (Admin)** | NextAuth.js or Clerk | Admin panel only; customers use guest checkout |
| **Payments** | Omise (Opn Payments) or 2C2P | Both BOT-licensed, support PromptPay + card |
| **Email** | Resend or SendGrid | Transactional (order confirmation, code delivery) |
| **File Storage** | Cloudflare R2 or Supabase Storage | Product images, PDF tax invoices |
| **CDN / WAF** | Cloudflare | Free tier sufficient at launch |
| **Monitoring** | Sentry (errors) + Vercel Analytics or Plausible | |
| **CI/CD** | GitHub Actions | Automated deploy on merge to main |

> **Note:** The final architecture document (01-architecture.md) will specify the definitive stack. This charter defines the constraints within which that decision must be made.

---

## 12. Compliance & Legal Requirements

### 12.1 Thai VAT (Value Added Tax)

| Requirement | Detail |
|---|---|
| **Rate** | 7% VAT on all digital goods sold to Thai consumers |
| **Registration Threshold** | Annual revenue ≥ ฿1,800,000 requires VAT registration; register proactively if targeting medium scale |
| **Invoice Requirement** | Must issue tax invoice (ใบกำกับภาษี) on request; full tax invoices require VAT registration number |
| **Implementation** | Prices displayed inclusive of VAT; VAT amount shown separately at checkout; PDF tax invoice generated per order |

### 12.2 PDPA (Personal Data Protection Act B.E. 2562)

| Requirement | Detail |
|---|---|
| **Applicability** | Applies from day one — Nong-Kati collects name, email, and payment-related data from consumers |
| **Lawful Basis** | Contract performance (to fulfil order); Legitimate interest (fraud prevention); Consent (marketing emails) |
| **Consent Management** | Cookie consent banner; separate opt-in for marketing communications |
| **Data Subject Rights** | Right to access, correct, delete, and port personal data — must have a request mechanism |
| **Retention Policy** | Order data: 5 years (tax obligation); Marketing data: until consent withdrawn |
| **Security Measures** | Encrypted data at rest and in transit; access controls; audit logging |
| **Data Breach Response** | Must notify PDPC within 72 hours of a data breach; notify affected individuals without undue delay |
| **DPO Requirement** | DPO required if processing at large scale; at launch, founder acts as DPO-lite with external legal counsel on retainer |

### 12.3 BOT Payment Regulations

| Requirement | Detail |
|---|---|
| **Payment Service Provider** | Must use a BOT-licensed PSP; Nong-Kati does not require its own PSP licence as it is a merchant |
| **PromptPay** | Operated under NITMX / BOT framework; must use licensed gateway |
| **Card Payments** | Must comply with card scheme rules (PCI-DSS via gateway tokenisation) |
| **No Card Data Storage** | Raw card numbers, CVV, and full PAN must never be stored on Nong-Kati servers |

### 12.4 Consumer Protection Act (B.E. 2522 / Amendments)

| Requirement | Detail |
|---|---|
| **Refund Policy** | Must clearly state refund and return policy; digital goods have specific conditions |
| **Advertising Standards** | Promotions and pricing must not be misleading |
| **Terms of Service** | Must be available in Thai; must be accepted before purchase |

### 12.5 Electronic Transactions Act (B.E. 2544)

| Requirement | Detail |
|---|---|
| **Electronic Records** | Digital order records and electronic receipts have legal standing if stored correctly |
| **Digital Signatures** | Email order confirmation constitutes electronic transaction evidence |

> **Recommended Action (Pre-Launch):** Engage a Thai legal advisor for a 2–3 hour review of Privacy Policy, Terms of Service, and VAT registration status. Estimated cost: ฿15,000–฿25,000. This is a mandatory pre-launch gate.

---

## 13. Success Criteria

### 13.1 Launch Success (Day 1–30)

The platform will be considered successfully launched if ALL of the following are true within 30 days of go-live:

| Criterion | Threshold |
|---|---|
| Platform is publicly accessible and stable | ✅ Uptime ≥ 99.9% in first 30 days |
| Payments are processing successfully | ✅ Payment success rate ≥ 98% |
| Code delivery is working automatically | ✅ ≥ 95% of orders auto-delivered within 60 seconds |
| At least 30 SKUs are live and purchasable | ✅ Confirmed by product catalogue audit |
| PDPA-required pages are live | ✅ Privacy Policy, T&C, Cookie Consent are live |
| First paid order has been placed | ✅ At least 1 real paid order |
| No critical security vulnerabilities | ✅ No unresolved OWASP Top 10 vulnerabilities |

### 13.2 3-Month Success

| Criterion | Threshold |
|---|---|
| Monthly order volume | ≥ 500 orders/month |
| Payment success rate | ≥ 98% |
| Code delivery within 60 seconds (P95) | ≥ 95% |
| Gross margin | ≥ 8% blended |
| Customer satisfaction (CSAT) | ≥ 4.0 / 5.0 |
| Zero critical data breaches | ✅ |

### 13.3 12-Month Success

| Criterion | Threshold |
|---|---|
| Monthly order volume | ≥ 10,000 orders/month |
| Monthly gross revenue | ≥ ฿2,000,000 |
| Gross margin | ≥ 10% |
| Organic search sessions | ≥ 20,000/month |
| Repeat purchase rate | ≥ 20% |
| Platform uptime | ≥ 99.9% annual |
| Full PDPA compliance | ✅ Passed internal review |

---

## 14. Assumptions & Dependencies

### 14.1 Assumptions

| # | Assumption |
|---|---|
| A-01 | At least 2 Thai-licensed gift card distributors / suppliers can be contracted before launch |
| A-02 | The chosen payment gateway (Omise or 2C2P) supports both PromptPay and card payments and can be integrated within the budget |
| A-03 | Outsourced development team is proficient in Next.js, TypeScript, and PostgreSQL |
| A-04 | Founder can provide brand assets (logo, colour palette, typography) within the first week of the project |
| A-05 | Domain name is available and registered prior to development start |
| A-06 | Supplier gift card codes can be delivered digitally (CSV or API) and stored securely in the platform database |
| A-07 | Thai VAT registration, if required, can be obtained within the launch timeline; if not, gross pricing will be used initially with retroactive VAT accounting |
| A-08 | The outsourced team will operate under a fixed-scope contract with milestone-based delivery |

### 14.2 Dependencies

| # | Dependency | Risk if Delayed |
|---|---|---|
| D-01 | Payment gateway account approval (Omise / 2C2P) | Cannot process payments; launch blocked |
| D-02 | Gift card supplier agreements | No inventory to sell; launch blocked |
| D-03 | Domain registration and DNS configuration | Cannot go live |
| D-04 | Brand assets delivery from founder | UI/UX development blocked |
| D-05 | Legal review of Privacy Policy and Terms of Service | PDPA compliance gate; launch risk |
| D-06 | Cloudflare account setup and DNS transfer | Security and CDN blocked |

---

## 15. Stakeholders

| Stakeholder | Role | Responsibilities | Communication |
|---|---|---|---|
| **Founder / Product Owner** | Decision maker, DPO-lite, Operations | Final approval on all decisions; supplier relationships; marketing; legal liaison | Daily |
| **Outsourced Development Team** | Engineering | Build, test, and deploy all technical components per specification documents | Weekly milestone review |
| **Gift Card Suppliers / Distributors** | Supply chain | Provide code inventory; maintain API (where applicable) | As needed |
| **Payment Gateway (Omise / 2C2P)** | Payment infrastructure | Process payments; handle 3DS2; provide webhooks | Setup + support |
| **Thai Legal Advisor** | Legal / Compliance | Review T&C, Privacy Policy, VAT status | Pre-launch review |
| **Customers** | Revenue source | Purchase gift cards; provide CSAT feedback | Post-purchase email |

---

## 16. Budget & Timeline

### 16.1 Budget Allocation (฿150,000 Ceiling)

| Category | Estimated Cost | Notes |
|---|---|---|
| **Outsourced Development** | ฿90,000–฿110,000 | Fixed-scope contract; includes design, frontend, backend, admin panel |
| **Legal Review** (PDPA / T&C) | ฿15,000–฿25,000 | One-time pre-launch review |
| **Infrastructure (Year 1)** | ฿10,000–฿15,000 | Hosting, CDN, database, email, monitoring |
| **Payment Gateway Setup** | ฿0–฿5,000 | Most Thai gateways are free to integrate; transaction fees apply per order |
| **Domain + SSL** | ฿500–฿2,000 | .co.th or .com domain |
| **Buffer / Contingency** | ฿10,000 | Scope creep, emergency fixes |
| **Total** | **฿125,500–฿157,000** | Within budget with careful management |

> ⚠️ **Budget Risk:** Legal review cost could push total over ฿150K ceiling. Founder should prioritise legal spend — non-compliance fines vastly exceed the advisory cost.

### 16.2 High-Level Timeline (8-Week Launch Plan)

| Week | Milestone | Deliverables |
|---|---|---|
| **Week 1** | Project kickoff | Finalised technical spec, brand assets delivered, domain registered, gateway account applied |
| **Week 2** | Design & architecture | UI/UX wireframes approved, database schema finalised, dev environment set up |
| **Week 3–4** | Core development | Product catalogue, cart, checkout flow, payment integration |
| **Week 5** | Admin panel + code delivery | Admin CRUD, code inventory, automated delivery pipeline |
| **Week 6** | Security + compliance | PDPA pages, cookie consent, WAF setup, 3DS2 testing |
| **Week 7** | QA + UAT | Full end-to-end testing, payment sandbox testing, performance testing |
| **Week 8** | Launch | DNS cutover, production deploy, monitoring active, first order |

---

## 17. Glossary

| Term | Definition |
|---|---|
| **SKU** | Stock Keeping Unit — a unique identifier for a specific gift card product and denomination |
| **Code** | The alphanumeric gift card code delivered to the customer after purchase |
| **PromptPay** | Thailand's national interbank instant payment system operated under BOT / NITMX |
| **Thai QR Payment** | QR code-based payment standard in Thailand (PromptPay QR) |
| **BOT** | Bank of Thailand — the central bank and financial regulator |
| **PDPA** | Personal Data Protection Act B.E. 2562 — Thailand's primary data privacy law |
| **VAT** | Value Added Tax — currently 7% in Thailand on goods and services |
| **PSP** | Payment Service Provider — a licensed entity that processes payments |
| **3DS2** | 3-D Secure version 2 — card authentication protocol for CNP transactions |
| **CNP** | Card Not Present — online card transaction where the physical card is not used |
| **COGS** | Cost of Goods Sold — the wholesale cost of gift card codes |
| **AOV** | Average Order Value |
| **CAC** | Customer Acquisition Cost |
| **CSAT** | Customer Satisfaction Score |
| **DPO** | Data Protection Officer — required role under PDPA for large-scale processors |
| **LCP** | Largest Contentful Paint — Core Web Vitals metric for page load performance |
| **WAF** | Web Application Firewall |
| **OWASP** | Open Web Application Security Project — security vulnerability framework |
| **SSR** | Server-Side Rendering — renders pages on the server for SEO and performance |
| **SSG** | Static Site Generation — pre-renders pages at build time |
| **PDPC** | Personal Data Protection Committee — Thailand's data protection authority |

---

*End of Document — 00-project-charter.md v1.0.0*

*This document is the single source of truth for the Nong-Kati platform. All engineering, design, legal, and operational decisions must be made within the constraints and goals defined herein.*
