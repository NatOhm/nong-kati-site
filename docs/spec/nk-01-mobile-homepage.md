# NK-01 — Mobile Homepage Specification

**Status:** Proposal for client review
**Version:** 2.0 — rewrite of `Nong kati v2_phone.md`
**Depends on:** `nk-00-foundation.md` (all tokens, themes, textures, mascot and motion rules)
**Reference viewport:** **390 × 844 CSS px**, sticky header **and** fixed bottom nav both visible
**Guiding rule:** compactness first, product discovery second, decoration third.

---

## 1. What this document is

A section-by-section build spec for the mobile homepage at `src/app/page.tsx`, replacing the
v1.0 mobile document. It states, for every section: the surface in **both themes**, the exact
**vertical budget**, the component that renders it, and what already ships.

Roughly **70% of the v1.0 mobile spec is already implemented**. §9 lists what is new; everything
else below is a correction, a dimension, or a theme mapping.

## 2. The first-viewport contract

The page must satisfy this at 390 × 844, with no scroll, in both themes:

1. The announcement strip, the navbar and the hero notice card are fully visible.
2. The hero's CTA **เลือกซื้อสินค้า** is fully visible and tappable (≥ 48px tall).
3. The **first row of the category grid** is at least partially visible — in **both** visitor states
   (returning visitor and first visit, §2.3).

This is the promise the current code documents as *audit #9*. It survives the redesign.
**Acceptance is a screenshot** (see §10), not a calculation.

### 2.1 Measured baseline (live site, 390 × 844, scroll 0, dark theme)

Measured with `getBoundingClientRect()` against `https://nongkatistore.com` on 2026-11-22, not
estimated:

| Band | Measured |
|---|---|
| Announcement strip | 41px tall, navbar sticky at `top: 41` |
| Navbar | 57px (`h-14` 56 + 1px border) → hero starts at 98 |
| Hero v2 band | **337px** (h1 wraps to 3 lines at 390) → ends at 435 |
| How to buy `วิธีการซื้อ` | **≈345px** (heading + three 76px rows) → ends at ≈780 |
| Categories heading `หมวดหมู่แอปทั้งหมด` | **top = 824px** — 20px inside the 844px viewport, but entirely behind the fixed nav that starts at 781 |
| Category panel | top = 867px |
| First category tile row | **top = 954px** — 173px below the nav's top edge |
| Fixed bottom nav | 63px, occupying y 781–844 |

**State of these numbers:** they are the **returning-visitor** state — consent already stored, so no
cookie banner above the chrome. The committed captures in this folder (`baseline-mobile-390x844-*.png`)
are the opposite state: a first visit, with the consent banner in flow at the top, which is why the
category grid is nowhere in them. §2.3 defines that state and its own budget.

**The first-viewport contract is not satisfied by the shipped page.** The first tile row is
173px below the bottom nav's top edge. Two bands are over budget, and both have to change.

### 2.2 Vertical budget (target)

Stated as cumulative top edges, so the rows add up:

| Band | Target (top edge) | Measured | Change |
|---|---|---|---|
| Announcement strip | 0 | 0 | none |
| Navbar | 41 | 41 | none |
| Hero v2 band | 98 | 98 | none |
| Hero v2 band **ends** | **≤ 398** (band ≤ 300px) | 435 | h1 capped to 2 lines (−37) |
| How-to-buy **ends** | **≤ 518** (band ≤ 120px) | ≈780 | 3 rows → 1 strip (−262 total, §6.2) |
| Categories heading row | 562 | 824 | follows from the two cuts |
| Category panel | 605 | 867 | panel + heading chrome unchanged |
| **First tile row** | **≤ 720** (model: 692) | 954 | **−262** |
| Bottom nav top edge | 781 | 781 | fixed |

The two cuts are the how-to-buy collapse (−225px) and the headline (−37px). The hero's structure and
mascot size do not change. The 720px limit exists because the fixed nav starts at 781 and a tile row
needs its top ~60px legible above it; the model lands at 692, which leaves 28px of slack for a
second headline line or a taller strip. No section may borrow from the next: if a band needs more
height, it moves **below** the categories. Every figure in this table is the **returning-visitor**
state; §2.3 gives the first-visit budget.

### 2.3 First visit: the cookie-consent strip

This is the one band that is **in front of** the announcement strip, and it is the reason a new
visitor sees no categories at all.

**Shipped behaviour.** `CookieConsentBanner` is rendered in `app/layout.tsx` *before* the storefront
chrome, so on phones it is **in flow at the very top of the document**: it pushes the announcement
strip, the navbar and the hero down by its full height. It is a real content band, not an overlay.
Its height today is the sum of `py-3` (24) + a 2–3 line `text-xs` paragraph (~33–50) + `gap-3` (12) +
a 44px action row + a 1px border — **~115–130px**, depending on how many lines the copy takes.

That is the whole gap: on a 390×844 first visit the visitor gets banner + announcement + navbar +
hero + how-to-buy, and the category grid starts below the fold. The audit-#9 promise fails for
exactly the audience that has never seen the shop.

Desktop is not affected: from `md` up the same component is `fixed bottom-0` and occupies no layout
height.

#### Compact treatment (below `md`)

| Element | Spec |
|---|---|
| Layout | **One row**, always: copy left, three controls right. No second row, no stacked buttons |
| Padding | `px-3 py-2`, 1px `border-b border-line-subtle` |
| Copy | `text-[11px] leading-snug`, ≤ 3 lines at 390: `การใช้คุกกี้:` bold + **one** sentence |
| Controls | ตั้งค่า · ปฏิเสธ · ยอมรับ, each `h-11` (**44px**), `text-xs`, gap 8 |
| Height | **≤ 61px** at 390 (44 row + 16 padding + 1 border); ≤ 72px at 320, where the copy takes a fourth line |
| Surface | `bg-surface-base`, `text-fg-secondary` — unchanged; accept stays `bg-peach-700` + white (4.89:1) |
| Prominence | Accept and reject keep **equal visual weight**: ปฏิเสธ is never demoted into the details panel |
| Expanded details | May exceed the budget — it is user-initiated. The contract is measured on the collapsed strip. Keep it **in flow**, never fixed |
| Desktop (`md+`) | Unchanged: fixed bottom bar, zero layout height |

**Do not make it fixed on phones.** That is what it used to be, and the old bar sat on top of the
product page's package chips on a 390px screen. A fixed strip would also fight the 63px bottom nav.
The banner stays in flow; the fix is its height, not its position.

#### Why the announcement strip yields

A 61px strip added above everything puts the first tile row at 692 + 61 = **753px**, which is still
above the nav's 781 but 33px over the 720 target — only 28px of the row would show. So the treatment
is: **while the consent strip is visible, the announcement strip does not render.**

Net change is then 61 − 41 = **+20px**, not +61:

| Band | Returning visitor | First visit |
|---|---|---|
| Announcement strip | 41 | — (suppressed) |
| Consent strip | — | 61 |
| Navbar / hero / how-to-buy | 98 → 692 | 118 → 712 |
| **First tile row** | **692** | **712** |
| Row visible above the nav (781) | 89px | **69px** |

**Mechanism (no new state plumbing):** `AnnouncementBar` already mounts client-side and already
fetches its own settings, and the banner already dispatches a `nk:consent` event on all three exits
(accept, reject, save-selection). So the announcement reads `getStoredConsent()` at mount, renders
nothing while consent is pending, and appears on that existing event. No provider, no context, no
new client boundary. It must key off *stored consent*, never off a mount-time render, or it repeats
the bug where the bar was pinned hidden forever.

**Why the announcement and not the hero:** the announcement is marketing copy and is admin-suppressed
half the time; the hero carries the CTA and the only price anchor on the page; the consent notice is
the only legally required band. Hiding marketing for one page-view costs less than hiding the shop.

**Fallback (client decision C7):** if the announcement must stay, the first-visit tile row is 753px.
The first row is still partially visible — 28px of it clears the nav — so §2 item 3 is satisfied
literally, but the 720px target is not. Either answer is defensible; this spec recommends the
yielding version because it keeps the target.

**Note for later:** `getStoredConsent()` rejects any stored row whose `version` is not `1.0`. Bumping
`CONSENT_VERSION` re-arms the +61px state for **every** visitor, not just new ones, so a version bump
is a first-viewport change and belongs in the same review.

## 3. Design principles for this viewport

- One idea per band. A band has either a headline, or art, or a product — not two competing ones.
- Decoration is a **layer**, never a block: it overlays existing padding and adds no height.
- Every tap target ≥ 44×44; every label at `text-[10px]` or larger; every count pill readable at
  320px with a Thai app name.
- The bottom nav is the navigation. Nothing else competes with it.

## 4. Hero — the decision

**The illustrated band stays compact. The illustration lives inside the existing card.**

Rejected: a full-width illustrated hero under the CTA (v1.0 §5.2). It costs 140–180px and breaks
the first-viewport contract. The v1.0 goal — "mascot interacting with the world" — is met by
layering:

| Layer | Placement | Height cost |
|---|---|---|
| Polka halo (`polka-sm`, `aria-hidden`) | behind the mascot, `position: absolute`, 96×96 blob | 0 |
| Mascot | 56px, `mx-auto`, `mascot-wave` | (existing 56px) |
| Two floating chips (star / popcorn, SVG) | card's top-left and top-right, `sm+` only, `pointer-events-none` | 0 |
| Ambient glow | radial gradient behind the mascot | 0 |
| App tiles | **not on phones** (`hidden md:block` today) — they are the desktop's job | 0 |

### 4.1 Hero dimensions

| Element | `xs` 320–479 | `sm` 480–767 | Notes |
|---|---|---|---|
| Section padding | `pt-4 pb-6 px-3` | same | shipped |
| Band background | `bg-peach-100` + gradient → `bg-surface` | same | underlay is a real colour |
| Dark band | `dark:bg-clay-900` gradient → `dark:bg-surface` | same | shipped |
| Card | `rounded-2xl`, `border-2 border-dashed`, `bg-peach-50`, `px-4 py-3` | `px-6 py-5` | shipped |
| Card dark | `dark:bg-peach-900/20`, `dark:border-peach-700/60` | same | shipped |
| Mascot | **56px** (`!h-14 !w-14`) | **84px** | shipped; the `!` beats `SiteMascot`'s inline size |
| H1 | `text-xl` (20/28), max 2 lines | `text-2xl` | shipped; only `h1` on the page |
| Sub | `text-sm text-clay-800` | same | clears AA on the `peach-50` card, shipped |
| Price anchor | `text-sm font-semibold text-fg-brand-strong` | same | `เริ่ม ฿N · ส่งโค้ดถึงอีเมลในไม่กี่นาที` |
| CTA | `min-h-[48px] w-full rounded-full` | `sm:w-auto` | shipped |

**No vertical growth.** If a proposed element adds height to this card, it is rejected.

## 5. Header and navigation

### 5.1 Navbar (shipped — dimension lock)

- Height `h-14` (56px) + 1px bottom border = 57px rendered; `sticky top-0 z-50`, offset by
  `--nk-safe-top`.
- `bg-surface-nav` + `border-b border-line` + `backdrop-blur-md` + `shadow-clay-sm`.
- Phone contents: hamburger (44×44) · logo (40px mascot + wordmark) · cart · notifications ·
  profile. Search field is `hidden md:block` (and hidden on `/search`, where the page-level field
  replaces it) — the phone uses the bottom nav's ค้นหา sheet.
- Dark: same classes, tokens flip. Nothing hardcoded.

### 5.2 Bottom navigation (shipped — must not change)

Four items, in this order, no fifth:

| Item | Icon | Target | Behaviour |
|---|---|---|---|
| หน้าหลัก | `AcornIcon` (clay) | `/` | active = brand colour + `scale-110` |
| ค้นหา | `Search` | — | opens `SearchOverlay` sheet in place |
| ตะกร้า | `ShoppingCart` | `/checkout` | crimson count badge when `itemCount > 0` |
| บัญชี / เข้าสู่ระบบ / แอดมิน | `PawIcon` | `/account/dashboard` · `/account/login` · chooser | admin opens the identity menu |

- `min-h-[44px] min-w-[60px]`, label `text-[10px]`, bar ≈ 63px + `--nk-safe-bottom`.
- `fixed bottom-0 z-50 lg:hidden`, `bg-surface-base/95 backdrop-blur-md`.
- Never add พิเศษ/โปรโมชัน/support to the bar. Support lives in the drawer + `/account/support`.

## 6. How to buy

Two treatments. Below `sm` it is a single inline **strip**; from `sm` up it is today's shipped
three-column grid. A `clay-card` row carries a `text-2xl` step number, title/copy, and one mascot:
`HamsterFace` (browse) → `HamsterWorried` (slip checked) → `HamsterCelebrating` (code delivered).
Light: `clay-card` on `bg-surface-base`. Dark: `clay-card` (surface `#46321c`).

### 6.1 Why this section changes on phones

The client moved วิธีการซื้อ to the very top, and it now measures ~345px — which is exactly what
pushes the category grid out of the first viewport (§2.1). The fix is not to remove it: it is to
make it a **strip** below `sm` (the `xs` range only) and keep the full three-card grid from `sm` up.

### 6.2 Compact strip (below `sm`, ≤ 120px total including the heading)

- One row: `01 เลือกสินค้า` · `02 ชำระเงิน` · `03 รับโค้ด`, three equal inline items in a single
  `clay-card` band, `gap-2`, `py-2`.
- Number `text-sm font-bold` in `peach-700` (dark `peach-200`), label `text-xs`, description
  **hidden** (it is the tallest element and the least read).
- Mascots: 28px, one per step; `mascot-sniff` / `mascot-beg` / `mascot-celebrate` kept.
- From `sm` up: today's three-column cards with descriptions (`sm:grid-cols-3`). The structure is
  unchanged; only the desktop padding and step-number size in `nk-02` §5 differ.
- Tap targets: the strip is informational, not interactive — no 44px requirement applies.

Budget, so the 120px is a number that holds: section `py-4` (32) + heading `text-base` (26) +
`mb-2` (8) + the band itself (`py-2` around a 28px mascot ≈ 54) = **120px**. An earlier draft
targeted 80px; that is not reachable while the วิธีการซื้อ heading stays above the strip, and the
budget does not need it — 120px still lands the first tile row at ~692px.

The result: the category panel starts at ~605px and the first tile row at ~692px, so 176px of the
panel — including ~89px of the first tile row — sits above the bottom nav at 781px. The audit-#9
promise is restored rather than abandoned.

## 7. Categories — data-driven bento

Source: `getCategoriesWithProductCounts()` → `splitAppGroups()` → `groups` (roots with children)
and `looseApps` (roots without).

### 7.1 Rules

1. **A group with `productCount === 0` is not rendered.** No dimmed tiles, no dead links.
2. A group whose children all have `productCount === 0` is not rendered either.
3. Order follows the admin's `sortOrder`; the document never hardcodes a category name.
4. `looseApps` render after the groups in one unlabelled grid.
5. When nothing has products, the whole section is omitted (the outage alert in §8 already
   explains a genuine outage).

### 7.2 Mobile layout

| Element | Spec |
|---|---|
| Section padding | `px-4 py-6` |
| Heading row | `หมวดหมู่แอปทั้งหมด` (`text-lg font-bold`) + `ดูทั้งหมด` (44px tap target) |
| Panel | `rounded-2xl bg-clay-100 p-4 shadow-clay`, dark `bg-clay-950` |
| Group pill | full-width, `rounded-full`, peach/fawn gradient on `bg-clay-300` underlay; dark caramel on `bg-clay-500`; icon + wrapping name + `N รายการ` pill + `ดูทั้งหมด →` |
| Tile grid | **2 columns** (`grid-cols-2 gap-3`), `sm:grid-cols-4` |
| Tile | artwork or clay emoji badge, name, count pill |
| Group gap | `mb-6 last:mb-0` |

The 2-up phone grid is deliberate: at 390px a 3-up grid left ~111px tiles where Thai names and
the count pill collided. **Do not "improve" this to 3-up.**

Bento expression on phones = the group pill + the panel + one optional 2-col feature tile for a
group with exactly 1 child (spans both columns). No size variation beyond that; the phone is not
where asymmetry earns its keep.

## 8. Featured products (shipped)

`ProductGrid` → 2 columns on phones (`gap-3`). `ProductCard` renders image, category, name,
short description, price, promotion strike-through, stock badge, wishlist, and one buy control whose
label follows `variantCount` (`ซื้อสินค้า` with a single variant, `เลือกราคา` with several — there is
no visible "variant count" element).
Every field is real data; the spec invents nothing, and adds no fifth field to the card.

The DB-outage alert sits above the catalogue region when `categories`/`featured`/`stats` reject,
with **ลองอีกครั้ง** and **ค้นหาคำสั่งซื้อเดิม**. Keep it. On the phone the error card's dark-mode
text used to be illegible; the current `text-fg` / `text-fg-muted` pairing is the fix — do not
revert to a fixed colour.

## 9. New work on the phone (this is the delta)

| # | Item | Where | Cost |
|---|---|---|---|
| 1 | Polka dot layer behind the hero mascot + promo banner | `page.tsx` / `PromoBanner` | 0px height, CSS only |
| 2 | Promo banner section (settings-driven, hidden until configured) | between featured and trust | ~180px, below the fold |
| 3 | Shopping + Movie hamster poses | `ClayIcons.tsx` | — |
| 4 | Sleeping hamster beside the FAQ heading | `FAQAccordion` | 0px (absolute) |
| 5 | Curious hamster in the empty-cart / empty-search state | `EmptyCart`, `SearchEmptyState` | — |
| 6 | Footer warm dark-brown surface | `Footer` | token change (§ nk-00 §4) |
| 7 | Compact first-visit consent strip + announcement yielding to it | `CookieConsentBanner`, `AnnouncementBar` | −110px on a first visit (171 → 61, §2.3) |

### 9.1 Promo banner (mobile)

- Full-bleed inside `px-4`, `rounded-3xl`, `polka-sm` over `bg-coral-100` (light) / `bg-clay-950` (dark).
- Layout: headline (2 lines max) → one supporting line → CTA `rounded-full min-h-[44px]`.
- Art: Shopping or Movie hamster, 96px, bottom-right, cropped by the card.
- **Renders only when configured.** No placeholder text, no lorem, no fake discount.
- Never shows a price the catalogue does not have.

### 9.2 FAQ (mobile)

`max-w-2xl` clay card, 44px+ rows, `aria-expanded`, hidden answers kept out of the a11y tree
(shipped). Add the sleeping hamster as an `aria-hidden`, absolutely positioned decoration at the
top-right of the card — it must not push the first question down more than 0px.

### 9.3 Footer (mobile)

Warm dark-brown (`bg-footer`), stacked columns, every link ≥ 44px tall, legal links wrapping to
two lines, paw signature with `mascot-peek`. Dark theme: `--bg-footer` = sunken. Both themes must
pass `e2e/contrast.spec.ts` before merge.

## 10. Verification (required for the next phase)

**A. Returning visitor** (no banner — this is the state §2.1/§2.2 model)

1. Accept the consent banner once, reload, `preview_resize` to **390 × 844**, then
   `preview_screenshot` to `…/baseline-mobile-390x844-light.png` (the committed pair is `-light` /
   `-dark`).
2. The capture must show announcement + navbar + hero card + CTA **and** the fixed bottom nav with
   all four items.
3. Repeat with `preview_set_color_scheme` = `dark`; save `baseline-mobile-390x844-dark.png`.

**B. First visit** (the state the current baseline captures, and the one §2.3 fixes)

4. Clear `localStorage.nk_cookie_consent`, reload at 390×844, capture
   `first-visit-390x844-light.png`. This is the only screenshot that proves the contract for a new
   visitor.
5. Measure with `getBoundingClientRect()` and record: consent strip **≤ 61px**, announcement
   **absent**, first tile row **≤ 720px**, bottom-nav top **781px**, all three consent controls
   **≥ 44×44**.
6. Press ยอมรับ: the strip disappears, the announcement returns, and the tile row is back to the
   returning-visitor position (692).

In either state, if the first category row is not visible the hero shortens — the categories never
move up.

## 11. Motion on mobile

At most one entrance and one hover per section; `ScrollReveal` owns entrances; `.page-enter` owns
route entry. Mascot keyframes are limited to the hero (`mascot-wave`) and the how-to-buy trio.
Everything honours reduced motion via `globals.css`; no inline `animation` styles.

## 12. Performance and accessibility

- No new JS dependency, no new font, no new image request for the texture (CSS gradient only).
- Decoration: `aria-hidden`, `pointer-events-none`.
- One `h1`; `h2` per section; landmarks intact (`e2e/landmarks.spec.ts`).
- No horizontal scroll at 320 / 390 / 430 px (`e2e/responsive-a11y.spec.ts`).
- iOS: inputs ≥ 16px text to avoid zoom; safe-area insets respected (`e2e/ios-safari.spec.ts`).

## 13. Acceptance checklist

- [ ] First-viewport contract holds at 390×844, screenshot attached, both themes
- [ ] First-viewport contract holds on a **first visit**: consent strip ≤ 61px, announcement
      suppressed while it shows, first tile row ≤ 720px (712 measured)
- [ ] Consent strip keeps accept/reject equal prominence and three 44px controls
- [ ] Bottom nav unchanged: four items, 44×44, no Promotions entry
- [ ] Hero band ≤ 300px, no illustrated band under the CTA
- [ ] Zero-product groups hidden, not dimmed
- [ ] Category name wraps instead of clipping at 390px
- [ ] Every new surface appears in `nk-00` §3.1 with a dark counterpart
- [ ] No `bg-white`, no new hex, no animation library
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit`, `e2e/contrast.spec.ts` green
