
---

# Nong-kati Digital Gift Card Marketplace — System Architecture

**Document version:** 1.0
**Status:** Draft
**Owner:** Product
**Last updated:** 2026-06-26

---

## 1. Project Overview

Digital gift card marketplace where consumers buy prepaid codes and gift cards from major gaming, entertainment, and retail brands — instantly, securely, online.

Platform sells codes from brands including Steam Wallet, PlayStation Store, Xbox, Nintendo eShop, Google Play, Apple Gift Card, Netflix, Spotify, and Amazon. Codes delivered digitally, immediately after payment confirms. No physical fulfillment. No subscription required.

**Core promise to customer:** Right code, right denomination, right price — in their inbox in under 60 seconds.

**Problem being solved:** Consumers currently buy gift cards from physical retailers (inconvenient, limited stock, store hours) or unreliable third-party resellers (fraud risk, slow delivery, poor UX). No dominant trusted online-first marketplace owns this space at premium quality.

**Cost of not solving it:** Lost revenue to grey-market sellers, high fraud rates in existing solutions, poor customer trust. Market growing ~12% YoY as gaming and streaming spend increases.

---

## 2. Business Goals

| # | Goal | Target | Timeframe |
|---|------|--------|-----------|
| BG-1 | Reach profitability on unit economics | GM ≥ 12% per order | Month 6 |
| BG-2 | Build trusted brand — repeat purchase rate | ≥ 35% of customers buy again within 90 days | Month 9 |
| BG-3 | Grow catalog breadth | ≥ 40 distinct products at launch, ≥ 100 by month 6 | Month 6 |
| BG-4 | Minimize fraud losses | Chargeback rate ≤ 0.5% of GMV | Ongoing |
| BG-5 | Unlock B2B revenue stream | ≥ 5 active reseller API clients | Month 9 |
| BG-6 | Achieve code delivery SLA | 95% of codes delivered within 60s of payment | Day 1 |

---

## 3. Target Users

### Primary: Individual Consumer (B2C)

**Persona A — The Gifter**
- Age 25–45, buys gift cards for birthdays, holidays, "thinking of you"
- Values: convenience, trusted brand, instant delivery, gift presentation
- Pain point: physical stores are inconvenient; needs it now, not tomorrow
- Purchase frequency: 3–5× per year

**Persona B — The Self-Purchaser (Gamer/Subscriber)**
- Age 16–35, buys Steam/PSN/Xbox wallet top-ups for themselves
- Values: best price, wide denomination options, instant delivery
- Pain point: region restrictions, credit card not accepted by platform, wants local payment method
- Purchase frequency: 1–2× per month

**Persona C — The Parent**
- Age 30–50, buys game credits or streaming codes for children
- Values: safety, ease of use, trusted platform
- Pain point: doesn't want to add credit card to child's gaming account

### Secondary: Business (B2B)

**Persona D — Reseller / Loyalty Platform**
- Companies embedding gift card purchasing into their product (HR reward platforms, loyalty apps)
- Values: API access, bulk pricing, reliable stock, webhook delivery
- Purchase frequency: high volume, automated

---

## 4. Functional Requirements

### Priority Legend
- **P0** — Must ship. Feature is non-viable without it.
- **P1** — Ship in v1 if capacity allows; fast-follow if not.
- **P2** — Future version. Design must not block it.

---

### 4.1 Catalog & Discovery

| ID | Requirement | Priority |
|----|-------------|----------|
| CAT-01 | Display product catalog browsable by category (Gaming, Entertainment, Shopping, Other) | P0 |
| CAT-02 | Each product has: brand name, logo, denomination options, region, short description, redemption instructions | P0 |
| CAT-03 | Real-time stock status per denomination: In Stock / Low Stock (≤10 codes) / Out of Stock | P0 |
| CAT-04 | Full-text search with typo tolerance across product names and brands | P0 |
| CAT-05 | Filter catalog by: category, brand, denomination range, region | P1 |
| CAT-06 | Sort results by: featured, price (asc/desc), newest | P1 |
| CAT-07 | Featured / promoted products on homepage (admin-configurable) | P1 |
| CAT-08 | Related products shown on product page | P2 |
| CAT-09 | Price alert: notify user when out-of-stock item restocks | P2 |

---

### 4.2 User Authentication & Accounts

| ID | Requirement | Priority |
|----|-------------|----------|
| AUTH-01 | Customer registration via email + password | P0 |
| AUTH-02 | Customer login with email + password | P0 |
| AUTH-03 | Guest checkout — purchase without account (email required) | P0 |
| AUTH-04 | Password reset via email link (expires 1 hour) | P0 |
| AUTH-05 | JWT access token (15 min) + refresh token (30 days, httpOnly cookie) | P0 |
| AUTH-06 | Optional TOTP-based MFA for customer accounts | P1 |
| AUTH-07 | "Remember this device" — skip MFA on trusted devices for 30 days | P1 |
| AUTH-08 | OAuth login: Google, Apple | P2 |
| AUTH-09 | Email verification on registration (send verify link, restrict purchases until verified) | P1 |

---

### 4.3 Cart & Checkout

| ID | Requirement | Priority |
|----|-------------|----------|
| CHK-01 | Add product variant (denomination) to cart | P0 |
| CHK-02 | Update quantity per cart item (max 5 per variant per order, configurable) | P0 |
| CHK-03 | Remove items from cart | P0 |
| CHK-04 | Cart persists for authenticated users (30 days) | P1 |
| CHK-05 | Guest cart persists in localStorage for session | P0 |
| CHK-06 | Apply promo/discount code at checkout — validate and show discount amount | P0 |
| CHK-07 | Order summary: itemized subtotal, discount, total, currency | P0 |
| CHK-08 | Region mismatch warning: if customer IP country ≠ product region, show clear warning before purchase | P0 |
| CHK-09 | Out-of-stock check at checkout time (not just display) — prevent purchase if stock gone | P0 |
| CHK-10 | Save billing email for future orders (authenticated users) | P1 |

---

### 4.4 Payment

| ID | Requirement | Priority |
|----|-------------|----------|
| PAY-01 | Accept payment via Stripe (Visa, Mastercard, Amex, Apple Pay, Google Pay) | P0 |
| PAY-02 | Accept payment via PayPal | P0 |
| PAY-03 | Stripe 3DS2 triggered automatically on high-risk transactions | P0 |
| PAY-04 | Idempotent payment creation — duplicate order prevention | P0 |
| PAY-05 | Display payment errors in human-readable language (not raw Stripe codes) | P0 |
| PAY-06 | Save tokenized payment methods for authenticated users (Stripe Customer object) | P1 |
| PAY-07 | Cryptocurrency payments (BTC, ETH, USDC) | P2 |
| PAY-08 | Multi-currency checkout (charge in customer's currency) | P2 |

---

### 4.5 Fraud Prevention

| ID | Requirement | Priority |
|----|-------------|----------|
| FRD-01 | Calculate fraud score per order before payment confirmation | P0 |
| FRD-02 | Auto-block orders with fraud score > 70 (configurable threshold) | P0 |
| FRD-03 | Flag orders with score 40–70 for manual review queue | P0 |
| FRD-04 | Velocity checks: max 3 orders per IP per hour; max 5 orders per email per day | P0 |
| FRD-05 | Device fingerprinting on checkout page | P0 |
| FRD-06 | IP geolocation: flag if IP country ≠ billing country | P0 |
| FRD-07 | Block list: IP, email, card BIN — admin-managed | P0 |
| FRD-08 | Allow list: override fraud rules for known-good customers | P1 |
| FRD-09 | Stripe Radar integration for ML-based card fraud | P0 |
| FRD-10 | Chargeback tracking — auto-suspend account after 2 chargebacks | P1 |

---

### 4.6 Code Delivery

| ID | Requirement | Priority |
|----|-------------|----------|
| DEL-01 | Display code(s) on-screen immediately after payment confirms | P0 |
| DEL-02 | Send order confirmation email with code(s) and redemption instructions within 60 seconds | P0 |
| DEL-03 | Code reveal requires one click (not auto-visible for screen security) | P0 |
| DEL-04 | PDF download of order with code(s) | P1 |
| DEL-05 | Authenticated user can re-view codes from order history (up to 30 days post-purchase) | P0 |
| DEL-06 | Manual code resend from order page (customer self-service, max 3 resends per order) | P0 |
| DEL-07 | Guest order lookup: email + order ID → shows codes | P0 |
| DEL-08 | Webhook delivery for reseller API orders | P0 (B2B) |
| DEL-09 | Delivery failure alert: ops notified if delivery fails after 3 retries | P0 |
| DEL-10 | Delivery failure fallback: support ticket auto-created for manual resolution | P0 |

---

### 4.7 Order Management (Customer)

| ID | Requirement | Priority |
|----|-------------|----------|
| ORD-01 | Authenticated users see full order history | P0 |
| ORD-02 | Order detail page: items, codes (masked/reveal), payment info, delivery status | P0 |
| ORD-03 | Order status tracking: Pending → Processing → Completed / Failed | P0 |
| ORD-04 | Submit refund/support request from order page | P1 |
| ORD-05 | Email receipt resend from account | P1 |

---

### 4.8 Inventory Management (Admin)

| ID | Requirement | Priority |
|----|-------------|----------|
| INV-01 | Admin uploads codes via CSV (columns: code, variant_id, supplier_ref) | P0 |
| INV-02 | CSV import validates: duplicate detection via hash, format check, variant existence | P0 |
| INV-03 | Import result report: X added, Y duplicates skipped, Z errors | P0 |
| INV-04 | Stock count per variant visible in admin dashboard | P0 |
| INV-05 | Low-stock alerts: email/Slack notification when variant drops below threshold (configurable) | P0 |
| INV-06 | Manually mark individual codes as invalid/expired | P0 |
| INV-07 | Supplier API integration: auto-pull codes on schedule | P1 |
| INV-08 | Supplier self-service portal: suppliers upload codes via authenticated portal | P2 |

---

### 4.9 Product & Pricing Management (Admin)

| ID | Requirement | Priority |
|----|-------------|----------|
| PRD-01 | Create/edit/archive product listings | P0 |
| PRD-02 | Manage product variants (denominations, currency, region, cost price, retail price) | P0 |
| PRD-03 | Set margin per variant — show projected margin in admin UI | P0 |
| PRD-04 | Create promo codes: percent or fixed discount, per-product or global, usage limits, date range | P0 |
| PRD-05 | SEO fields per product: meta title, description, slug | P1 |
| PRD-06 | Flash sale scheduler: set sale price + start/end time per variant | P1 |
| PRD-07 | Bulk price update via CSV | P2 |

---

### 4.10 Admin Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| ADM-01 | Admin dashboard: revenue today/week/month, orders count, top products | P0 |
| ADM-02 | Full order search: by email, order ID, status, date range | P0 |
| ADM-03 | Manual code resend on any order | P0 |
| ADM-04 | Initiate refund from admin (Stripe refund + mark code invalid) | P0 |
| ADM-05 | Fraud review queue: orders awaiting manual decision (approve / block) | P0 |
| ADM-06 | User account management: view, suspend, unsuspend | P0 |
| ADM-07 | Audit log: all admin actions logged with actor, timestamp, before/after state | P0 |
| ADM-08 | Configurable system settings: fraud thresholds, rate limits, refund window | P1 |
| ADM-09 | Revenue export (CSV) by date range | P1 |
| ADM-10 | Support ticket inbox (basic) or integration with Intercom/Zendesk | P1 |

---

### 4.11 Reseller / B2B API

| ID | Requirement | Priority |
|----|-------------|----------|
| RES-01 | Reseller applies for API access via web form | P0 |
| RES-02 | Admin approves/rejects reseller application | P0 |
| RES-03 | API key issued on approval, viewable in reseller portal | P0 |
| RES-04 | API endpoints: GET catalog, GET stock per variant, POST order, GET order status | P0 |
| RES-05 | Codes delivered via webhook on order completion | P0 |
| RES-06 | Rate limiting per API key (configurable per reseller) | P0 |
| RES-07 | Volume pricing tiers configured per reseller by admin | P1 |
| RES-08 | Reseller dashboard: order history, API usage stats, key rotation | P1 |

---

## 5. Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01 | **Performance** — Product catalog page load (LCP) | < 2.5s on 4G mobile |
| NFR-02 | **Performance** — Checkout page load | < 2.0s |
| NFR-03 | **Performance** — Code delivery after payment webhook | < 60s (p95) |
| NFR-04 | **Availability** — Uptime | ≥ 99.9% (< 8.7h downtime/year) |
| NFR-05 | **Scalability** — Concurrent checkout sessions | Handle 500 concurrent without degradation |
| NFR-06 | **Security** — Codes encrypted at rest | AES-256-GCM, KMS-managed keys |
| NFR-07 | **Security** — No card data stored on platform | Stripe handles all PAN data |
| NFR-08 | **Security** — Admin access | MFA required, audit log on all actions |
| NFR-09 | **Compliance** — GDPR | Right to deletion, data export, cookie consent |
| NFR-10 | **Compliance** — PCI-DSS | SAQ A (no card data on servers) |
| NFR-11 | **SEO** — Product pages | Server-side rendered, indexable by Google |
| NFR-12 | **Accessibility** — Core flows | WCAG 2.1 AA compliant |
| NFR-13 | **Mobile** — Storefront and checkout | Fully functional on iOS/Android browsers |
| NFR-14 | **Reliability** — Payment idempotency | Zero double-charges under any retry condition |
| NFR-15 | **Data integrity** — Code uniqueness | Same code never delivered to two customers |

---

## 6. User Stories

### Persona A — The Gifter

**US-01**
> As a gifter, I want to find a specific brand gift card quickly so I can buy it without browsing the entire catalog.

**US-02**
> As a gifter, I want to complete checkout without creating an account so that I can buy a gift card without commitment.

**US-03**
> As a gifter, I want to receive the code by email immediately after purchase so I can forward it to the recipient right away.

**US-04**
> As a gifter, I want to see clear redemption instructions on the code delivery page so I don't have to Google how to use it.

---

### Persona B — The Self-Purchaser (Gamer)

**US-05**
> As a gamer, I want to see all available denominations for a product upfront so I can pick the exact amount I need.

**US-06**
> As a gamer, I want to see a real-time stock indicator so I don't waste time at checkout only to find it's out of stock.

**US-07**
> As a gamer, I want to view my past purchases and reveal codes again so I don't lose access if I delete an email.

**US-08**
> As a gamer buying a region-locked card, I want a clear warning if the card region doesn't match my location so I don't buy a card I can't use.

**US-09**
> As a repeat customer, I want to save my payment method so checkout is faster next time.

---

### Persona C — The Parent

**US-10**
> As a parent, I want to pay for a gift card without entering my card details into a gaming platform so my payment info stays secure.

**US-11**
> As a parent, I want a simple, uncluttered checkout experience so I can complete the purchase without confusion.

---

### Persona D — Reseller

**US-12**
> As a reseller, I want to query current stock levels via API so I can display accurate availability in my own platform.

**US-13**
> As a reseller, I want to place bulk orders programmatically and receive codes via webhook so I can fulfill my customers instantly without manual steps.

**US-14**
> As a reseller, I want to rotate my API key from the portal without admin intervention so I can manage my own security hygiene.

---

### Admin

**US-15**
> As an admin, I want to upload a batch of codes via CSV so I can replenish inventory without developer involvement.

**US-16**
> As an admin, I want to see a fraud review queue so I can approve or block suspicious orders before codes are delivered.

**US-17**
> As an admin, I want every admin action logged with actor and timestamp so I can audit changes and investigate incidents.

**US-18**
> As an admin, I want to manually resend codes on any order so I can resolve customer delivery complaints quickly.

**US-19**
> As a support agent, I want to look up any order by email or ID so I can assist customers without needing database access.

---

## 7. Acceptance Criteria

### AC-01: Guest Checkout → Code Delivery (Core Flow)

**Given** an unauthenticated visitor on the checkout page with valid cart items
**When** they submit a valid email, complete Stripe payment successfully
**Then:**
- Payment captured within 5s of submit
- Code displayed on-screen within 60s of payment capture
- Confirmation email sent within 60s containing: order ID, code(s), redemption instructions, support contact
- Order record created with status `completed`
- Code marked `sold` in inventory — not allocatable to any other order

---

### AC-02: Out-of-Stock Race Condition

**Given** two customers simultaneously checkout the last available code for a variant
**When** both payments process concurrently
**Then:**
- Exactly one customer receives the code
- The other customer receives a payment failure or refund within 5 minutes
- No code is delivered twice
- No order is left in `paid` status without a delivered code

---

### AC-03: Fraud Block

**Given** an order with fraud score > 70
**When** customer submits checkout
**Then:**
- Payment is NOT captured (PaymentIntent not confirmed)
- Customer sees generic decline message (no fraud reason exposed)
- Order stored with status `failed`, fraud_action `block`
- Admin fraud log records the event with rule breakdown

---

### AC-04: CSV Code Import

**Given** admin uploads a CSV with 1,000 rows
**When** import completes
**Then:**
- Duplicate codes (matching existing `code_hash`) skipped, counted in report
- Malformed rows (missing fields, wrong format) rejected, listed in error report
- Valid new codes added to `code_inventory` with status `available`
- Stock count for affected variant(s) updated immediately
- Admin sees summary: "950 added, 40 duplicates skipped, 10 errors"

---

### AC-05: Promo Code Validation

**Given** a promo code with 50% discount, max 100 uses, valid until end of month
**When** customer applies code at checkout
**Then:**
- If valid: discount applied to order total, displayed before payment
- If expired: error "This code has expired"
- If usage limit reached: error "This code is no longer available"
- If cart doesn't meet minimum order value: error "Minimum order of $X required"
- Concurrent use: 100 simultaneous users applying last-use code → exactly 1 succeeds, 99 see "no longer available"

---

### AC-06: Reseller Webhook Delivery

**Given** reseller places API order and payment succeeds
**When** code is allocated
**Then:**
- Webhook POST sent to reseller's configured endpoint within 60s
- Payload includes: order_id, variant_id, code(s), timestamp
- If webhook fails (non-2xx): retry 3× with exponential backoff (1min, 5min, 15min)
- After 3 failures: ops alert triggered, reseller order flagged for manual follow-up
- Webhook signed with HMAC-SHA256 — reseller can verify authenticity

---

### AC-07: Admin Refund

**Given** admin initiates refund on a completed order within the refund window
**When** admin submits refund reason and confirms
**Then:**
- Stripe refund API called — full or partial amount processed
- Code(s) on that order marked `invalid` — cannot be resold
- Order status updated to `refunded`
- Customer notified by email: amount refunded, timeline (3–5 business days)
- Audit log records: admin actor, order ID, amount, reason, timestamp

---

### AC-08: Low Stock Alert

**Given** a variant with low-stock threshold set to 10
**When** available code count drops to 10 or below
**Then:**
- Admin receives email notification within 5 minutes
- Product variant displays "Low Stock" badge on storefront
- At 0 remaining codes: variant shows "Out of Stock", add-to-cart disabled

---

## 8. Success Metrics

### Launch (Day 1–30)

| Metric | Minimum Success | Stretch |
|--------|----------------|---------|
| Code delivery within 60s | ≥ 95% of orders | ≥ 99% |
| Checkout completion rate | ≥ 60% (initiated → paid) | ≥ 70% |
| Payment success rate | ≥ 92% of attempts | ≥ 95% |
| Fraud block rate | ≤ 3% of legitimate orders blocked | ≤ 1% |
| Uptime | ≥ 99.5% | ≥ 99.9% |
| First 50 orders | Complete with zero manual intervention | — |

### Month 3

| Metric | Minimum Success | Stretch |
|--------|----------------|---------|
| Monthly GMV | $50,000 | $150,000 |
| Chargeback rate | ≤ 0.5% | ≤ 0.2% |
| Repeat purchase rate (30-day) | ≥ 25% | ≥ 35% |
| Support ticket rate | ≤ 2% of orders generate ticket | ≤ 0.5% |
| Catalog size | ≥ 40 products | ≥ 60 |

### Month 9

| Metric | Minimum Success | Stretch |
|--------|----------------|---------|
| Monthly GMV | $300,000 | $1,000,000 |
| Gross margin | ≥ 10% | ≥ 15% |
| Repeat purchase rate (90-day) | ≥ 35% | ≥ 50% |
| Active reseller API clients | ≥ 3 | ≥ 10 |
| Net Promoter Score | ≥ 40 | ≥ 60 |

### Measurement method
- GMV, order counts, delivery SLA → internal DB + admin dashboard
- Conversion funnel → Mixpanel or PostHog event tracking
- NPS → in-app survey 7 days post-purchase (Delighted or Typeform)
- Chargeback rate → Stripe Dashboard + internal reconciliation
- Uptime → Datadog + StatusPage

---

## 9. Edge Cases

### Inventory

| Case | Expected Behavior |
|------|------------------|
| Last code sold during checkout | Payment captured → no code available → auto-refund + apology email within 10 min |
| Supplier delivers duplicate codes | CSV import deduplicates via hash; API import same check |
| Code marked invalid post-sale (brand reports stolen batch) | Do not auto-revoke delivered codes; ops manually contacts affected customers |
| Stock drops to 0 between cart add and checkout | Checkout blocked with "sorry, just sold out" message before payment attempt |

### Payment

| Case | Expected Behavior |
|------|------------------|
| Stripe webhook arrives before API response | Idempotency key prevents double processing; webhook handler checks existing order state |
| Payment times out (user closes browser) | PaymentIntent remains open 24h; if customer returns with same session, resume flow; otherwise abandoned |
| Refund requested after code already redeemed | Platform cannot verify redemption for most brands; support handles case-by-case; policy: no refund if code confirmed used |
| Stripe webhook replay (duplicate event) | Idempotent handler — check order status before processing; skip if already completed |
| Currency fluctuation (multi-currency P2) | Lock exchange rate at order creation time, not payment capture time |

### User / Auth

| Case | Expected Behavior |
|------|------------------|
| Guest buys then registers with same email | Orders not auto-linked; v1: customer contacts support; v2: auto-merge on registration |
| Customer changes email | Confirmation required on new email; old codes remain accessible by order ID lookup |
| MFA device lost | Recovery codes issued at MFA setup; support manual identity verification as fallback |
| Concurrent logins same account | Both sessions valid; compromise detection via anomalous IP change triggers email alert |

### Fraud

| Case | Expected Behavior |
|------|------------------|
| Legitimate customer blocked (false positive) | Customer contacts support; support can manually approve and trigger order |
| Same user creates multiple accounts to bypass velocity limits | Device fingerprint + email pattern detection; ops review |
| Chargeback filed on legitimate order | Code marked invalid; account flagged; respond to Stripe with delivery evidence |
| VPN/proxy user | Score increased, not auto-blocked; combined with other signals for decision |

### Delivery

| Case | Expected Behavior |
|------|------------------|
| Email delivery fails (bad email address) | Retry 3×; code still visible on-screen and in account order history |
| Customer claims code doesn't work | Support verifies code was delivered (hash check), escalates to supplier if confirmed unworkable |
| Reseller webhook endpoint down for 2 hours | Retry queue holds attempts; when endpoint recovers, catch up; reseller sees delayed status in portal |
| Multiple items ordered, one code fails to deliver | Deliver available codes; create partial delivery alert; resolve missing code separately |

---

## 10. Future Features (Parking Lot)

These are explicitly **out of scope for v1** but must not be architecturally blocked.

| Feature | Rationale for deferral |
|---------|----------------------|
| Mobile apps (iOS + Android) | Web-first to validate demand; API-first architecture supports this |
| Cryptocurrency payments | Compliance complexity; add when demand proven |
| Multi-currency checkout | FX risk management needed; significant payment provider work |
| Wishlist + price alerts | Nice-to-have; not core to purchase funnel |
| Referral program | Requires loyalty infrastructure; phase 2 growth lever |
| Subscription / bundle packs | Complex inventory model; add at catalog scale |
| Loyalty points system | Post-product-market-fit retention lever |
| White-label B2B storefronts | Requires multi-tenancy architecture; enterprise sales motion |
| Brand direct API integrations | Requires partnership agreements; longer lead time |
| Real-time code redemption verification | Most brands don't offer this API; explore per brand |
| Physical gift card option | Requires logistics partner; entirely different ops model |
| AI-powered gift recommendations | Personalization layer; needs purchase history at scale |
| Seller marketplace (peer resale) | Trust/legal complexity; entirely different product |

---

## 11. Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| OQ-01 | What is the refund window policy? (e.g., 24h, 48h, no refund if code revealed?) | Legal + Business | Yes |
| OQ-02 | Which brands allow online resale under their terms? Legal review required per brand. | Legal | Yes |
| OQ-03 | Are we handling VAT/sales tax on digital goods? Which jurisdictions at launch? | Finance + Legal | Yes |
| OQ-04 | What is the maximum quantity per variant per order? (Fraud consideration.) | Product + Finance | Yes |
| OQ-05 | Do we launch guest checkout or require registration? (Tradeoff: conversion vs fraud surface) | Product | Yes |
| OQ-06 | Which supplier(s) are contracted at launch? Determines catalog scope. | Business Dev | Yes |
| OQ-07 | What currencies do we accept at launch? USD only? | Finance | Yes |
| OQ-08 | Is there a minimum order value? | Business | No |
| OQ-09 | Do we offer customer-facing order cancellation (before delivery)? | Product | No |
| OQ-10 | What is the code visibility window in order history? (30 days? Forever?) | Product + Legal | No |
| OQ-11 | Do we need age verification for any products (e.g., M-rated game credits)? | Legal | No |
| OQ-12 | Reseller API: real-time or async code fulfillment model? | Engineering | No |

---

## Non-Goals (v1)

Explicitly will NOT be built in v1:

1. **Physical gift card fulfillment** — entirely different ops, logistics, cost structure
2. **Peer-to-peer code resale / marketplace** — legal and trust complexity beyond scope
3. **Mobile native apps** — web-first; mobile browser must work but no native app
4. **Subscription/recurring billing** — one-time purchase model only
5. **Customer-to-customer gifting flow** — send code to recipient's email via platform (v2 feature)
6. **Multi-language/i18n** — English only at launch
7. **In-house support ticketing system** — integrate Intercom or Zendesk; don't build

---

**Document sign-off required from:** Product, Engineering Lead, Legal, Finance, Business Dev before implementation begins.

**Next artifacts:** Engineering ticket breakdown, API spec (OpenAPI), design brief for checkout flow.
