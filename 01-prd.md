# Product Requirements Document (PRD)
## Nong-Kati — Digital Gift Card E-Commerce Platform

---

> **Document Control**
> | Field | Value |
> |---|---|
> | Document ID | 01-prd |
> | Version | 1.0.0 |
> | Status | Approved — Single Source of Truth |
> | Created | 2026-06-27 |
> | Last Updated | 2026-06-27 |
> | Owner | Founder / Product Owner |
> | Depends On | 00-project-charter.md v1.0.0 |
> | Audience | Engineering, Design, QA, Outsourced Dev Team |
>
> All functional requirements in this document take precedence over verbal instructions. Any change to scope requires a written amendment to this document before implementation begins.

---

## Table of Contents

1. [Business Objectives](#1-business-objectives)
2. [Target Users](#2-target-users)
3. [User Personas](#3-user-personas)
4. [Pain Points](#4-pain-points)
5. [User Goals](#5-user-goals)
6. [Fulfilment Architecture Recommendation](#6-fulfilment-architecture-recommendation)
7. [Functional Requirements](#7-functional-requirements)
   - 7.1 Storefront & Navigation
   - 7.2 Product Catalogue
   - 7.3 Search & Discovery
   - 7.4 Cart & Checkout
   - 7.5 Payment Processing
   - 7.6 Code Delivery
   - 7.7 Order Management (Customer)
   - 7.8 Customer Authentication & Accounts
   - 7.9 Notifications (Email + LINE)
   - 7.10 Tax Invoice & Receipts
   - 7.11 Admin Panel — Authentication & RBAC
   - 7.12 Admin Panel — Product & Catalogue Management
   - 7.13 Admin Panel — Inventory & Code Management
   - 7.14 Admin Panel — Order Management
   - 7.15 Admin Panel — Customer Management
   - 7.16 Admin Panel — Staff Management
   - 7.17 Admin Panel — Reporting & Analytics
   - 7.18 Security & Fraud Prevention
   - 7.19 SEO & Performance
   - 7.20 PDPA & Compliance
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Acceptance Criteria](#9-acceptance-criteria)
10. [Edge Cases](#10-edge-cases)
11. [Future Features (Phase 2+)](#11-future-features-phase-2)
12. [Success Metrics](#12-success-metrics)
13. [Open Questions & Decisions Log](#13-open-questions--decisions-log)

---

## 1. Business Objectives

These objectives are inherited from `00-project-charter.md` and restated here as the governing constraints for every requirement in this document. A feature that does not serve at least one of these objectives must not be built.

| ID | Objective | PRD Relevance |
|---|---|---|
| BO-01 | Launch a production-ready storefront in ≤ 8 weeks | All MVP requirements are P0 or P1; no scope creep permitted |
| BO-02 | Achieve ≥ 98% payment success rate | Payment, error handling, and fallback requirements |
| BO-03 | Deliver codes within 60 seconds (P95) | Code delivery pipeline, async processing, notification requirements |
| BO-04 | Operate with Thai VAT 7% compliance from day one | Tax invoice, pricing display, and checkout requirements |
| BO-05 | Comply with PDPA B.E. 2562 from day one | Consent, data handling, privacy policy, and data subject rights requirements |
| BO-06 | Achieve organic search visibility in Thai market | SEO, structured data, and page performance requirements |
| BO-07 | Scale from 1K to 100K orders/month without re-architecture | Non-functional requirements: performance, scalability, queueing |

---

## 2. Target Users

### 2.1 Customer-Facing Users

| User Type | Description | Auth State |
|---|---|---|
| **Anonymous Visitor** | Browses products without intent to purchase or account | No auth |
| **Guest Buyer** | Completes a purchase without creating an account | No auth; identified by email + order ID |
| **Registered Customer** | Creates an account to track orders and earn benefits | Authenticated |
| **Returning Customer** | Guest or registered user making a repeat purchase | Either |

### 2.2 Internal / Admin Users

| User Type | Description | Access Level |
|---|---|---|
| **Super Admin** | Founder; full system access including staff management | All permissions |
| **Catalogue Manager** | Staff managing products, categories, and inventory | Products + Inventory only |
| **Order Manager** | Staff handling order issues, resends, and refunds | Orders + Customers (read) |
| **Finance Viewer** | Read-only access to revenue reports and tax invoices | Reports only |

---

## 3. User Personas

### Persona 1 — แก้ม (Kaem), The Daily Gamer
> *"ซื้อง่าย จ่ายเร็ว ได้โค้ดเลย"* ("Buy easy, pay fast, get code immediately")

| Attribute | Detail |
|---|---|
| **Age** | 19 |
| **Occupation** | University student, part-time barista |
| **Location** | Chiang Mai |
| **Devices** | iPhone 14 (primary), Windows PC (gaming) |
| **Payment** | PromptPay via KBank mobile app |
| **Purchases** | ROV diamonds, Garena shells, Steam Wallet THB |
| **Frequency** | 2–4 times per month |
| **Avg. Spend** | ฿50–฿200 per order |
| **Tech Literacy** | High — uses mobile apps daily |
| **Trust Signals** | Looks for SSL lock, recognisable brand, fast social proof |
| **Core Need** | Buy a specific top-up denomination, pay via PromptPay, receive code instantly, get back to gaming |
| **Frustration** | Slow sites, mandatory registration, codes that don't work, sites that look like scams |

---

### Persona 2 — สมชาย (Somchai), The Gift-Giver
> *"อยากให้ของขวัญที่ใช้ได้จริง"* ("I want to give a gift that's actually useful")

| Attribute | Detail |
|---|---|
| **Age** | 34 |
| **Occupation** | Marketing manager, private company |
| **Location** | Bangkok |
| **Devices** | MacBook Pro (work), Samsung Galaxy S24 (personal) |
| **Payment** | SCB credit card (Visa) |
| **Purchases** | Netflix gift cards, Spotify gift cards, Apple gift cards |
| **Frequency** | 1–2 times per month (gift occasions) |
| **Avg. Spend** | ฿300–฿600 per order |
| **Tech Literacy** | Medium-high |
| **Trust Signals** | Needs professional UX, receipt/tax invoice, HTTPS, recognisable brand |
| **Core Need** | Find the right denomination, pay safely by card, download a receipt, forward the code to recipient |
| **Frustration** | Sites without English product names alongside Thai, no receipt, unclear refund policy |

---

### Persona 3 — ร้านเกมส์ (Raan Games), The SME Reseller
> *"ต้องการซื้อจำนวนมาก ราคาดี และเชื่อถือได้"* ("Need to buy in volume, good price, reliable")

| Attribute | Detail |
|---|---|
| **Age** | 28 |
| **Occupation** | Operator of a gaming accessories shop (online + physical) |
| **Location** | Nonthaburi |
| **Devices** | Windows PC, Android tablet |
| **Payment** | PromptPay bank transfer |
| **Purchases** | Bulk: Steam, PSN, Google Play across multiple denominations |
| **Frequency** | Weekly, 50–200 codes per order |
| **Avg. Spend** | ฿5,000–฿30,000 per order |
| **Tech Literacy** | High |
| **Trust Signals** | Needs consistent stock availability, fast bulk checkout, reliable code validity, formal receipt |
| **Core Need** | Reliable supply, competitive wholesale-adjacent pricing, smooth bulk ordering flow |
| **Frustration** | Stock running out mid-order, no bulk pricing, having to buy one at a time |

---

### Persona 4 — นิภา (Nipa), The Admin Manager
> *"ต้องควบคุมสต็อคและคำสั่งซื้อได้ง่ายๆ"* ("I need to manage stock and orders easily")

| Attribute | Detail |
|---|---|
| **Age** | 26 |
| **Occupation** | Part-time operations staff hired by founder |
| **Location** | Remote (anywhere in Thailand) |
| **Devices** | Windows laptop, Chrome browser |
| **Role** | Catalogue Manager + Order Manager |
| **Core Need** | Upload new codes in bulk, resolve failed orders, update product stock, check low-stock alerts |
| **Frustration** | Admin UIs that require technical knowledge; no clear error messages; no audit trail |

---

## 4. Pain Points

### 4.1 Customer Pain Points (Current Market)

| ID | Persona | Pain Point | Severity |
|---|---|---|---|
| PP-01 | Kaem | Existing sites require mandatory account creation before purchase — kills impulse buys | Critical |
| PP-02 | Kaem | Code delivery takes minutes or requires manual review — gaming session interrupted | Critical |
| PP-03 | Kaem | Sites look untrustworthy (no SSL badge, no professional design, broken Thai fonts) | High |
| PP-04 | Somchai | No downloadable receipt or tax invoice after purchase | High |
| PP-05 | Somchai | Product names and denominations only in Thai — confusing for gifting international products | Medium |
| PP-06 | Somchai | No clear refund or invalid-code policy stated on product page | High |
| PP-07 | Raan Games | No bulk quantity selector — must checkout one item at a time | High |
| PP-08 | Raan Games | Stock runs out during checkout with no prior warning | Critical |
| PP-09 | All | Checkout abandonment due to limited payment methods (no PromptPay or card) | Critical |
| PP-10 | All | No order tracking without an account — no way to retrieve a code after browser closes | High |
| PP-11 | All | Mobile experience broken on existing Thai gift card sites | High |
| PP-12 | Kaem | Sites with ads / pop-ups that feel like scams | Medium |

### 4.2 Admin / Operations Pain Points (Current State)

| ID | Persona | Pain Point | Severity |
|---|---|---|---|
| PP-13 | Nipa | No centralised admin tool — codes managed in spreadsheets | Critical |
| PP-14 | Nipa | No automated low-stock alert — discover stock-out only when customers complain | Critical |
| PP-15 | Nipa | Cannot resend a code to a customer without database access | High |
| PP-16 | Nipa | No audit trail of which staff member changed what | High |
| PP-17 | Founder | No revenue dashboard — must manually calculate from payment gateway exports | High |

---

## 5. User Goals

### 5.1 Customer Goals

| ID | Goal | Persona | Priority |
|---|---|---|---|
| UG-01 | Find the exact gift card and denomination I want in under 30 seconds | All | P0 |
| UG-02 | Complete a purchase without creating an account | Kaem, Somchai | P0 |
| UG-03 | Pay using PromptPay from my mobile banking app | Kaem | P0 |
| UG-04 | Pay using my credit or debit card securely | Somchai | P0 |
| UG-05 | Receive the gift card code within 60 seconds of payment | All | P0 |
| UG-06 | Retrieve my code if I accidentally close the browser | All | P0 |
| UG-07 | Download a receipt or tax invoice for my purchase | Somchai | P0 |
| UG-08 | Buy multiple units of the same card in a single order | Raan Games | P1 |
| UG-09 | Know whether a product is in stock before adding to cart | All | P0 |
| UG-10 | Receive my code via LINE as well as email | Kaem | P1 |
| UG-11 | Create an account to view my order history | Somchai | P1 |
| UG-12 | Feel confident the site is secure and trustworthy | All | P0 |
| UG-13 | Understand the refund and invalid-code policy before purchasing | All | P0 |

### 5.2 Admin Goals

| ID | Goal | Persona | Priority |
|---|---|---|---|
| AG-01 | Upload gift card codes in bulk via CSV without technical help | Nipa | P0 |
| AG-02 | Be alerted automatically when any SKU stock falls below threshold | Nipa | P0 |
| AG-03 | Resend a code to a customer in under 2 minutes | Nipa | P0 |
| AG-04 | View all orders with search, filter, and export capability | Nipa, Founder | P0 |
| AG-05 | Add, edit, and deactivate products without a developer | Nipa | P0 |
| AG-06 | View revenue and sales reports without database access | Founder | P1 |
| AG-07 | Manage staff access with role-based permissions | Founder | P0 |
| AG-08 | See a full audit log of all admin actions | Founder | P1 |
| AG-09 | Issue a refund or mark an order as resolved from the admin panel | Nipa | P1 |

---

## 6. Fulfilment Architecture Recommendation

> **Decision Required from Founder before development begins.**
> This section provides the recommendation as requested. The founder must confirm Option A or B before the architecture document is written.

### Option A — CSV Pre-Loaded Inventory (Recommended for Launch)

**How it works:** Admin uploads a batch of gift card codes (purchased from supplier) into the platform via CSV. Each code is stored encrypted in the database. On order confirmation, the system assigns and delivers the next available unassigned code automatically.

| Dimension | Assessment |
|---|---|
| **Implementation Complexity** | Low — standard FIFO queue from database |
| **Cost** | No API integration cost; supplier cost only |
| **Speed** | Sub-second code assignment; sub-60-second delivery achievable |
| **Risk** | Stock-out risk if not monitored; requires pre-purchasing inventory |
| **Supplier Dependency** | None at code delivery time; only at restocking time |
| **Best For** | Launch phase with 30–80 SKUs; predictable top sellers |

**Recommendation:** Use Option A at launch. It is the fastest to build, most reliable, and lowest risk. Implement automated low-stock alerts at a configurable threshold (default: 20 codes remaining) to prevent stock-out.

---

### Option B — Supplier API Auto-Fulfilment

**How it works:** On order confirmation, the system calls a third-party supplier API in real time to purchase and retrieve the code, then delivers it to the customer.

| Dimension | Assessment |
|---|---|
| **Implementation Complexity** | High — each supplier has a different API; error handling is critical |
| **Cost** | API integration time per supplier (฿10,000–฿20,000 each); no pre-purchase inventory needed |
| **Speed** | Depends on supplier API latency; can exceed 60 seconds if supplier is slow |
| **Risk** | Supplier API downtime = failed orders; API changes break the platform |
| **Supplier Dependency** | Critical — a supplier outage causes order failures |
| **Best For** | Phase 2 when volume justifies automation and supplier relationships are established |

---

### Recommended Hybrid Path

| Phase | Approach |
|---|---|
| **Launch (Month 1–3)** | Option A only — CSV pre-loaded inventory for all SKUs |
| **Phase 2 (Month 4+)** | Add Option B for high-volume SKUs where suppliers offer a reliable API; keep Option A as fallback |

**Architecture implication:** The code delivery system must be built with an abstraction layer (Strategy pattern) so that Option B can be added per-SKU without rewriting the core delivery pipeline.

---

## 7. Functional Requirements

> **Priority Legend**
> | Priority | Meaning |
> |---|---|
> | **P0** | Must have at launch. Blocking. Platform cannot go live without this. |
> | **P1** | Should have at launch. High value. Include if budget and timeline permit. |
> | **P2** | Nice to have. Defer to Phase 2 if necessary. |

---

### 7.1 Storefront & Navigation

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-001 | The storefront shall be a Thai-language-first web application with full Thai Unicode rendering | P0 | Default language: Thai. All customer-facing copy, labels, error messages, and UI elements must be in Thai |
| FR-002 | The homepage shall display: hero banner, featured products section, category navigation, and trust signals (SSL badge, fast delivery badge, payment method icons) | P0 | Trust signals are a brand-level conversion requirement |
| FR-003 | The site shall be fully responsive across mobile (320px+), tablet (768px+), and desktop (1280px+) | P0 | Thai consumers are majority mobile; mobile is the primary breakpoint |
| FR-004 | Navigation shall include: top navigation bar with logo, search, cart icon, and account link; category mega-menu (Gaming, Streaming, E-Commerce); footer with legal links, payment icons, and contact info | P0 | |
| FR-005 | Category pages shall list products with: thumbnail, product name (Thai + English), denomination options, price, and stock status badge | P0 | Bilingual product name resolves PP-05 |
| FR-006 | The site shall render Core Web Vitals: LCP < 2.5s, FID < 100ms, CLS < 0.1 on mobile (3G connection simulation) | P0 | Required for SEO ranking in Thai Google |
| FR-007 | All pages shall include a persistent sticky header with cart count indicator on mobile | P1 | Improves mobile UX |
| FR-008 | The site shall display an "out of stock" state clearly on product cards and prevent out-of-stock items from being added to cart | P0 | Resolves PP-08 |
| FR-009 | A breadcrumb navigation shall appear on all category, product, and checkout pages | P1 | SEO + UX benefit |
| FR-010 | The site shall have a 404 page in Thai with links to homepage and top categories | P1 | |

---

### 7.2 Product Catalogue

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-011 | Each product (gift card brand) shall have: Thai name, English name, category, subcategory, thumbnail image, description (Thai), denomination variants, terms of use, and delivery information | P0 | |
| FR-012 | Each denomination variant shall have: face value (฿), sale price (฿), stock status (in stock / out of stock / low stock), and SKU code | P0 | |
| FR-013 | Product pages shall display: product image, name (Thai + English), denomination selector, quantity selector (1–10 per order), price with VAT included, stock availability, delivery method, terms of use, and "Add to Cart" button | P0 | Quantity selector resolves PP-07 for Raan Games persona |
| FR-014 | Maximum quantity per SKU per order shall be configurable in admin (default: 10) | P1 | Fraud prevention for bulk abuse |
| FR-015 | Products shall be organised into 3 top-level categories: Gaming, Streaming, E-Commerce; each with unlimited subcategories (e.g., Gaming > Mobile Games > ROV) | P0 | |
| FR-016 | Products shall support a "Featured" flag that surfaces them on the homepage featured section | P0 | |
| FR-017 | Product pages shall display a "How to use this gift card" section with step-by-step redemption instructions (can be a shared template per brand) | P1 | Reduces support tickets |
| FR-018 | Product pages shall display the platform's invalid-code guarantee and refund policy in a clearly visible section | P0 | Resolves PP-06 |
| FR-019 | Product images shall be served via CDN with WebP format and lazy loading | P0 | Performance requirement |
| FR-020 | Out-of-stock products shall remain visible with an "Out of Stock" badge and a "Notify me" email capture form (stored for admin awareness, not automated) | P2 | Phase 2 automated notification |

---

### 7.3 Search & Discovery

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-021 | The platform shall provide a search bar that searches across product names (Thai and English), categories, and brand names | P0 | |
| FR-022 | Search shall return results within 300ms for up to 10,000 products | P0 | |
| FR-023 | Search results shall display: product thumbnail, Thai name, English name, starting price, and stock status | P0 | |
| FR-024 | Search shall handle Thai language input including partial matches and common misspellings of brand names (e.g., "สตีม" = Steam, "เน็ตฟลิก" = Netflix) | P0 | Thai transliteration matching is critical for discoverability |
| FR-025 | Category pages shall support filtering by: subcategory, price range, and denomination | P1 | |
| FR-026 | Category pages shall support sorting by: relevance (default), price low-to-high, price high-to-low, name A-Z | P1 | |
| FR-027 | A "Popular Products" section shall appear on the homepage based on order count in the last 30 days | P1 | |

---

### 7.4 Cart & Checkout

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-028 | The cart shall persist in browser local storage for 24 hours (guest) or server-side for authenticated users | P0 | |
| FR-029 | The cart shall display: product name, denomination, quantity, unit price, subtotal per line, VAT amount, and order total | P0 | |
| FR-030 | The cart shall validate stock availability in real time when the cart is opened and immediately before checkout submission | P0 | Prevents overselling |
| FR-031 | If an item becomes out of stock while in cart, the system shall display a clear Thai-language warning and prevent checkout until the item is removed | P0 | |
| FR-032 | Guest checkout shall require: email address (for code delivery and order lookup), and phone number (optional, for LINE notification opt-in) | P0 | Minimal friction; resolves PP-01 |
| FR-033 | Checkout shall display a clear order summary with: itemised products, quantities, VAT (7%) breakdown, and total in THB | P0 | VAT compliance requirement |
| FR-034 | The customer shall be able to request a formal tax invoice (ใบกำกับภาษี) by providing their name/company name and tax ID at checkout (optional field) | P0 | Resolves PP-04; VAT compliance |
| FR-035 | Checkout shall display accepted payment method icons (PromptPay, Visa, Mastercard) above the payment selection | P0 | Trust signal |
| FR-036 | The checkout flow shall be a maximum of 3 steps: (1) Contact info, (2) Payment, (3) Confirmation | P0 | Conversion optimisation |
| FR-037 | The checkout page shall display platform trust badges: SSL Secured, Instant Delivery, Money-back Guarantee | P0 | |
| FR-038 | Before payment, the customer must check a checkbox accepting the Terms of Service and Privacy Policy (with links) | P0 | PDPA + legal requirement |
| FR-039 | Checkout shall be accessible without JavaScript disabled rendering (critical form elements must not rely solely on JS) | P1 | Accessibility + SEO |
| FR-040 | The system shall prevent duplicate order submission (double-click protection on payment button with loading state) | P0 | |

---

### 7.5 Payment Processing

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-041 | The platform shall integrate with a BOT-licensed payment gateway supporting PromptPay QR and credit/debit card (Visa, Mastercard) | P0 | Recommended: Omise (Opn Payments) or 2C2P |
| FR-042 | PromptPay payment shall generate a Thai QR code displayed on-screen and sent to the customer's email | P0 | |
| FR-043 | PromptPay QR shall have a configurable expiry time (default: 15 minutes) displayed as a countdown timer | P0 | BOT / gateway requirement |
| FR-044 | On PromptPay QR expiry, the system shall display a "QR Expired — Generate New QR" button without losing cart contents | P0 | |
| FR-045 | Credit/debit card payment shall use the gateway's hosted payment page or embedded iframe — raw card data must never pass through Nong-Kati servers | P0 | PCI-DSS compliance |
| FR-046 | Card payment shall enforce 3DS2 authentication (OTP via bank) | P0 | Card scheme requirement; chargeback protection |
| FR-047 | The system shall handle payment webhook events: payment.succeeded, payment.failed, payment.pending | P0 | |
| FR-048 | Payment webhooks shall be processed idempotently — duplicate webhook delivery must not create duplicate orders or double-deliver codes | P0 | Critical reliability requirement |
| FR-049 | On payment failure, the system shall display a specific Thai-language error message per failure reason (insufficient funds, card declined, 3DS failed, QR expired) and allow retry without re-entering contact details | P0 | |
| FR-050 | All payment amounts shall be calculated server-side; client-side price display is for UI only — final amount is authoritative from the server | P0 | Security requirement — prevents price manipulation |
| FR-051 | The system shall log every payment attempt (success, failure, pending) with timestamp, gateway reference, amount, and order ID | P0 | Audit and dispute resolution |
| FR-052 | VAT (7%) shall be calculated server-side as: `VAT = round(subtotal × 0.07, 2)`; Total = subtotal + VAT | P0 | Thai Revenue Department requirement |

---

### 7.6 Code Delivery

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-053 | On `payment.succeeded` webhook confirmation, the system shall automatically assign an undelivered code from inventory and mark it as delivered within 5 seconds | P0 | Core brand promise |
| FR-054 | Code assignment shall use FIFO (First In, First Out) from the code inventory pool for each SKU | P0 | Ensures oldest codes are used first |
| FR-055 | Code assignment shall be atomic — a code must be locked before assignment to prevent two concurrent orders receiving the same code | P0 | Database-level row locking or optimistic concurrency required |
| FR-056 | The order confirmation page shall display the gift card code(s) prominently immediately after payment confirmation, without requiring page refresh | P0 | |
| FR-057 | The order confirmation page shall display: order ID, product name, denomination, code(s), redemption instructions, and a "Copy Code" button per code | P0 | |
| FR-058 | If code delivery fails (no stock available at time of delivery), the system shall: (1) flag the order as "Pending — Manual Fulfilment", (2) immediately notify admin via email, (3) display a Thai-language message to the customer promising delivery within 2 hours | P0 | Graceful degradation for stock-out scenario |
| FR-059 | Every delivered code shall be stored in the order record permanently — customer can retrieve it via Order Lookup at any time | P0 | Resolves PP-10 |
| FR-060 | The code delivery system shall be built with a Strategy/Adapter pattern to support adding supplier API fulfilment per SKU in Phase 2 without refactoring the core | P0 | Architecture requirement |
| FR-061 | Codes shall be stored encrypted at rest (AES-256) in the database; decrypted only at the moment of delivery | P0 | Security requirement |
| FR-062 | A delivered code shall be marked as `DELIVERED` with timestamp and order ID — it can never be reassigned to another order | P0 | Data integrity |

---

### 7.7 Order Management (Customer-Facing)

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-063 | An "Order Lookup" page shall allow any customer to retrieve their order by entering: email address + order ID | P0 | Resolves PP-10 for guest buyers |
| FR-064 | Order Lookup shall display: order status, product(s), code(s), timestamp, and a "Resend to Email" button | P0 | |
| FR-065 | The "Resend to Email" function shall re-send the code to the original order email — it must not allow delivery to a different email address | P0 | Security requirement — prevents code theft via resend |
| FR-066 | Order statuses shall be: `PENDING_PAYMENT` → `PAYMENT_CONFIRMED` → `CODE_DELIVERED` → `COMPLETED` | `FAILED` | `REFUNDED` | P0 | |
| FR-067 | Registered customers shall see a full order history in their account dashboard | P1 | |
| FR-068 | The order confirmation page shall be accessible via a unique, unguessable URL (UUID-based) for up to 72 hours post-purchase | P0 | Allows customer to return to confirmation page |

---

### 7.8 Customer Authentication & Accounts

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-069 | Guest checkout shall be the default and recommended path — account creation must never be required | P0 | |
| FR-070 | After successful guest purchase, the confirmation page shall offer optional account creation with one click (email pre-filled, just set a password) | P1 | Reduces friction for post-purchase registration |
| FR-071 | Account registration shall require: email address and password (min 8 characters, at least 1 number) | P1 | |
| FR-072 | Account registration shall send a verification email; unverified accounts can log in but receive a banner prompt to verify | P1 | |
| FR-073 | Registered customers shall be able to: view order history, view and copy past codes, update email and password, and delete their account | P1 | PDPA right to erasure |
| FR-074 | Account deletion shall anonymise personal data (name, email replaced with anonymised tokens) while retaining order records for tax purposes (5-year retention) | P1 | PDPA compliance |
| FR-075 | Password reset shall be available via email link with a 1-hour expiry token | P1 | |
| FR-076 | The platform shall enforce brute-force protection on login: lockout after 5 failed attempts for 15 minutes | P0 | Security requirement |
| FR-077 | Session tokens shall expire after 30 days of inactivity for registered customers | P1 | |

---

### 7.9 Notifications (Email + LINE)

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-078 | The platform shall send a transactional email on `CODE_DELIVERED` status containing: order ID, product name, denomination, gift card code(s), redemption instructions, and a link to Order Lookup | P0 | Primary delivery channel |
| FR-079 | The transactional email shall be written in Thai language with professional formatting and Nong-Kati branding | P0 | |
| FR-080 | The platform shall support LINE Notify or LINE Messaging API to send code delivery notifications to customers who provide a phone number linked to LINE | P1 | Thai consumers use LINE as primary messaging |
| FR-081 | LINE notification shall contain: order ID, product name, code(s), and a short link to the Order Lookup page | P1 | Keep LINE message concise; LINE has character limits |
| FR-082 | LINE notification shall be opt-in only — customer must explicitly provide their phone number for LINE notification at checkout | P1 | PDPA consent requirement |
| FR-083 | Admin shall receive an email alert when any SKU inventory falls below the configured threshold (default: 20 codes) | P0 | Prevents stock-out |
| FR-084 | Admin shall receive an email alert when an order fails to auto-deliver a code (manual fulfilment required) | P0 | |
| FR-085 | All outbound emails shall use a custom domain sender (e.g., noreply@nong-kati.co.th) with SPF, DKIM, and DMARC records configured | P0 | Deliverability and trust |
| FR-086 | Email delivery shall use a transactional email SaaS provider (Resend, SendGrid, or Postmark) — no self-hosted mail server | P0 | Reliability and deliverability |
| FR-087 | Failed email delivery shall be retried up to 3 times with exponential backoff before being flagged for admin review | P0 | |

---

### 7.10 Tax Invoice & Receipts

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-088 | Every completed order shall generate a PDF receipt (ใบเสร็จรับเงิน) automatically, downloadable from the Order Lookup page and attached to the confirmation email | P0 | |
| FR-089 | If the customer requested a formal tax invoice at checkout, the system shall generate a PDF tax invoice (ใบกำกับภาษี) with: Nong-Kati's name, address, and tax ID; customer name/company and tax ID; itemised products; VAT amount; and total | P0 | Thai Revenue Department requirement |
| FR-090 | PDF generation shall be server-side; the customer receives a download link — no client-side PDF generation | P0 | Reliability and tamper-prevention |
| FR-091 | Tax invoices shall be stored permanently and retrievable by admin for 5 years (Thai tax record retention requirement) | P0 | |
| FR-092 | Tax invoice numbers shall follow a sequential, non-guessable format (e.g., `NK-2026-000001`) reset annually | P0 | Thai Revenue Department requirement |

---

### 7.11 Admin Panel — Authentication & RBAC

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-093 | The admin panel shall be accessible at a non-obvious URL path (e.g., `/management` or `/ops`) — not `/admin` | P0 | Security through obscurity as one layer of defence |
| FR-094 | Admin login shall require email + password + TOTP 2FA (Google Authenticator / Authy) | P0 | |
| FR-095 | Admin sessions shall expire after 8 hours of inactivity | P0 | |
| FR-096 | The platform shall implement Role-Based Access Control (RBAC) with the following roles and permissions: | P0 | |

**RBAC Permission Matrix:**

| Permission | Super Admin | Catalogue Manager | Order Manager | Finance Viewer |
|---|---|---|---|---|
| Manage products & categories | ✅ | ✅ | ❌ | ❌ |
| Upload / manage code inventory | ✅ | ✅ | ❌ | ❌ |
| View all orders | ✅ | ❌ | ✅ | ✅ (read-only) |
| Resend codes / resolve orders | ✅ | ❌ | ✅ | ❌ |
| Issue refunds | ✅ | ❌ | ✅ | ❌ |
| View customer data | ✅ | ❌ | ✅ | ❌ |
| View revenue reports | ✅ | ❌ | ❌ | ✅ |
| Export reports (CSV) | ✅ | ❌ | ❌ | ✅ |
| Manage staff accounts | ✅ | ❌ | ❌ | ❌ |
| View audit log | ✅ | ❌ | ❌ | ❌ |
| System configuration | ✅ | ❌ | ❌ | ❌ |

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-097 | All admin actions that modify data shall be logged to an append-only audit log with: timestamp, admin user ID, action type, affected record ID, before state, and after state | P0 | Cannot be deleted or modified — append-only |
| FR-098 | Admin accounts shall be created by Super Admin only — no self-registration | P0 | |
| FR-099 | Super Admin can deactivate (not delete) admin accounts; deactivated accounts are immediately session-terminated | P0 | |

---

### 7.12 Admin Panel — Product & Catalogue Management

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-100 | Admin shall be able to create a new product with: Thai name, English name, category, subcategory, description (rich text), thumbnail image upload, featured flag, and status (draft/published) | P0 | |
| FR-101 | Admin shall be able to add denomination variants to a product, each with: face value, sale price, SKU code, and stock display threshold (triggers low-stock alert) | P0 | |
| FR-102 | Admin shall be able to edit any product field and publish/unpublish a product without deleting it | P0 | |
| FR-103 | Unpublishing a product shall immediately hide it from the storefront but preserve all historical order records | P0 | |
| FR-104 | Admin shall be able to manage categories: create, rename, reorder, and deactivate categories and subcategories | P0 | |
| FR-105 | Admin shall be able to bulk-upload product images (drag-and-drop); images shall be automatically resized and converted to WebP | P1 | |
| FR-106 | Admin shall see a live preview of how a product page will look before publishing | P2 | |

---

### 7.13 Admin Panel — Inventory & Code Management

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-107 | Admin shall be able to upload gift card codes for a specific SKU via CSV file with columns: `code`, `notes` (optional) | P0 | |
| FR-108 | CSV import shall validate each code: reject duplicates (same code already in database), reject empty rows, and display an import summary (imported: N, rejected: N, reasons) | P0 | |
| FR-109 | Uploaded codes shall be stored encrypted (AES-256-GCM) with the encryption key stored separately from the database (environment variable / secrets manager) | P0 | Security requirement |
| FR-110 | Admin shall see an inventory dashboard showing per-SKU: total codes uploaded, codes delivered, codes available, and low-stock status | P0 | |
| FR-111 | Admin shall be able to configure a low-stock alert threshold per SKU (default: 20) | P0 | |
| FR-112 | Admin shall be able to view individual code statuses: `AVAILABLE`, `RESERVED`, `DELIVERED`, `VOIDED` | P1 | |
| FR-113 | Admin shall be able to void a specific code (mark as unusable) with a mandatory reason field | P1 | For invalid codes from supplier |
| FR-114 | Admin shall be able to download a CSV export of all delivered codes per SKU per date range (for supplier reconciliation) | P1 | |
| FR-115 | The system shall prevent any code from being assigned to more than one order — enforced at database constraint level | P0 | Critical integrity requirement |

---

### 7.14 Admin Panel — Order Management

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-116 | Admin shall have an orders dashboard displaying all orders with: order ID, customer email, products, total amount, payment status, delivery status, and timestamp | P0 | |
| FR-117 | Admin shall be able to filter orders by: date range, status, payment method, and SKU | P0 | |
| FR-118 | Admin shall be able to search orders by: order ID, customer email, and gateway transaction reference | P0 | |
| FR-119 | Admin shall be able to view the full detail of any order including: all items, payment logs, code delivery log, email delivery status, and audit trail | P0 | |
| FR-120 | Admin shall be able to manually resend the code delivery email for any completed order | P0 | Resolves PP-15 |
| FR-121 | Admin shall be able to manually assign a specific code to a pending order (for manual fulfilment cases) | P0 | |
| FR-122 | Admin shall be able to mark an order as `REFUNDED` with a mandatory reason and refund reference number | P1 | |
| FR-123 | Admin shall be able to export all orders in a date range to CSV | P1 | |
| FR-124 | Admin shall see a real-time count of: today's orders, today's revenue, pending orders (manual fulfilment required), and failed payments | P0 | Top-line dashboard |

---

### 7.15 Admin Panel — Customer Management

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-125 | Admin shall be able to search for a customer by email address and view their order history | P0 | |
| FR-126 | Admin shall be able to view a customer's profile: email, registration date, total orders, total spend | P1 | |
| FR-127 | Admin shall be able to flag a customer email as blocked (blocks future orders from that email) | P1 | Fraud prevention |
| FR-128 | Customer data displayed in admin shall be the minimum necessary for the task — full code values shall be masked except when explicitly viewed | P0 | PDPA data minimisation principle |
| FR-129 | Admin access to customer personal data shall be logged in the audit trail | P0 | PDPA accountability |

---

### 7.16 Admin Panel — Staff Management

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-130 | Super Admin shall be able to create staff accounts with: name, email, role, and temporary password | P0 | |
| FR-131 | Super Admin shall be able to change a staff member's role at any time | P0 | |
| FR-132 | Super Admin shall be able to deactivate a staff account immediately (sessions invalidated) | P0 | |
| FR-133 | Staff members shall be prompted to change their temporary password on first login | P0 | |
| FR-134 | Super Admin shall see a staff activity summary: last login, actions this week | P1 | |

---

### 7.17 Admin Panel — Reporting & Analytics

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-135 | Admin shall have a revenue dashboard showing: total revenue, total orders, average order value, and gross margin % — filterable by day, week, month, and custom date range | P1 | |
| FR-136 | Admin shall see a top products report: best-selling SKUs by order count and revenue in a selected period | P1 | |
| FR-137 | Admin shall see a payment method breakdown: % of orders by PromptPay vs. card | P1 | |
| FR-138 | Admin shall be able to export any report to CSV | P1 | |
| FR-139 | All revenue figures shall include a VAT column (VAT collected = total × 7/107) for tax reporting | P0 | Thai Revenue Department requirement |

---

### 7.18 Security & Fraud Prevention

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-140 | All traffic shall be served over HTTPS (TLS 1.3); HTTP requests shall redirect to HTTPS | P0 | |
| FR-141 | Cloudflare WAF shall be configured in front of all public endpoints | P0 | |
| FR-142 | Rate limiting shall be applied to: checkout submission (10/min per IP), payment initiation (5/min per IP), order lookup (20/min per IP), and admin login (5/min per IP) | P0 | |
| FR-143 | Google reCAPTCHA v3 shall be applied to the checkout submission endpoint; scores below 0.5 shall trigger an additional friction step | P0 | |
| FR-144 | A per-email order velocity limit shall prevent more than 20 orders per email address per 24-hour period | P0 | Fraud prevention |
| FR-145 | A per-IP order velocity limit shall prevent more than 30 orders per IP per 24-hour period | P0 | Fraud prevention |
| FR-146 | All database queries shall use parameterised queries / ORM — no raw string concatenation in SQL | P0 | SQL injection prevention |
| FR-147 | All user-facing input shall be sanitised server-side before storage or rendering | P0 | XSS prevention |
| FR-148 | HTTP security headers shall be configured: `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` | P0 | |
| FR-149 | Dependency vulnerability scanning shall be automated in CI/CD pipeline (e.g., `npm audit` or Snyk) | P1 | |
| FR-150 | Admin panel IP allowlisting shall be available as a configurable option (Super Admin can restrict admin panel access to specific IPs) | P1 | |

---

### 7.19 SEO & Performance

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-151 | Every product page shall have unique, Thai-language: `<title>`, `<meta name="description">`, `<meta property="og:*">`, and canonical URL | P0 | |
| FR-152 | Product pages shall include JSON-LD structured data: `Product` schema with name, description, offers (price, currency, availability) | P0 | Enables Google rich results |
| FR-153 | The site shall generate and serve a dynamic `sitemap.xml` including all published product and category pages, updated on each publish action | P0 | |
| FR-154 | The site shall serve a `robots.txt` that: allows all product and category pages; disallows admin, checkout, order-lookup, and account pages | P0 | |
| FR-155 | Product and category pages shall be Server-Side Rendered (SSR) or Incremental Static Regeneration (ISR) — not client-side rendered — for SEO | P0 | Next.js SSR/ISR required |
| FR-156 | All images shall include descriptive Thai-language `alt` attributes | P0 | Accessibility + SEO |
| FR-157 | The platform shall implement proper hreflang tags (even if Thai-only at launch, future-proofing) | P2 | |
| FR-158 | Page load performance: homepage LCP < 2.5s on 4G mobile; product page LCP < 2.5s | P0 | Core Web Vitals |

---

### 7.20 PDPA & Compliance

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-159 | A cookie consent banner shall appear for all first-time visitors in Thai language, offering: Accept All, Reject Non-Essential, and Manage Preferences | P0 | PDPA consent requirement |
| FR-160 | Cookie consent preferences shall be stored in browser and respected immediately; analytics scripts shall not load until consent is granted | P0 | |
| FR-161 | A Privacy Policy page shall exist in Thai and be accessible from all page footers | P0 | |
| FR-162 | A Terms of Service page shall exist in Thai and be accessible from all page footers | P0 | |
| FR-163 | A Data Subject Rights request form shall allow customers to submit requests for: data access, correction, deletion, and portability | P0 | PDPA Chapter 3 rights |
| FR-164 | Data subject requests shall create a ticket in the admin panel for Super Admin to action within 30 days | P0 | PDPA response timeline |
| FR-165 | Consent records shall be stored with: timestamp, consent version, IP address, and user identifier (email or session ID) | P0 | PDPA audit trail |
| FR-166 | Marketing email opt-in shall be a separate, unchecked checkbox at checkout — not bundled with order confirmation opt-in | P0 | PDPA explicit consent for marketing |
| FR-167 | The platform shall maintain a data retention schedule: order + tax data (5 years), customer account data (until deletion request), consent logs (3 years), audit logs (2 years) | P0 | Thai tax law + PDPA |
| FR-168 | In the event of a confirmed personal data breach, the system shall have a documented internal escalation procedure to notify PDPC within 72 hours | P0 | PDPA Section 37(3) |

---

## 8. Non-Functional Requirements

### 8.1 Performance

| ID | Requirement | Target | Measurement Method |
|---|---|---|---|
| NFR-001 | Homepage LCP | < 2.5 seconds on 4G mobile | Google PageSpeed Insights |
| NFR-002 | Product page LCP | < 2.5 seconds on 4G mobile | Google PageSpeed Insights |
| NFR-003 | Checkout page load | < 2.0 seconds | Lighthouse |
| NFR-004 | Search response time | < 300ms for ≤ 10,000 products | Server-side benchmark |
| NFR-005 | Payment webhook processing | < 5 seconds from receipt to code assignment | Application logs |
| NFR-006 | Code delivery end-to-end (P95) | < 60 seconds from payment confirmation | Application logs |
| NFR-007 | Admin panel page load | < 3 seconds | Lighthouse |
| NFR-008 | CSV import (up to 1,000 codes) | < 30 seconds | Manual test |
| NFR-009 | Core Web Vitals pass rate | ≥ 90% of product pages pass all three metrics | Google Search Console |

### 8.2 Scalability

| ID | Requirement | Target |
|---|---|---|
| NFR-010 | Concurrent users (storefront) | Support 1,000 concurrent users without degradation at launch; 10,000 at Month 12 |
| NFR-011 | Order throughput | Support 100 orders/minute at peak (flash sale scenario) |
| NFR-012 | Database connection pooling | Implemented from day one (PgBouncer or equivalent) |
| NFR-013 | Stateless application tier | Application servers are stateless; all session state in database or Redis |
| NFR-014 | Horizontal scaling readiness | Application can scale horizontally by adding instances without code changes |
| NFR-015 | Code inventory query performance | Code assignment query executes in < 50ms even with 1,000,000 codes in inventory table |

### 8.3 Reliability & Availability

| ID | Requirement | Target |
|---|---|---|
| NFR-016 | Storefront uptime | ≥ 99.9% monthly (≤ 43 minutes downtime/month) |
| NFR-017 | Admin panel uptime | ≥ 99.5% monthly |
| NFR-018 | Payment processing availability | ≥ 99.9% (dependent on gateway SLA) |
| NFR-019 | Recovery Time Objective (RTO) | < 1 hour for critical failures |
| NFR-020 | Recovery Point Objective (RPO) | < 15 minutes (database backups every 15 minutes) |
| NFR-021 | Graceful degradation | If email provider fails, order is marked complete; code is displayed on confirmation page; email retry queued |
| NFR-022 | Queue-based processing | Code delivery and notification jobs processed via durable job queue (BullMQ or equivalent); jobs survive application restart |

### 8.4 Security

| ID | Requirement | Target |
|---|---|---|
| NFR-023 | OWASP Top 10 | Zero unresolved OWASP Top 10 vulnerabilities at launch |
| NFR-024 | Data encryption at rest | All PII and gift card codes encrypted at rest (AES-256-GCM) |
| NFR-025 | Data encryption in transit | TLS 1.3 minimum for all connections |
| NFR-026 | Secret management | No secrets in codebase; all via environment variables or secrets manager |
| NFR-027 | Dependency vulnerabilities | Zero high/critical CVEs in production dependencies |
| NFR-028 | Penetration testing | Basic internal penetration test before launch; third-party pen test at Month 6 |

### 8.5 Maintainability

| ID | Requirement | Target |
|---|---|---|
| NFR-029 | Code coverage | ≥ 80% unit test coverage on business logic (payment, code delivery, inventory) |
| NFR-030 | TypeScript strict mode | Enabled; no `any` types in production code |
| NFR-031 | Linting | ESLint + Prettier enforced in CI; PRs blocked on lint failure |
| NFR-032 | Documentation | All API endpoints documented (OpenAPI 3.0 spec); all environment variables documented in README |
| NFR-033 | Database migrations | All schema changes via versioned migration files (Prisma Migrate); never applied manually |
| NFR-034 | Error monitoring | Sentry or equivalent configured for production; all unhandled errors captured with context |

### 8.6 Accessibility

| ID | Requirement | Target |
|---|---|---|
| NFR-035 | WCAG compliance | WCAG 2.1 Level AA for all customer-facing pages |
| NFR-036 | Screen reader support | All interactive elements have ARIA labels; focus management on modals |
| NFR-037 | Colour contrast | Minimum 4.5:1 contrast ratio for body text; 3:1 for large text |
| NFR-038 | Keyboard navigation | Full keyboard navigability for checkout and order lookup flows |
| NFR-039 | Thai font rendering | Thai language text uses a font with full Thai Unicode support (e.g., Sarabun, Noto Sans Thai) |

---

## 9. Acceptance Criteria

> Acceptance criteria are written in **Given / When / Then** format. All P0 criteria must pass before production deployment is approved.

### AC-001 — Guest Checkout with PromptPay (P0)
```
Given: A guest visitor on the product page for "Steam Wallet ฿100"
When: They add 1 unit to cart, proceed to checkout,
      enter a valid email address, select PromptPay,
      and scan the generated QR code with a Thai banking app
Then: - A PromptPay QR code is displayed within 3 seconds of clicking "Pay"
      - The QR expires in 15 minutes with a visible countdown
      - Within 60 seconds of successful PromptPay payment:
          (a) The order confirmation page displays the gift card code
          (b) A confirmation email is sent to the provided email address
          (c) The code in the database is marked as DELIVERED
          (d) The order status is COMPLETED
```

### AC-002 — Guest Checkout with Credit Card (P0)
```
Given: A guest visitor on the product page for "Netflix Gift Card ฿300"
When: They add 1 unit to cart, proceed to checkout,
      enter a valid email, select credit card,
      complete 3DS2 OTP, and payment is confirmed
Then: - Payment is processed via gateway (no card data on Nong-Kati servers)
      - 3DS2 OTP challenge is presented by the bank
      - Within 60 seconds of payment confirmation:
          (a) The gift card code is displayed on the confirmation page
          (b) Confirmation email with code is delivered to the email address
          (c) Order status is COMPLETED
```

### AC-003 — Out-of-Stock Prevention (P0)
```
Given: A product SKU has 0 codes in inventory
When: A customer views the product page or the cart containing that SKU
Then: - The product card displays "Out of Stock" badge
      - The "Add to Cart" button is disabled
      - If the item was already in the cart when it went out of stock,
        a Thai-language warning banner appears and checkout is blocked
      - The customer cannot proceed to payment
```

### AC-004 — Code Uniqueness Guarantee (P0)
```
Given: Two concurrent orders are placed simultaneously for the same SKU
       that has only 1 code remaining in inventory
When: Both payment webhooks are received within milliseconds of each other
Then: - Exactly one order receives the code and reaches status COMPLETED
      - The other order is placed in PENDING_MANUAL_FULFILMENT status
      - Admin receives an alert email for the pending order
      - No code is assigned to more than one order
      - Database-level locking prevents race condition
```

### AC-005 — Order Lookup for Guest (P0)
```
Given: A guest buyer completed a purchase 3 days ago
When: They visit the Order Lookup page and enter their email + order ID
Then: - Their order details are displayed including the gift card code(s)
      - A "Resend to Email" button is visible
      - Clicking "Resend" sends the code to the ORIGINAL order email only
      - The code is not sent to any other email address
```

### AC-006 — CSV Code Upload (P0)
```
Given: An admin with Catalogue Manager role logs into the admin panel
When: They upload a CSV file with 500 gift card codes for SKU "PSN Wallet ฿500"
Then: - Each code is validated for duplicates against existing inventory
      - Valid codes are imported and stored encrypted (AES-256-GCM)
      - An import summary shows: imported 498, rejected 2 (with reasons)
      - The SKU inventory count updates to reflect the new stock
      - The import is recorded in the audit log with admin ID and timestamp
```

### AC-007 — Low-Stock Alert (P0)
```
Given: A SKU's low-stock threshold is set to 20 codes
When: The available code count for that SKU drops to 20 (inclusive)
Then: - An alert email is sent to the admin email address within 5 minutes
      - The alert email identifies the specific SKU name and current stock count
      - The admin inventory dashboard shows the SKU highlighted as low-stock
      - Only one alert is sent per threshold breach (not on every subsequent order)
```

### AC-008 — RBAC Enforcement (P0)
```
Given: A staff member with Order Manager role is logged in
When: They attempt to access the product management section
Then: - Access is denied with a permission error message
      - The product management menu item is not visible in their navigation
      - A direct URL attempt to /admin/products returns a 403 Forbidden response
      - The access attempt is logged in the audit trail
```

### AC-009 — VAT Calculation (P0)
```
Given: A customer adds a product priced at ฿107.00 (VAT inclusive) to cart
When: They view the cart and checkout summary
Then: - Subtotal (ex-VAT) = ฿100.00
      - VAT (7%) = ฿7.00
      - Total = ฿107.00
      - These values match exactly between cart, checkout, and the generated receipt
      - The payment gateway is charged exactly ฿107.00 (server-calculated, not client)
```

### AC-010 — PDPA Cookie Consent (P0)
```
Given: A first-time visitor arrives on the homepage
When: The page loads
Then: - A cookie consent banner appears in Thai language before any analytics scripts load
      - Google Analytics does NOT fire until the user clicks "Accept" or "Accept All"
      - If the user clicks "Reject Non-Essential", only essential cookies are set
      - The user's choice is stored and the banner does not reappear for 180 days
      - The consent record (timestamp, choice, session ID) is stored in the database
```

### AC-011 — 2FA Admin Login (P0)
```
Given: A staff member attempts to log in to the admin panel
When: They enter correct email and password
Then: - They are prompted for a 6-digit TOTP code
      - Entering a valid TOTP code grants access
      - Entering an invalid TOTP code denies access and logs the attempt
      - After 5 failed TOTP attempts, the account is locked for 30 minutes
      - The login and lockout events are recorded in the audit log
```

### AC-012 — Payment Webhook Idempotency (P0)
```
Given: A payment gateway sends the same payment.succeeded webhook twice
       (a common gateway retry behaviour)
When: The system receives the duplicate webhook
Then: - The first webhook creates the order record and delivers the code
      - The second webhook is detected as a duplicate (by gateway transaction ID)
      - No second code is assigned; no duplicate email is sent
      - The duplicate webhook is logged but no error is raised
      - The order status remains COMPLETED (not changed)
```

---

## 10. Edge Cases

### 10.1 Payment Edge Cases

| ID | Edge Case | Expected Behaviour |
|---|---|---|
| EC-001 | PromptPay QR scanned but payment never confirmed (customer abandons) | Order remains in PENDING_PAYMENT; cart is released after QR expiry; no code assigned |
| EC-002 | Payment webhook arrives but order record does not exist (race condition / DB error) | Webhook is queued for retry (3× with backoff); admin alerted if all retries fail |
| EC-003 | Payment is confirmed but amount does not match the expected order total | Order is flagged as PAYMENT_MISMATCH; code not delivered; admin alerted immediately |
| EC-004 | Customer pays twice for the same order (e.g., double-submits while waiting) | Second payment is detected (same order ID); second charge is immediately refunded via gateway; one code delivered |
| EC-005 | Payment gateway webhook signature verification fails (potential spoofing) | Webhook is rejected with 401; event logged with source IP; no order action taken |
| EC-006 | Card payment authorised but not captured (authorisation-only gateway response) | Order held in PENDING_CAPTURE; code not delivered; admin alerted |
| EC-007 | Currency mismatch in webhook (gateway sends amount in different currency) | Order flagged for manual review; code not delivered; admin alerted |

### 10.2 Inventory & Code Delivery Edge Cases

| ID | Edge Case | Expected Behaviour |
|---|---|---|
| EC-008 | Payment confirmed but zero codes available in inventory for the SKU | Order set to PENDING_MANUAL_FULFILMENT; customer sees "Your code will be delivered within 2 hours" message; admin email alert sent immediately |
| EC-009 | Code is assigned but email delivery fails | Order marked COMPLETED; code visible on confirmation page; email retry queued (3×); if all retries fail, admin alerted |
| EC-010 | Customer reports a code as invalid or already used | Admin manually voids the code, assigns a replacement, and resends — documented in order notes |
| EC-011 | Admin uploads a CSV containing codes that already exist in the database | Duplicate codes are rejected with row numbers indicated; valid codes are imported; import summary shown |
| EC-012 | Two admin users attempt to upload the same batch of codes simultaneously | Database unique constraint prevents duplicate codes; second upload receives rejection summary for all duplicates |
| EC-013 | SKU has codes in inventory but all are VOIDED | System treats SKU as out-of-stock; low-stock alert fires; product shows "Out of Stock" on storefront |
| EC-014 | Customer orders 10 units of same SKU when only 7 codes remain | Order is blocked at checkout with a Thai-language message: "Only 7 units available"; customer must reduce quantity |

### 10.3 User & Session Edge Cases

| ID | Edge Case | Expected Behaviour |
|---|---|---|
| EC-015 | Customer closes browser immediately after payment but before confirmation page loads | Order is still processed via webhook; code delivered; confirmation email sent; order retrievable via Order Lookup |
| EC-016 | Customer enters an email with a typo (e.g., gmail.con) | Email format is validated client-side and server-side; system does not block on potential typo but warns if domain is a known common misspelling |
| EC-017 | Guest customer tries to retrieve order but forgets their order ID | Order Lookup requires both email + order ID; no way to retrieve by email alone (security); confirmation email contains the order ID; customer is directed to check their email |
| EC-018 | Registered customer account email conflicts with an existing guest order email | Account creation links the guest order history to the new account automatically |
| EC-019 | Customer attempts to order with a blocked email address | Checkout is blocked silently (appears as a payment failure, not a block message) to prevent enumeration by bad actors |

### 10.4 Admin Edge Cases

| ID | Edge Case | Expected Behaviour |
|---|---|---|
| EC-020 | Super Admin accidentally deactivates their own account | System prevents the last active Super Admin from deactivating themselves; error message shown |
| EC-021 | Admin tries to publish a product with no codes in inventory | System warns but allows publishing; product shows as "Out of Stock" on storefront |
| EC-022 | Admin changes a product price while customers have it in their cart | Cart retains the old price until refreshed; on checkout, server recalculates with current price; customer is notified of price change before final payment |
| EC-023 | Admin uploads a CSV with 10,000+ codes | Import is processed asynchronously; admin receives an email when import completes; UI shows a "Processing..." state |
| EC-024 | Two Order Managers attempt to manually assign the same code to different orders simultaneously | Database row-level lock prevents both from succeeding; second assignment gets a conflict error; admin retries with a different code |

### 10.5 PDPA & Compliance Edge Cases

| ID | Edge Case | Expected Behaviour |
|---|---|---|
| EC-025 | Customer submits a data deletion request for an account with open orders | System anonymises personal data but retains order records (name replaced with "Deleted User [ID]") to meet 5-year tax retention; customer is informed of this constraint |
| EC-026 | Customer resubmits cookie consent with different preferences on return visit | New consent record is created with updated timestamp; old record is retained for audit; latest preference is active |
| EC-027 | Customer places order without accepting Terms of Service checkbox | Checkout is blocked server-side; order is not created; error message displayed in Thai |

---

## 11. Future Features (Phase 2+)

> These features are explicitly out of scope for the MVP. They are documented here to ensure the MVP architecture does not block their future implementation.

### Phase 2 (Months 3–6)

| ID | Feature | Rationale |
|---|---|---|
| FF-001 | **Promotional voucher / discount code engine** | Drives first-purchase conversion and retention |
| FF-002 | **Flash sale / time-limited pricing** | Seasonal demand spikes (Songkran, New Year, 11.11) |
| FF-003 | **Loyalty points / store credit system** | Increases repeat purchase rate |
| FF-004 | **Affiliate / referral programme** | Low-cost customer acquisition channel |
| FF-005 | **LINE OA integration** (order notifications via LINE Official Account) | Thai consumers' primary messaging channel |
| FF-006 | **Supplier API auto-fulfilment** (per-SKU, alongside CSV fallback) | Reduces manual restocking for high-volume SKUs |
| FF-007 | **Product review (star rating only, verified purchasers)** | Deferred from launch; requires trust baseline |
| FF-008 | **Admin revenue analytics dashboard** | Founder self-serve reporting |
| FF-009 | **Bulk / B2B order flow** with volume quantity selector | Serves Raan Games persona at scale |
| FF-010 | **Out-of-stock email notification** (automated when SKU restocked) | Re-engages interested buyers |
| FF-011 | **"Notify me when back in stock" capture** | Demand signal collection |

### Phase 3 (Month 6–12)

| ID | Feature | Rationale |
|---|---|---|
| FF-012 | **Native mobile app** (iOS + Android) | Serve Kaem persona's mobile-first behaviour |
| FF-013 | **API for B2B / reseller integration** | Serve Raan Games persona with programmatic access |
| FF-014 | **English language support** | Expand to expat market in Thailand |
| FF-015 | **Gift card delivery via personalised gift page** | Improves gifting experience for Somchai persona |
| FF-016 | **Subscription email newsletters** (promotional) | Retention marketing channel |
| FF-017 | **Admin A/B testing capability** | Homepage and product page optimisation |
| FF-018 | **Fraud scoring engine** | Replace rule-based velocity checks with ML-based scoring |
| FF-019 | **Tax invoice automation** via Thai e-Tax Invoice system (e-Tax by Revenue Department) | Reduces admin manual work for VAT reporting |

---

## 12. Success Metrics

> All metrics are measurable, time-bound, and directly connected to the Business Objectives in Section 1.

### 12.1 Launch Success Metrics (Day 1–30)

| Metric | Method | Target |
|---|---|---|
| Platform uptime | Uptime monitoring (UptimeRobot / Better Uptime) | ≥ 99.9% |
| Payment success rate | Application logs + gateway dashboard | ≥ 98% |
| Code delivery within 60s (P95) | Application logs — webhook received to code delivered timestamp | ≥ 95% |
| Zero critical security vulnerabilities | Pre-launch security checklist + OWASP review | 100% pass |
| All P0 acceptance criteria passing | QA sign-off checklist | 100% |
| First paid order | Order management dashboard | ≥ 1 order |

### 12.2 Product Metrics (Monthly)

| Metric | Definition | Target M3 | Target M12 |
|---|---|---|---|
| **Conversion Rate** | Completed orders / unique visitors | ≥ 2% | ≥ 3% |
| **Cart Abandonment Rate** | Abandoned carts / initiated checkouts | < 35% | < 25% |
| **Average Order Value (AOV)** | Revenue / orders | ≥ ฿150 | ≥ ฿200 |
| **Repeat Purchase Rate** | Orders from returning customers / total orders | ≥ 15% | ≥ 25% |
| **Guest vs. Registered Ratio** | % orders by registered accounts | N/A (M3) | ≥ 20% registered |
| **Support Ticket Rate** | Tickets opened / orders placed | < 3% | < 1.5% |
| **Invalid Code Rate** | Invalid code complaints / total codes delivered | < 0.5% | < 0.1% |

### 12.3 Technical Metrics (Continuous)

| Metric | Monitoring Tool | Target |
|---|---|---|
| Core Web Vitals — LCP | Google Search Console | < 2.5s for ≥ 90% pages |
| Core Web Vitals — CLS | Google Search Console | < 0.1 for ≥ 90% pages |
| API error rate (5xx) | Sentry / logs | < 0.1% of requests |
| Payment webhook processing time | Application logs | P99 < 10 seconds |
| Code delivery end-to-end (P95) | Application logs | < 60 seconds |
| Database query P99 latency | Database monitoring | < 200ms |

### 12.4 Business Metrics (Monthly)

| Metric | Source | Target M3 | Target M12 |
|---|---|---|---|
| Monthly Orders | Order dashboard | ≥ 1,000 | ≥ 10,000 |
| Monthly Revenue (GMV) | Order dashboard | ≥ ฿150,000 | ≥ ฿2,000,000 |
| Gross Margin % | Revenue − COGS / Revenue | ≥ 8% | ≥ 10% |
| Organic Search Sessions | Google Search Console | ≥ 1,000/month | ≥ 20,000/month |
| CSAT Score | Post-purchase email survey | ≥ 4.0/5.0 | ≥ 4.5/5.0 |

---

## 13. Open Questions & Decisions Log

| ID | Question | Status | Decision | Decided By | Date |
|---|---|---|---|---|---|
| OQ-01 | Which payment gateway: Omise (Opn Payments) or 2C2P? | **Open** | Pending founder account application | Founder | — |
| OQ-02 | Fulfilment model: CSV (Option A) vs. API (Option B)? | **Recommended** | Option A (CSV) at launch; Option B in Phase 2 | PRD Recommendation | 2026-06-27 |
| OQ-03 | Domain name: nong-kati.co.th or nong-kati.com? | **Open** | .co.th requires Thai company registration | Founder | — |
| OQ-04 | Is Nong-Kati a registered Thai company (สำนักงาน)? This affects .co.th eligibility, VAT registration, and tax invoices | **Open** | Requires founder confirmation | Founder | — |
| OQ-05 | LINE integration: LINE Notify (free, being deprecated) vs. LINE Messaging API (paid, per-message)? | **Open** | LINE Notify deprecated 2025; Messaging API is the path | Engineering | — |
| OQ-06 | Which email provider: Resend, SendGrid, or Postmark? | **Open** | Recommend Resend (lowest cost, modern DX, Thai deliverability) | Engineering | — |
| OQ-07 | AES-256-GCM key management: environment variable vs. AWS KMS / Cloudflare KV secrets? | **Open** | Recommend env var at launch; KMS at Phase 2 | Engineering | — |
| OQ-08 | Thai legal advisor identified for PDPA review? | **Open** | Must be resolved before launch gate | Founder | — |
| OQ-09 | VAT registration status: currently registered or pending? | **Open** | Determines whether tax invoices can be issued at launch | Founder | — |
| OQ-10 | Admin panel hosting: same domain (subdomain admin.nong-kati.co.th) or separate domain? | **Open** | Recommend subdomain with IP allowlist | Engineering | — |

---

*End of Document — 01-prd.md v1.0.0*

*This document is the single source of truth for all product requirements. No feature shall be built that is not defined here. No requirement defined here shall be omitted without a written scope change approved by the Founder.*
