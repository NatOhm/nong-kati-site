# NK-02 — Desktop Homepage Specification

**Status:** Proposal for client review
**Version:** 1.0 — new document (the v1.0 "PC" file was a creative-direction brief, not a layout spec)
**Depends on:** `nk-00-foundation.md`
**Target:** "creative Awwwards-inspired e-commerce", not "the phone layout with a bigger mascot"

---

## 1. What makes this desktop-specific

Three things, and they are the whole design:

1. **Product in the first screen.** The desktop hero puts real merchandise (three illustrated app
   tiles) next to the message. The phone cannot afford this; desktop must not waste it.
2. **A bento that follows the catalogue.** Categories are sized by how much the database actually
   holds, so the grid has hierarchy instead of eight identical rows.
3. **Three signature moments, and only three.** Hero layering, bento feature tile, promo overlap.
   Everywhere else the page is disciplined.

Decoration is not a layer of confetti. It is three deliberate gestures on an otherwise quiet grid.

## 2. The real desktop canvas (measured from the code)

**There is no fixed left sidebar.** The client asked for the desktop rail to go ("เอาด้านข้างออก
เหลือไว้แค่ด้านบน") and `FacebookSidebar` records it: the only thing that component renders is a
`fixed` 300px drawer with `lg:hidden`, i.e. below `lg`. `--sidebar-width` (256px) still exists in
`tokens.css`, but nothing reads it — an earlier draft of this document did its arithmetic against
that dead token and concluded, wrongly, that `lg` had no desktop canvas. That conclusion is
withdrawn.

The real chain is `FacebookLayout` → `<div class="flex">` → `<main class="min-w-0 flex-1">` →
`<div class="mx-auto max-w-[1440px]">` → sections with `px-4 md:px-8`. The drawer is out of flow,
so it subtracts nothing. Usable width is **min(viewport, 1440) − 64px of gutters**:

| Viewport | Content column | Usable after `px-8` | What fits |
|---|---|---|---|
| `md` 768 | 768 | 704 | 2-col hero, 3-col products, 6-up tiles (~102px each) |
| `lg` 1024 | 1024 | 960 | 2-col hero, 4-col products, 8-up tiles (~105px each) |
| `xl` 1280 | 1280 | 1216 | hero capped at `max-w-5xl` (1024), 4-col products |
| 1440 | 1440 (wrapper cap reached) | 1376 | hero still 1024 — the wrapper does not widen it |
| `2xl` 1536+ | 1440 (capped) | 1376 | hero may widen to `max-w-6xl` (1152) |

**Consequence for design:** the asymmetry has to read at **960–1216px usable**, the `lg`–`xl` range
where most desktop visitors actually land — not at 1280 of canvas. 704px at `md` is the tightest
two-column canvas, which is why the tablet ratios are narrower than the `xl` ones. Note also that
the 1440 wrapper caps the **content column**, not the viewport: above 1440 the column stops growing
and the hero does not widen again until `2xl:max-w-6xl`.

## 3. Navigation and header

Shipped behaviour, restated as the contract (it is load-bearing and must not regress):

| Element | `md` 768–1023 | `lg` 1024–1279 | `xl` 1280+ |
|---|---|---|---|
| Height | `h-16` (64px) | 64 | 64 |
| Hamburger | yes | yes | hidden (`xl:hidden`) |
| Drawer panel (300px) | opens | **cannot open today** — see below | not needed |
| Search field | visible (`w-48`) | `lg:w-64` | `xl:w-56` |
| Text links (4) | hidden | hidden | visible |
| Theme + motion toggles | hidden | visible | visible |
| Support, profile, cart, bell | visible | visible | visible |
| Sidebar rail | none | none | none |

**Shipped defect this spec depends on fixing.** The hamburger is `xl:hidden`, but the drawer's
backdrop, panel and close bar are all `lg:hidden`. At 1024–1279px the button is visible and tapping
it renders nothing. This design needs the drawer at `lg`, because the text links only appear at
`xl` — so the engineering phase must drop `lg:hidden` from those three elements (one class each) or
re-introduce a rail. Dropping the class is the smaller change and keeps a single navigation model.
Nothing else here depends on it except §11's "drawer carries navigation below `xl`".

Rules for this redesign:

- **Do not add a fifth navbar link.** The three clusters need ~1180px; that is why links start at
  `xl`. Promoting them to `lg` re-creates the crushed-label bug.
- The navbar stays `bg-surface-nav`, 64px, `border-b border-line`, `shadow-clay-sm`. It is chrome,
  not a hero — no polka, no mascot animation, no extra height.
- Active state: `bg-peach-100 text-peach-800` with the dark overrides already in the component.
- Logo: 40px mascot mark + wordmark; hover `scale-110` is the only motion.
- Announcement strip above the bar, one line, admin-editable, hidden when off.

## 4. Hero — two columns

Container: `max-w-5xl` (1024) centred, band full-bleed — it fills 960px at `lg`, is capped at
1024 from `xl`, and only widens at `2xl`.

Band: `bg-peach-100` + `bg-gradient-to-b from-peach-100 via-peach-50 to-surface`
(dark: `bg-clay-900` → `via-clay-900` → `to-surface`). Padding `md:px-8 md:pt-8` and `pb-10` at
`lg+` (the only section allowed a deeper bottom).

### 4.1 Grid and proportions

| Breakpoint | Columns | Gap | Left / right |
|---|---|---|---|
| `md` | `grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]` | 24px | copy 55% / tiles 45% |
| `lg` | same | 32px | copy 55% / tiles 45% |
| `xl` | `[minmax(0,1.15fr)_minmax(0,0.85fr)]` | 40px | copy 57% / tiles 43% |

`items-center`. The left card keeps its dashed border and `bg-peach-50`; it is the page's tonal
break and the anchor of the composition.

### 4.2 Left column (copy)

| Element | `md` | `lg` | `xl` |
|---|---|---|---|
| Mascot | 120px, left-aligned, `mascot-wave` | 140px | 160px |
| H1 | `text-2xl` | `text-3xl` | `text-4xl`, max 2 lines |
| Sub | `text-sm` | `text-base` | `text-base` |
| Price anchor | `text-sm font-semibold` | `text-base` | `text-base` |
| CTA | `min-h-[48px]`, inline, `px-8` | same | same, `shadow-clay-brand` |

### 4.3 Mascot positioning and proportions — signature moment #1

- The mascot sits **inside** the card on phones but **breaks the card's top edge** from `lg`:
  `lg:-mt-14` (56px) against the card's `py-5` (20px) top padding and `overflow-visible`, so the
  hamster's head sits **~36px** above the dashed border. Size does not change with scroll — it is a
  negative margin — and the section must not clip it (`overflow-hidden` is forbidden here).
- Behind it, a `polka-sm` halo 200×200 (`lg`) / 240×240 (`xl`), `rounded-full`, offset −32px left,
  −28px up, `aria-hidden`, `pointer-events-none`. This is the only place the brand texture appears
  in the hero.
- One ambient radial glow under the mascot; no third layer.
- Proportions are fixed by the illustration: do not stretch. `width = height`.
- **Constraint:** `SiteMascot` pins inline `width`/`height`, so any size change needs the `!`
  utility (as the phone hero already does). When an admin has uploaded a mascot, the same image
  renders in every pose slot — the layout must not depend on the pose differing.

### 4.4 Right column — merchandise

- Label `แอปยอดนิยม` (`text-xs`, muted), then a 3-up grid of `AppTile`, `gap-3`.
- Tiles come from every group's children, flattened and filtered to those with artwork, then the
  first three — `appGroups.flatMap(g => g.children).filter(imageUrl).slice(0, 3)`, shipping today.
  Loose apps fill in when there are no groups. **No hardcoded app, no fake count.**
- `lg`: tiles lift `translate-y-[-12px]` relative to the copy card, staggering the composition by
  12px. This is the entire asymmetry of the hero — one offset, not four.
- Hover: `translate-y-[-2px]` + `shadow-clay-sm` (shipped pattern).
- If fewer than 3 apps have artwork, the right column renders what exists and the left card keeps
  55% — the grid never collapses to a single centred column.

## 5. How to buy

Three columns from `sm` up — the shipped structure (`grid-cols-1 sm:grid-cols-3`, `p-4`, step
number `text-2xl`, mascot 44px). The only desktop deltas are `md:p-5` and the step number at
`text-3xl` from `lg`; `nk-01` §6 owns the phone strip, so the two documents never disagree about
this section. No polka, no offset. Its job is to answer "how do I buy" in one glance.

## 6. Categories — the bento (signature moment #2)

Data: `getCategoriesWithProductCounts()` → `splitAppGroups()` → `groups` + `looseApps`.

### 6.1 Rules

1. `productCount === 0` → group **not rendered** (no dimmed, non-functional tiles).
2. All children `productCount === 0` → group not rendered.
3. Order = admin `sortOrder`. No hardcoded name, no fixed trio.
4. `looseApps` render after the groups in one unlabelled grid.
5. Section omitted entirely when nothing has products.
6. The feature tile is chosen by **`productCount` desc**, first group wins ties.

### 6.2 Grid behaviour

Tile grid is 8 columns at `lg+` (`lg:grid-cols-8`), 6 at `md`, 4 at `sm`, 2 at `xs`.

| Group shape | Desktop treatment |
|---|---|
| 1 child | feature tile, `col-span-2`, artwork 96px, name + count pill |
| 2–4 children | feature tile for the first child, remaining tiles `col-span-1` |
| 5–8 children | uniform 8-up row |
| > 8 children | uniform 8-up row + the pill's `ดูทั้งหมด →` (already present) |

One feature tile per group, never two. A group's row always aligns to the 8-col grid, so rows
stack cleanly down the page.

### 6.3 Chrome

Panel: `rounded-2xl bg-clay-100 p-4 md:p-6 shadow-clay` (dark `bg-clay-950`).
Group pill: gradient peach/fawn over the `bg-clay-300` underlay; dark caramel over `bg-clay-500`.
`md:py-3`, name `text-sm font-bold` wrapping, count pill `text-xs`, `ดูทั้งหมด →` right-aligned
with a ≥44px target. Group gap `md:mb-8`.

Section heading `หมวดหมู่แอปทั้งหมด` (`md:text-xl`) with `ดูทั้งหมด` at the right.

## 7. Featured products — grid and card hierarchy

`ProductGrid` → 2 / `md:3` / `lg:4`. Gap `md:gap-4`.

Card hierarchy (top to bottom), and it is strict:

1. **Image** — **square** (`aspect-square`, shipped) in a `bg-surface` well; gentle `scale-105` on
   hover only (no crop shift, no parallax). The emoji placeholder is the shipped
   `peach-100 → clay-200` gradient, not a flat fill.
2. **Category** — `text-xs font-medium text-fg-brand-strong` (brand-strong, not muted: muted lands
   at 4.47:1 on the card fill in dark).
3. **Name** — `text-sm font-semibold`, 2-line clamp.
4. **Short description** — `text-xs text-fg-muted`, 2-line clamp (shipped; kept, not extended).
5. **Price** — `text-sm font-bold` in a `bg-surface-sunken` pill; when a promotion exists, the
   original is strike-through at `text-xs text-fg-muted`.
6. **Stock urgency** — `text-[11px]`: `พร้อมส่ง` / `เหลือ N ใบ` / `สินค้าหมด`.
7. **CTA** — full-width `h-11`/`min-h-[44px]` brand fill; the label follows `variantCount`
   (`ซื้อสินค้า` → `เลือกราคา`), so there is no separate variant-count element.
8. Stock badge + wishlist — small, top corners.

Desktop adds **nothing** to the card except hover lift and the wider grid. No quick-view on hover
(the quick-view modal is shipped behaviour for multi-variant products, unchanged), no image zoom
beyond the shipped transform, no added marketing copy.

`สินค้าแนะนำ` heading row paired with `ดูทั้งหมด →` → `/recommended` (exists).

## 8. Promo section (signature moment #3)

- Container `max-w-content`, `rounded-3xl`, `md:py-10`.
- Two columns `1.4fr / 1fr` at `md+`: headline + one line + CTA left, mascot right.
- Background: `polka-sm` over `bg-coral-100` (light) / over `bg-clay-950` with `bg-clay-900` wash
  (dark). `coral` is the only ramp not already carrying a large surface, so the promo is the one
  place it appears.
- Mascot (Shopping or Movie pose) **240px at `md`, 320px at `lg`, 400px at `xl`**. The 1.4fr/1fr
  split leaves the art column ~237 / ~343 / ~450px at those widths, so each step is the largest size
  that still fits without narrowing the copy column — 320px does **not** fit at `md`, which is why
  the size steps with the canvas rather than with the breakpoint name.
- The crop is deliberate and comes from `translate-x-4 translate-y-6` under the card's
  `overflow-hidden`, not from the image being wider than its column. That crop is the third gesture;
  nothing else in the section moves.
- **Settings-driven, hidden when unconfigured** — same pattern as `HeroCarousel` and
  `TrustBadges`. No fake campaign, no placeholder discount.
- No parallax. Static offset only.

## 9. Trust badges, FAQ, stats

- **Trust** — `max-w-4xl`, `md:grid-cols-5`, clay cards. Unchanged.
- **FAQ** — desktop becomes two columns: accordion `1.6fr` (`max-w-none`) + a 240px column holding
  the sleeping hamster and a short support line linking `/account/support`. Answers readable at
  `max-w-prose` inside the accordion. Keyboard interaction and hidden answers stay as shipped.
- **Stats** — horizontal, 2 numbers (`สินค้า`, `สต๊อก`), hidden during an outage. Unchanged.

## 10. Footer

- `bg-footer` (warm dark brown `clay-950`) with `text-footer` / `text-footer-muted`.
- Structure: 4 columns at `md+` (brand + contact / สินค้า / บัญชีของฉัน / ช่วยเหลือ), full-height
  row at `lg`, then a hairline `border-footer` and the legal row (`md:flex-row md:justify-between`).
- Every link ≥ 44px tall (kept). Paw signature with `mascot-peek`.
- Dark theme: `--bg-footer` becomes `surface-sunken` so the footer still reads as the page's
  deepest surface without a second brown.
- Contrast: `clay-100` **13.0:1** and `clay-300` **10.2:1** on `clay-950`; in the dark theme the
  footer is `#2c1e12`, where they are **15.2:1** and **9.5:1** (`nk-00` §4). Both themes must pass
  `e2e/contrast.spec.ts` before merge.

## 11. Responsive behaviour summary

| Section | `md` 768 | `lg` 1024 | `xl` 1280 | `2xl` 1536 |
|---|---|---|---|---|
| Navbar | search + drawer | + theme/motion (drawer fix required, §3) | + 4 text links | unchanged |
| Hero | 2 cols, mascot 120 | 2 cols, mascot 140, head breaks card | 2 cols 1.15/0.85, mascot 160, h1 4xl | hero may widen to 6xl |
| Canvas | 704 usable | 960 usable | 1216 usable | 1376 usable (wrapper caps) |
| How to buy | 3 cols | 3 cols, `p-5` | 3 cols | unchanged |
| Categories | pill + 6-up | pill + 8-up + feature tile | bento full | unchanged |
| Featured | 3 cols | 4 cols | 4 cols | unchanged |
| Promo | 2 cols, 240 mascot | 2 cols, 320 | 2 cols, 400 + crop | unchanged |
| FAQ | 2 cols | 2 cols | 2 cols + prose cap | unchanged |
| Footer | 4 cols | 4 cols + legal row | unchanged | unchanged |

Tablet is not "compressed desktop": at `md` the hero is two columns because 704px genuinely fits
them, and the drawer carries navigation that the `xl` bar cannot hold yet.

## 12. Themes

Every surface above appears in `nk-00` §3.1 with a dark counterpart. Two desktop-specific notes:

- The hero's polka halo and glow swap to their dark variables; the mascot illustration itself is
  unchanged (it already reads on `clay-900`).
- The promo banner's blush wash must not be used in dark mode at all — it becomes `clay-900` over
  `clay-950`, otherwise the section is the brightest thing on a dark page.

## 13. Motion on desktop

CSS only. Reveals via `ScrollReveal`; route entry via `.page-enter`; hover responses ≤ 180ms;
the only looping animations are `mascot-wave` (hero) and `mascot-peek` (footer paw). No parallax,
no scroll-linked transforms, no retained `transform` on any section wrapper
(`tests/fixed-positioning-guard.test.ts`).

## 14. Acceptance criteria

- [ ] Hero shows copy + three real app tiles at `lg` and `xl`
- [ ] Mascot head crosses the card edge at `lg+`, size unchanged on scroll
- [ ] Category rows: zero-product groups absent; one feature tile per group
- [ ] 8-col tile alignment holds with 1, 3, 6 and 11 children
- [ ] Promo hidden until configured; no invented campaign
- [ ] Footer dark-brown in both themes, links ≥ 44px, contrast gate green
- [ ] No fifth navbar link; drawer carries navigation below `xl`
- [ ] No `bg-white`, no new hex, no neutral `shadow-lg`, no animation dependency
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit` green; `e2e/contrast.spec.ts` in both themes
