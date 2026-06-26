# nong-krati — Product Requirements Document

**Project:** nong-krati
**Version:** 1.0
**Status:** Draft — Pre-Implementation
**Date:** 2026-06-26

---

## 1. Business Goals

| # | Goal | Metric | Target | Window |
|---|------|--------|--------|--------|
| BG-1 | Generate sustainable gross margin | GM per order | ≥ 12% | Month 6 |
| BG-2 | Build repeat purchase behavior | Repeat purchase rate | ≥ 35% within 90 days | Month 9 |
| BG-3 | Maintain trust via reliable delivery | Code delivery SLA | ≥ 95% delivered < 60s | Day 1 |
| BG-4 | Minimize fraud losses | Chargeback rate | ≤ 0.5% of GMV | Ongoing |
| BG-5 | Grow catalog to drive organic traffic | Active SKUs | ≥ 100 products | Month 6 |
| BG-6 | Drive customer acquisition via referral | Referral-sourced orders | ≥ 15% of new orders | Month 6 |
| BG-7 | Reduce support overhead via self-service | Support ticket rate | ≤ 1.5% of orders | Month 3 |

---

## 2. User Personas

### Persona 1 — The Gifter (Primary)
- **Who:** Age 25–45, buys for others (birthdays, holidays, celebrations)
- **Motivation:** Convenience, instant delivery, safe platform
- **Pain point:** Physical stores inconvenient; last-minute purchases common
- **Frequency:** 3–6× per year
- **Key needs:** Fast checkout, gift-ready email, clear redemption instructions

### Persona 2 — The Self-Purchaser / Gamer (Primary)
- **Who:** Age 16–35, tops up gaming wallets or streaming credits for themselves
- **Motivation:** Best availability, right denomination, instant delivery
- **Pain point:** Region locks, platform doesn't accept their card, wants trusted source
- **Frequency:** 1–3× per month
- **Key needs:** Wide denomination range, real-time stock, re-access to codes

### Persona 3 — The Parent (Primary)
- **Who:** Age 30–50, buying game/app credits for children
- **Motivation:** Keeps card details off gaming platforms, controlled spending
- **Pain point:** Unfamiliar with gaming platforms, wants simple UX
- **Frequency:** Monthly to quarterly
- **Key needs:** Simple checkout, trusted brand, email receipt to parent

### Persona 4 — The Deal Hunter (Secondary)
- **Who:** Price-sensitive buyer, monitors promotions, uses coupons
- **Motivation:** Value, discounts, loyalty rewards
- **Pain point:** Doesn't want to pay full retail
- **Key needs:** Visible promotions, coupon system, referral rewards, wishlist with price tracking

### Persona 5 — The Admin / Operator
- **Who:** Internal team managing inventory, orders, fraud, and platform
- **Motivation:** Platform health, revenue growth, fraud control
- **Key needs:** Real-time dashboard, bulk operations, fraud queue, refund tools

---

## 3. Functional Requirements

### Priority
- **P0** — Must ship at launch
- **P1** — Ship in v1 if capacity allows; fast-follow if not
- **P2** — Future version; architect to support

---

### 3.1 Guest Browsing

| ID | Requirement | Priority |
|----|-------------|----------|
| GB-01 | Browse full product catalog without account | P0 |
| GB-02 | View product detail pages: brand, denomination options, region, description, redemption guide | P0 |
| GB-03 | View real-time stock status per denomination (In Stock / Low Stock / Out of Stock) | P0 |
| GB-04 | Browse by category: Gaming, Entertainment, Shopping, Lifestyle | P0 |
| GB-05 | View featured / promotional products on homepage | P0 |
| GB-06 | Guest can add to cart and checkout without account | P0 |
| GB-07 | Guest cart persists in session (browser localStorage) | P0 |
| GB-08 | Region mismatch warning shown to guest based on IP geolocation | P0 |
| GB-09 | Product page shows related products | P1 |
| GB-10 | Guest sees promotional banners and flash sale countdowns | P1 |

---

### 3.2 Search

| ID | Requirement | Priority |
|----|-------------|----------|
| SCH-01 | Full-text search across product names, brand names, categories | P0 |
| SCH-02 | Typo-tolerant search (e.g. "Steem" → Steam results) | P0 |
| SCH-03 | Search results page with product cards (name, image, price, stock badge) | P0 |
| SCH-04 | No-results page with suggested alternatives | P0 |
| SCH-05 | Search autocomplete / typeahead suggestions as user types | P1 |
| SCH-06 | Search filters: category, brand, denomination range, region | P1 |
| SCH-07 | Sort results: relevance, price asc/desc, newest, popularity | P1 |
| SCH-08 | Recent search history (authenticated users) | P2 |
| SCH-09 | Trending searches shown on search focus | P2 |

---

### 3.3 Categories

| ID | Requirement | Priority |
|----|-------------|----------|
| CAT-01 | Top-level categories: Gaming, Entertainment, Shopping, Lifestyle | P0 |
| CAT-02 | Sub-categories under each top level (e.g., Gaming → PC, Console, Mobile) | P0 |
| CAT-03 | Category pages show filtered product grid with facet filters | P0 |
| CAT-04 | Category breadcrumb navigation on product and category pages | P0 |
| CAT-05 | Admin can create, rename, reorder, and nest categories | P0 |
| CAT-06 | Category landing pages with SEO-optimized description and metadata | P1 |
| CAT-07 | Homepage features hero category sections (e.g., "Top Gaming Cards") | P1 |

---

### 3.4 Wishlist

| ID | Requirement | Priority |
|----|-------------|----------|
| WSH-01 | Authenticated users can add products (any denomination) to wishlist | P0 |
| WSH-02 | Wishlist page: all saved items, stock status, add to cart from list | P0 |
| WSH-03 | Remove items from wishlist | P0 |
| WSH-04 | Wishlist persists across sessions and devices | P0 |
| WSH-05 | Email notification when out-of-stock wishlist item comes back in stock | P1 |
| WSH-06 | Share wishlist via link (public shareable URL) | P1 |
| WSH-07 | Wishlist item shows price change since item was added | P2 |

---

### 3.5 Shopping Cart

| ID | Requirement | Priority |
|----|-------------|----------|
| CART-01 | Add product variant (denomination) to cart | P0 |
| CART-02 | Update quantity per line item (max per variant configurable, default 5) | P0 |
| CART-03 | Remove individual items from cart | P0 |
| CART-04 | Cart shows: item thumbnail, product name, denomination, qty, unit price, line total | P0 |
| CART-05 | Cart summary: subtotal, discount (if coupon applied), total | P0 |
| CART-06 | Out-of-stock check on cart page — warn if item became unavailable | P0 |
| CART-07 | Apply coupon code to cart — validate and show discount | P0 |
| CART-08 | Cart persists for authenticated users (30 days) | P1 |
| CART-09 | Guest cart merges into account cart on login | P1 |
| CART-10 | "Save for later" moves item from cart to wishlist | P1 |
| CART-11 | Cart badge in header shows item count | P0 |
| CART-12 | Stock quantity lock warning: "Only 3 left" when cart item near-depleted | P1 |

---

### 3.6 Instant Digital Delivery

| ID | Requirement | Priority |
|----|-------------|----------|
| DEL-01 | Code displayed on-screen immediately after payment confirms | P0 |
| DEL-02 | On-screen code revealed by single click/tap (not auto-visible for screen security) | P0 |
| DEL-03 | Confirmation email with code(s) and redemption instructions sent ≤ 60s after payment | P0 |
| DEL-04 | Email includes: order ID, product name, code, denomination, redemption steps, support link | P0 |
| DEL-05 | Multiple codes in one order delivered atomically — all or individually shown per item | P0 |
| DEL-06 | Delivery failure after 3 retries → ops alert + auto-support ticket created | P0 |
| DEL-07 | Guest order lookup: enter email + order ID → view codes | P0 |
| DEL-08 | Customer can trigger manual email resend (max 3 resends per order) | P0 |
| DEL-09 | PDF download of order with codes (branded, printable) | P1 |
| DEL-10 | Code delivery webhook for reseller API orders | P1 |

---

### 3.7 Order History

| ID | Requirement | Priority |
|----|-------------|----------|
| ORD-01 | Authenticated users see paginated order history | P0 |
| ORD-02 | Order list: date, order ID, products, total, status | P0 |
| ORD-03 | Order detail page: all items, codes (masked/reveal toggle), payment info, delivery status | P0 |
| ORD-04 | Order status labels: Pending / Processing / Completed / Failed / Refunded | P0 |
| ORD-05 | Filter order history by date range and status | P1 |
| ORD-06 | Re-order: add same items to cart from order history in one click | P2 |

---

### 3.8 Download Purchased Codes

| ID | Requirement | Priority |
|----|-------------|----------|
| DL-01 | Customer can re-view codes from order detail page (up to 90 days post-purchase) | P0 |
| DL-02 | Download individual code as text (copy-to-clipboard button per code) | P0 |
| DL-03 | Download full order as formatted PDF | P1 |
| DL-04 | Download all codes in order as plain text file (.txt) | P1 |
| DL-05 | After 90 days, codes hidden with message: "Contact support to retrieve" | P0 |

---

### 3.9 Email Receipt

| ID | Requirement | Priority |
|----|-------------|----------|
| EML-01 | Automated order confirmation email sent on every completed order | P0 |
| EML-02 | Email is branded (nong-krati logo, colors, fonts) | P0 |
| EML-03 | Email contains: greeting, order summary table, code reveal, redemption instructions, support CTA | P0 |
| EML-04 | Resend email from order history page (self-service) | P0 |
| EML-05 | Admin can resend email on any order | P0 |
| EML-06 | Email template editable by admin (no redeploy required) | P1 |
| EML-07 | HTML email renders correctly in Gmail, Outlook, Apple Mail, mobile | P0 |
| EML-08 | Plain-text fallback version of every email | P1 |

---

### 3.10 Support Tickets

| ID | Requirement | Priority |
|----|-------------|----------|
| SUP-01 | Customer can open support ticket from order detail page | P0 |
| SUP-02 | Ticket form: subject (predefined options), message, optional screenshot upload | P0 |
| SUP-03 | Ticket auto-tagged with order ID when raised from order page | P0 |
| SUP-04 | Ticket confirmation email sent to customer | P0 |
| SUP-05 | Customer views ticket status and replies in account portal | P0 |
| SUP-06 | Admin/support agent view ticket inbox, reply, resolve, close tickets | P0 |
| SUP-07 | Ticket status: Open / Awaiting Customer / In Progress / Resolved / Closed | P0 |
| SUP-08 | Email notification to customer on every agent reply | P0 |
| SUP-09 | Canned response library for common issues | P1 |
| SUP-10 | SLA timer on tickets (e.g., first response ≤ 24h) | P1 |
| SUP-11 | Auto-close tickets with no reply after 7 days | P1 |
| SUP-12 | Integration with Zendesk or Intercom (replace internal ticketing) | P2 |

---

### 3.11 Coupon System

| ID | Requirement | Priority |
|----|-------------|----------|
| CPN-01 | Apply coupon code at checkout; validate and show applied discount | P0 |
| CPN-02 | Coupon types: % off, fixed amount off | P0 |
| CPN-03 | Coupon scope: global (all products) or product-specific or category-specific | P0 |
| CPN-04 | Coupon constraints: min order value, max uses total, max uses per customer | P0 |
| CPN-05 | Coupon validity window: start date + end date | P0 |
| CPN-06 | Coupon code is case-insensitive | P0 |
| CPN-07 | Admin creates / edits / deactivates coupons | P0 |
| CPN-08 | Admin sees usage stats per coupon: uses, total discount given, revenue generated | P1 |
| CPN-09 | One coupon per order (no coupon stacking in v1) | P0 |
| CPN-10 | Auto-apply coupon from referral link (appended as URL param) | P1 |
| CPN-11 | Bulk coupon generation (generate N unique codes in one action) | P1 |
| CPN-12 | First-order-only coupons (validate: customer has never completed an order) | P1 |

---

### 3.12 Reviews

| ID | Requirement | Priority |
|----|-------------|----------|
| REV-01 | Verified-purchase-only reviews — only customers with completed order for product can submit | P0 |
| REV-02 | Review form: 1–5 star rating + optional text comment | P0 |
| REV-03 | One review per customer per product | P0 |
| REV-04 | Reviews display on product page: rating distribution, individual reviews, average score | P0 |
| REV-05 | Review submission triggers moderation queue — not published until approved | P1 |
| REV-06 | Admin approves / rejects / deletes reviews in admin panel | P1 |
| REV-07 | Customer receives email invite to leave review 48h after order completed | P1 |
| REV-08 | Product cards in catalog show star rating + review count | P1 |
| REV-09 | Customer can edit or delete own review | P1 |
| REV-10 | Flag inappropriate reviews (customer reports to admin) | P2 |
| REV-11 | Review helpfulness voting: "Was this helpful? Yes / No" | P2 |

---

### 3.13 Referral Program

| ID | Requirement | Priority |
|----|-------------|----------|
| REF-01 | Every authenticated customer gets unique referral link | P0 |
| REF-02 | Share options: copy link, WhatsApp, email, social | P1 |
| REF-03 | Referee (new customer): gets X% discount on first order when using referral link | P0 |
| REF-04 | Referrer: earns Y credits / discount when referee completes first order | P0 |
| REF-05 | Referral credits stored in customer account wallet | P0 |
| REF-06 | Customer views referral history: invites sent, conversions, rewards earned | P0 |
| REF-07 | Referral reward applied automatically to next order (or selectable at checkout) | P0 |
| REF-08 | Fraud prevention: referrals from same device/IP flagged | P0 |
| REF-09 | Admin configures referral reward values (referrer credit, referee discount) | P0 |
| REF-10 | Admin sees referral leaderboard and conversion analytics | P1 |
| REF-11 | Self-referral blocked (cannot use own link) | P0 |
| REF-12 | Referral reward expires after 90 days if unused (configurable) | P1 |

---

### 3.14 Notifications

| ID | Requirement | Priority |
|----|-------------|----------|
| NOT-01 | Order confirmation email (every completed order) | P0 |
| NOT-02 | Delivery failure notification email to customer | P0 |
| NOT-03 | Support ticket reply email notification | P0 |
| NOT-04 | Refund confirmation email with amount and timeline | P0 |
| NOT-05 | Password reset email | P0 |
| NOT-06 | Wishlist restock alert email (item back in stock) | P1 |
| NOT-07 | Referral reward earned notification email | P1 |
| NOT-08 | Review submission confirmation email | P1 |
| NOT-09 | Promotional email (flash sales, new products) — opt-in only | P1 |
| NOT-10 | In-app notification bell (authenticated users): order updates, rewards, alerts | P1 |
| NOT-11 | Customer controls notification preferences per channel (email, in-app) | P1 |
| NOT-12 | Low-stock alert for wishlisted items ("Only 2 left") | P2 |
| NOT-13 | Push notifications (mobile browser / PWA) | P2 |

---

### 3.15 Admin Dashboard

| ID | Requirement | Priority |
|----|-------------|----------|
| DASH-01 | KPI summary cards: total revenue today / week / month, orders count, avg order value | P0 |
| DASH-02 | Real-time recent orders feed | P0 |
| DASH-03 | Low-stock alerts widget: variants below threshold | P0 |
| DASH-04 | Fraud queue count badge (pending review orders) | P0 |
| DASH-05 | Open support tickets count and SLA breaches | P0 |
| DASH-06 | Top 5 products by revenue this period | P1 |
| DASH-07 | Revenue chart: daily/weekly/monthly toggle | P1 |
| DASH-08 | New customer registrations count | P1 |
| DASH-09 | Pending refunds count | P1 |
| DASH-10 | Delivery success rate indicator | P1 |

---

### 3.16 Sales Analytics

| ID | Requirement | Priority |
|----|-------------|----------|
| AN-01 | Revenue by time period (daily, weekly, monthly, custom range) | P0 |
| AN-02 | Orders count and average order value by period | P0 |
| AN-03 | Top products by revenue, volume, and margin | P0 |
| AN-04 | Top categories by revenue | P1 |
| AN-05 | Conversion funnel: visitors → cart → checkout → paid | P1 |
| AN-06 | Cart abandonment rate | P1 |
| AN-07 | Coupon performance: usage count, total discount given, revenue influenced | P1 |
| AN-08 | Referral program analytics: invites, conversions, reward cost | P1 |
| AN-09 | Customer acquisition: new vs returning customers ratio | P1 |
| AN-10 | Revenue export to CSV by date range | P0 |
| AN-11 | Code delivery SLA report (% delivered within 60s, avg delivery time) | P1 |
| AN-12 | Refund rate by product / period | P1 |
| AN-13 | Fraud block rate (blocked orders as % of total attempts) | P1 |
| AN-14 | Review analytics: submission rate, avg rating by product | P2 |

---

### 3.17 Gift Card Inventory & Code Management

| ID | Requirement | Priority |
|----|-------------|----------|
| INV-01 | View inventory table: product, variant, stock count, cost price, retail price, status | P0 |
| INV-02 | Filter inventory by product, brand, category, stock status | P0 |
| INV-03 | Per-variant stock count shown in real time | P0 |
| INV-04 | Low-stock threshold per variant — configurable (default: 10 codes) | P0 |
| INV-05 | Out-of-stock auto-hides add-to-cart on storefront | P0 |
| INV-06 | View individual codes per variant: ID, status (available/reserved/sold/invalid), import date | P0 |
| INV-07 | Mark individual code as invalid/expired (manual) | P0 |
| INV-08 | Code status audit trail: who changed it, when, from what state | P0 |
| INV-09 | Codes encrypted at rest — admin view shows masked code (last 4 chars visible) | P0 |
| INV-10 | Full code reveal for support agents: requires elevated permission + logged | P0 |

---

### 3.18 Import Codes / Bulk Upload

| ID | Requirement | Priority |
|----|-------------|----------|
| IMP-01 | Admin uploads CSV file of codes for a selected variant | P0 |
| IMP-02 | CSV format: `code, supplier_ref (optional)` — clear format doc provided in UI | P0 |
| IMP-03 | Import validates: format check, duplicate detection (hash comparison), variant existence | P0 |
| IMP-04 | Import result report: X codes added, Y duplicates skipped, Z format errors | P0 |
| IMP-05 | Errors listed with row number and reason for easy fix | P0 |
| IMP-06 | Import preview: show first 5 rows before committing | P1 |
| IMP-07 | Import history log: filename, import date, operator, results summary | P1 |
| IMP-08 | Bulk upload via supplier API integration (auto-pull on schedule) | P2 |
| IMP-09 | Support multiple import file formats: CSV, XLSX | P2 |

---

### 3.19 Order Management (Admin)

| ID | Requirement | Priority |
|----|-------------|----------|
| ADM-ORD-01 | Full order list with search: by order ID, customer email, status, date range | P0 |
| ADM-ORD-02 | Order detail view: customer info, items, codes (masked), payment details, delivery log | P0 |
| ADM-ORD-03 | Manual code resend on any order | P0 |
| ADM-ORD-04 | Manual override of order status (with reason logged) | P0 |
| ADM-ORD-05 | View delivery attempt log per order: timestamps, status, retry count | P0 |
| ADM-ORD-06 | Export orders to CSV by date range | P1 |
| ADM-ORD-07 | Bulk order status view (paginated, filterable) | P0 |

---

### 3.20 Customer Management (Admin)

| ID | Requirement | Priority |
|----|-------------|----------|
| CM-01 | Customer list with search: by email, name, status, registration date | P0 |
| CM-02 | Customer detail: profile info, order history, referral stats, wallet balance, tickets | P0 |
| CM-03 | Suspend / unsuspend customer account (with reason) | P0 |
| CM-04 | Add manual credit to customer wallet (compensation) | P1 |
| CM-05 | View customer's fraud score history | P1 |
| CM-06 | View all device fingerprints associated with a customer | P1 |
| CM-07 | Permanently delete customer account (GDPR right to erasure) | P0 |
| CM-08 | Export customer data (GDPR data export) | P0 |
| CM-09 | Notes field on customer profile (internal admin notes, not visible to customer) | P1 |

---

### 3.21 Refund Management (Admin)

| ID | Requirement | Priority |
|----|-------------|----------|
| RF-01 | Admin initiates full or partial refund on any order | P0 |
| RF-02 | Refund reasons: Not received / Invalid code / Duplicate / Other (free text) | P0 |
| RF-03 | Refund triggers Stripe/PayPal API call — no manual processing | P0 |
| RF-04 | Refunded codes marked `invalid` — removed from available pool | P0 |
| RF-05 | Customer notified by email when refund issued | P0 |
| RF-06 | Refund list view: filter by status (Pending / Processed / Rejected), date, amount | P0 |
| RF-07 | Refund within configurable window only (default 24h; admin can override per order) | P0 |
| RF-08 | Chargeback tracking: log chargebacks, auto-flag customer account after 2 chargebacks | P1 |
| RF-09 | Refund report: total refunded by period, by product, by reason | P1 |

---

### 3.22 Coupon Management (Admin)

| ID | Requirement | Priority |
|----|-------------|----------|
| CPN-ADM-01 | Create coupon: code, type (% / fixed), value, scope, constraints, validity | P0 |
| CPN-ADM-02 | Edit existing coupon (cannot change code once created) | P0 |
| CPN-ADM-03 | Activate / deactivate coupon without deletion | P0 |
| CPN-ADM-04 | Coupon list view: code, type, usage count, status, validity | P0 |
| CPN-ADM-05 | View per-coupon usage: which customers used it, when, order total | P1 |
| CPN-ADM-06 | Bulk generate unique coupon codes (N codes, same params) | P1 |
| CPN-ADM-07 | Export coupon usage to CSV | P1 |

---

### 3.23 Promotion Management (Admin)

| ID | Requirement | Priority |
|----|-------------|----------|
| PROMO-01 | Flash sale: set sale price + countdown timer per variant, start/end datetime | P0 |
| PROMO-02 | Homepage banner management: image, link, headline, display order, date range | P0 |
| PROMO-03 | Featured product slots: admin assigns products to featured carousel | P0 |
| PROMO-04 | Category-level promotion: tag category as "On Sale", display badge on cards | P1 |
| PROMO-05 | Email blast to opted-in subscribers (integrate with Resend/Mailchimp) | P1 |
| PROMO-06 | Schedule promotion in advance (set go-live time, auto-expires) | P1 |
| PROMO-07 | Promotion performance: revenue during promo period vs baseline | P1 |

---

### 3.24 Fraud Detection (Admin)

| ID | Requirement | Priority |
|----|-------------|----------|
| FRD-ADM-01 | Every order assigned fraud score (0–100) before payment confirmation | P0 |
| FRD-ADM-02 | Score > 70: auto-block order, payment not captured | P0 |
| FRD-ADM-03 | Score 40–70: order placed in manual review queue | P0 |
| FRD-ADM-04 | Admin fraud queue: view flagged orders, see score breakdown by rule, approve or block | P0 |
| FRD-ADM-05 | Velocity rules: max 3 orders/IP/hour, max 5 orders/email/day (configurable) | P0 |
| FRD-ADM-06 | Device fingerprinting on checkout — flag same device across multiple emails | P0 |
| FRD-ADM-07 | IP geolocation — flag if IP country ≠ billing/order region | P0 |
| FRD-ADM-08 | Blocklist management: add/remove IP addresses, emails, card BINs | P0 |
| FRD-ADM-09 | Allowlist: mark known-good customers to bypass fraud rules | P1 |
| FRD-ADM-10 | Stripe Radar ML score integrated into composite fraud score | P0 |
| FRD-ADM-11 | Auto-suspend customer after 2 chargebacks | P1 |
| FRD-ADM-12 | Fraud event log: all triggered rules per order, with timestamps | P0 |
| FRD-ADM-13 | Fraud rule editor: admin adjusts rule weights without code change | P2 |
| FRD-ADM-14 | Email risk scoring (disposable email detection) | P1 |

---

## 4. Non-Functional Requirements

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-01 | Performance | Product page LCP on 4G mobile | < 2.5s |
| NFR-02 | Performance | Checkout page load | < 2.0s |
| NFR-03 | Performance | Code delivery after payment | < 60s (p95) |
| NFR-04 | Performance | Search results render | < 500ms |
| NFR-05 | Availability | Platform uptime | ≥ 99.9% |
| NFR-06 | Scalability | Concurrent checkout sessions | 500 without degradation |
| NFR-07 | Security | Code encryption at rest | AES-256-GCM, KMS keys |
| NFR-08 | Security | Card data storage | None — Stripe handles all PAN |
| NFR-09 | Security | Admin access | MFA enforced, all actions audit-logged |
| NFR-10 | Security | Webhook integrity | HMAC-SHA256 signature verification |
| NFR-11 | Compliance | GDPR | Right to deletion, data export, cookie consent banner |
| NFR-12 | Compliance | PCI-DSS | SAQ A — no card data on servers |
| NFR-13 | SEO | Product + category pages | Server-side rendered, Google indexable |
| NFR-14 | Accessibility | Core purchase flows | WCAG 2.1 AA |
| NFR-15 | Mobile | Storefront + checkout | Fully functional iOS/Android browsers |
| NFR-16 | Reliability | Payment idempotency | Zero double-charges under any retry |
| NFR-17 | Reliability | Code uniqueness | Same code never delivered to two customers |
| NFR-18 | Data | Audit logs | Immutable; retained 24 months |

---

## 5. User Stories

### Gifter
- **US-01** — As a gifter, I want to find a specific brand quickly so I can buy it without browsing every category.
- **US-02** — As a gifter, I want to checkout without creating an account so I can buy without friction.
- **US-03** — As a gifter, I want the code emailed instantly so I can forward it to the recipient right away.
- **US-04** — As a gifter, I want clear step-by-step redemption instructions so the recipient knows what to do.

### Self-Purchaser / Gamer
- **US-05** — As a gamer, I want to see all denominations and their stock status upfront so I choose without hitting a dead end at checkout.
- **US-06** — As a gamer, I want to re-access my codes from order history so I don't lose them if I delete an email.
- **US-07** — As a gamer, I want a region mismatch warning before payment so I don't accidentally buy an incompatible card.
- **US-08** — As a gamer, I want my saved payment method so checkout is faster on repeat visits.

### Deal Hunter
- **US-09** — As a deal hunter, I want to apply a coupon code at checkout so I get the discount I found.
- **US-10** — As a deal hunter, I want to share my referral link and earn credit when friends buy so I'm rewarded for spreading the word.
- **US-11** — As a deal hunter, I want my wishlist to alert me when a product I saved comes back in stock so I don't miss it.

### Parent
- **US-12** — As a parent, I want a simple checkout that doesn't require creating accounts on gaming platforms so my payment details stay off those platforms.
- **US-13** — As a parent, I want the receipt emailed to me (not the child's account) so I can track what was purchased.

### Customer (Support)
- **US-14** — As a customer, I want to open a support ticket from my order page so I don't have to re-explain which order has the problem.
- **US-15** — As a customer, I want to see the status of my support ticket so I know it hasn't been ignored.

### Admin / Operator
- **US-16** — As an admin, I want to upload codes via CSV so I replenish inventory without developer help.
- **US-17** — As an admin, I want a fraud review queue so I approve or block suspicious orders before codes are released.
- **US-18** — As an admin, I want to see a real-time dashboard so I know platform health at a glance.
- **US-19** — As a support agent, I want to look up any order by email or ID so I resolve issues without database access.
- **US-20** — As an admin, I want every admin action logged with actor and timestamp so I can investigate incidents.

---

## 6. Acceptance Criteria

### AC-01: Core Purchase → Instant Delivery

**Given** a customer (guest or authenticated) with valid cart items completes Stripe/PayPal payment
**When** payment webhook received by platform
**Then:**
- [ ] Code displayed on-screen within 60s (click-to-reveal)
- [ ] Confirmation email delivered to customer email within 60s
- [ ] Email contains: order ID, product name, code, denomination, redemption instructions, support link
- [ ] Code status updated to `sold` in inventory
- [ ] Code cannot be allocated to any other order
- [ ] Order status updated to `completed`

---

### AC-02: Search with Typo Tolerance

**Given** a visitor on the search page
**When** they type "Steem" (typo for Steam)
**Then:**
- [ ] Results page shows Steam-related products
- [ ] No "no results" shown for common brand name typos
- [ ] Results appear within 500ms of typing stop

---

### AC-03: Coupon Application — All Validation Cases

**Given** customer has items in cart
**When** they apply a coupon code
**Then:**
- [ ] Valid code: discount shown before payment, deducted from total
- [ ] Expired code: error "This code has expired"
- [ ] Usage limit reached: error "This code is no longer available"
- [ ] Minimum order not met: error "Minimum order of [X] required"
- [ ] Not applicable to cart items: error "This code doesn't apply to items in your cart"
- [ ] Concurrent last-use scenario: exactly 1 of N simultaneous users succeeds; rest see "no longer available"

---

### AC-04: Wishlist Restock Alert

**Given** an authenticated customer has product X in wishlist and X is out of stock
**When** admin imports new codes for product X's variant
**Then:**
- [ ] Customer receives email within 10 minutes: "Your wishlisted item is back in stock"
- [ ] Email links directly to product page
- [ ] Alert only sent once per restock event (not repeated until stock drops and returns again)

---

### AC-05: Referral Flow

**Given** Customer A has referral link and shares with Customer B (new user)
**When** Customer B clicks link, registers, and completes first order
**Then:**
- [ ] Customer B's first order shows referee discount applied at checkout
- [ ] Customer A receives referral credit added to wallet within 30 minutes of B's order completion
- [ ] Customer A sees conversion in referral history dashboard
- [ ] If A and B share same device or IP: referral flagged for review, reward held until cleared
- [ ] A using own referral link: rejected, "You cannot refer yourself"

---

### AC-06: CSV Code Import

**Given** admin uploads CSV with 1,000 code rows for a selected variant
**When** import completes
**Then:**
- [ ] Duplicate codes (matching existing hash) skipped — counted in report
- [ ] Malformed rows (wrong format, missing fields) rejected — listed by row number
- [ ] Valid new codes added to inventory with status `available`
- [ ] Stock count for variant updated immediately on storefront
- [ ] Admin sees: "850 added, 100 duplicates skipped, 50 errors" with error detail list

---

### AC-07: Fraud Auto-Block

**Given** an order calculates fraud score > 70
**When** customer submits checkout
**Then:**
- [ ] Payment NOT captured — PaymentIntent not confirmed
- [ ] Customer sees generic decline message (no fraud reason disclosed)
- [ ] Order stored as `failed`, fraud_action = `block`
- [ ] Fraud event log records rule breakdown with score contribution per rule
- [ ] Admin fraud log shows the blocked order

---

### AC-08: Support Ticket from Order Page

**Given** authenticated customer on order detail page of a completed order
**When** they click "Get Help" and submit ticket form
**Then:**
- [ ] Ticket created with auto-populated order ID reference
- [ ] Customer receives confirmation email with ticket ID
- [ ] Ticket appears in customer's "My Support" list with status "Open"
- [ ] Ticket appears in admin support inbox
- [ ] Customer receives email notification on every agent reply

---

### AC-09: Admin Refund

**Given** admin initiates refund on a completed order within refund window
**When** admin selects reason and confirms
**Then:**
- [ ] Stripe / PayPal refund API called successfully
- [ ] Affected codes marked `invalid` — not re-allocatable
- [ ] Order status updated to `refunded`
- [ ] Customer email sent: "Your refund of [X] is being processed (3–5 business days)"
- [ ] Audit log records: actor, order ID, amount, reason, timestamp

---

### AC-10: Review Verified Purchase Only

**Given** a customer who has NOT purchased product X
**When** they attempt to submit a review for product X
**Then:**
- [ ] Review form is not shown / submit blocked
- [ ] Message shown: "Only verified buyers can review this product"

**Given** a customer who HAS purchased product X
**When** they submit a 4-star review with comment
**Then:**
- [ ] Review enters moderation queue (not published immediately)
- [ ] Customer sees: "Your review is pending approval"
- [ ] Admin sees review in moderation queue
- [ ] On approval: review published on product page

---

## 7. Edge Cases

### Inventory & Delivery

| Scenario | Expected Behavior |
|----------|------------------|
| Two customers checkout last code simultaneously | Exactly one receives it; other gets refund within 10 min + apology email |
| Payment captured but all codes exhausted (timing race) | Auto-refund triggered; ops alert; order flagged for manual review |
| Supplier delivers batch with duplicate codes | CSV import deduplicates via hash; duplicates skipped, counted in report |
| Code reported stolen/invalid by brand after sale | Admin manually marks `invalid`; support contacts affected customers; no auto-revoke |
| Multiple items in order — one code fails to deliver | Deliver available codes; delivery failure alert for the missing code only; support ticket auto-created |

### Payment

| Scenario | Expected Behavior |
|----------|------------------|
| Customer closes browser mid-payment | PaymentIntent remains open 24h; same session can resume; otherwise abandoned |
| Stripe webhook arrives before API response returns | Idempotency key prevents double processing; webhook checks order state first |
| Stripe webhook replayed (duplicate event) | Idempotent handler: no reprocessing if order already `completed` |
| PayPal payment pending (eCheck) | Order held in `processing` until PayPal confirms; code delivery deferred |
| Refund requested after code copied and used | Cannot verify redemption for most brands; policy decision (out of scope for v1 logic — support handles) |

### Coupons & Referrals

| Scenario | Expected Behavior |
|----------|------------------|
| 100 users apply last-use coupon concurrently | Atomic counter — exactly 1 succeeds; 99 see "no longer available" |
| Referrer and referee same IP / device | Reward held; flagged for fraud review; not auto-paid |
| Customer creates second account to claim referee discount | Device fingerprint match flags account; reward denied |
| Referral reward expires before use | Credit removed from wallet; customer notified by email 7 days before expiry |

### Reviews

| Scenario | Expected Behavior |
|----------|------------------|
| Customer refunded for order then tries to review | Refunded orders cannot leave reviews (order must be in `completed` non-refunded state) |
| Customer submits review with offensive content | Moderation queue catches; admin rejects; customer notified |
| Customer submits second review for same product | Blocked at submission — "You've already reviewed this product" |

### Auth & Accounts

| Scenario | Expected Behavior |
|----------|------------------|
| Guest buys, then registers with same email | Orders not auto-linked in v1; customer contacts support for manual merge |
| MFA device lost | Recovery codes (issued at setup) used; support verifies identity for manual reset |
| Account suspended mid-session | Next request returns 401; session invalidated; customer shown suspension message |
| GDPR deletion requested | All PII deleted within 30 days; anonymized order records retained for financial compliance |

### Admin

| Scenario | Expected Behavior |
|----------|------------------|
| Admin imports CSV with all duplicates | Report shows "0 added, 1000 duplicates skipped" — no error thrown, operation succeeds |
| Support agent attempts to view raw code without permission | Access blocked; attempt logged in audit trail |
| Flash sale end time passes while customer has item in cart | Cart shows original price; customer notified that promotion has ended |
| Admin accidentally deletes product with active orders | Soft-delete only — product hidden from storefront; existing orders unaffected |

---

## 8. Success Metrics

### Launch — Day 1 to 30

| Metric | Minimum | Stretch | Measured By |
|--------|---------|---------|-------------|
| Code delivery < 60s | 95% of orders | 99% | Internal DB delivery log |
| Checkout completion rate | 60% (cart → paid) | 70% | PostHog/Mixpanel funnel |
| Payment success rate | 92% of attempts | 95% | Stripe Dashboard |
| False positive fraud block rate | < 3% of legit orders | < 1% | Fraud queue + order review |
| Uptime | 99.5% | 99.9% | Datadog |
| Support ticket rate | < 3% of orders | < 1% | Ticket system |

### Month 3

| Metric | Minimum | Stretch |
|--------|---------|---------|
| Monthly GMV | $50,000 | $150,000 |
| Chargeback rate | ≤ 0.5% | ≤ 0.2% |
| Repeat purchase rate (30-day) | 25% | 35% |
| Catalog size | 40 SKUs | 70 SKUs |
| Review submission rate | 5% of eligible orders | 15% |
| Coupon redemption rate | 10% of orders | 20% |

### Month 9

| Metric | Minimum | Stretch |
|--------|---------|---------|
| Monthly GMV | $300,000 | $1,000,000 |
| Gross margin | 10% | 15% |
| Repeat purchase rate (90-day) | 35% | 50% |
| Referral-sourced orders | 10% of new | 20% of new |
| NPS score | 40 | 60 |
| Support ticket rate | ≤ 1.5% of orders | ≤ 0.5% |

---

## 9. Future Features (Parking Lot)

Explicitly **out of scope for v1**. Architecture must not block these.

| Feature | Why Deferred |
|---------|-------------|
| Native mobile apps (iOS + Android) | Web-first to validate demand; API-first design supports later |
| Cryptocurrency payments | Compliance and operations complexity |
| Multi-currency checkout (charge in local currency) | FX risk management; payment provider complexity |
| Customer-to-customer gifting flow (send code to friend via platform) | Requires delivery orchestration; v2 |
| Subscription / bundle packs (monthly curated gift cards) | Inventory model complexity; post-PMF |
| White-label B2B storefronts | Multi-tenancy; enterprise sales motion; phase 3 |
| Loyalty points system | Needs purchase volume at scale to be meaningful |
| Brand direct API integrations (Steam Partner, Apple Reseller) | Requires brand partnership agreements; long lead time |
| AI-powered gift recommendations | Needs purchase history at scale |
| Physical gift card + envelope option | Different ops model entirely; logistics partner required |
| Reseller / API marketplace | Requires partner program, legal framework |
| PWA / push notification | Mobile-first phase 2 |
| Live chat support | Cost; integrate Intercom in phase 2 |
| Price history graph on product page | Nice UX; low priority |
| Affiliate program (external publishers) | Growth lever; separate from referral; phase 2 |

---

## Non-Goals (v1)

1. **Physical fulfillment** — nong-krati is digital-only
2. **Peer-to-peer resale** — customers cannot sell codes to each other
3. **Native mobile apps** — mobile browser is the target; no iOS/Android app
4. **Multi-language (i18n)** — English only at launch
5. **Recurring billing / subscriptions** — one-time purchase model only
6. **In-house CRM beyond basic customer management** — no marketing automation in v1
7. **Coupon stacking** — one coupon per order, no combining

---

**Sign-off required from:** Product, Engineering Lead, Legal (OQ-01 refund policy, OQ-02 brand resale rights), Finance (OQ-03 VAT/tax).

**Next:** Engineering ticket breakdown → API spec (OpenAPI YAML) → Design brief for checkout and admin flows.
