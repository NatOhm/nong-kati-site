# NK-00 — Nong Kati Design Foundation

**Status:** Proposal for client review
**Version:** 2.0 (supersedes the shared sections of the v1.0 creative-direction documents)
**Applies to:** `nk-01-mobile-homepage.md`, `nk-02-desktop-homepage.md`
**Authority:** this file is the only place in the v2 spec set where colours, themes, textures,
mascot rules, motion, breakpoints and component inventory are defined. The two layout specs
reference it and must not restate token values.

---

## 1. Purpose and precedence

1. `src/styles/tokens.css` + `docs/design-system.md` are the implementation source of truth.
   This document is a **proposal**; nothing here is real until it lands in those two files
   together, in one commit.
2. Where this document and the v1.0 creative-direction documents disagree, this document wins.
   §12 lists every v1.0 instruction that is withdrawn.
3. Where this document and the shipped code disagree, the code wins and the document is wrong —
   file a correction rather than changing the component to match the paper.
4. No new hex values. Every surface in this spec maps to an existing semantic token, except the
   three new tokens named in §4.

## 2. Constraints (non-negotiable)

| Constraint | Where it lives |
|---|---|
| Gates: `npm test`, `npm run lint`, `npx tsc --noEmit` | repo root of the app |
| No `bg-white` anywhere in `src` | `tests/design-token-gates.test.ts` (R5), `e2e/no-hardcoded-white.spec.ts` |
| Contrast in **both** themes on every page | `e2e/contrast.spec.ts`, `tests/payment-contrast-gate.test.ts` |
| 44×44 minimum touch targets | `e2e/touch-targets.spec.ts` |
| No retained `transform` / `will-change` on route or section wrappers | `tests/fixed-positioning-guard.test.ts` (G1–G4) |
| One route-entry animation owner: `.page-enter` in `globals.css` | `globals.css`; never re-add an `animate-page-enter` utility |
| Reduced motion honoured site-wide | `globals.css` §`prefers-reduced-motion` + `data-motion` toggle |
| No new animation libraries | zero GSAP/Lottie/Rive/Three/Framer in `package.json` |

**Phase 0 of this spec set changes documentation only.** No token, component, route or test is
touched until the documents are approved.

## 3. Colour system — by role, not by hex

The v1.0 documents proposed a six-colour palette. Five of the six already exist in
`tokens.css`; only Hamster Orange `#F6A84E` was new, and it is not needed — `peach-500`
(`#f97316`) is the shipped brand fill and the runtime accent ramp (`--accent-ramp-*`) is what
lets the admin recolour the site. **The palette stands as shipped.**

### 3.1 Semantic surface map (light + dark)

This table is the contract. Any new surface in either layout spec must appear here first.

| Surface | Light | Dark | Notes |
|---|---|---|---|
| Page base | `bg-surface-base` = `#fff7ed` | `bg-surface-base` = `#3a2a18` | `--bg-base` |
| Card / product surface | `bg-surface` = `#fafaf9` | `bg-surface` = `#46321c` | **replaces every "white card"** |
| Elevated (popovers, menus) | `bg-surface-elevated` = `#fff` | `bg-surface-elevated` = `clay-800` | |
| Sunken (search, chips) | `bg-surface-sunken` = `oat #fef3c7` | `bg-surface-sunken` = `#2c1e12` | |
| Navbar | `bg-surface-nav` = `#fdebd3` | `bg-surface-nav` = `#46321c` | visibly darker than base |
| Category panel | `bg-clay-100` = `#fdf8ee` | `bg-clay-950` = `#3a2a18` | shipped |
| Group header pill | underlay `bg-clay-300` + peach/fawn gradient | `bg-clay-500` + caramel gradient | shipped |
| App tile | `bg-clay-950` — a deliberately dark card in both themes | `bg-clay-950` + `bg-clay-900` artwork well | shipped |
| Hero band | `bg-peach-100` + vertical gradient to `bg-surface` | `bg-clay-900` gradient to `bg-surface` | shipped |
| Hero notice card | `bg-peach-50`, `border-dashed border-peach-300` | `bg-peach-900/20`, `dark:border-peach-700/60` | shipped |
| Polka texture | `--texture-polka-light` | `--texture-polka-dark` | **new token**, §4 |
| Promo banner | `bg-coral-100` underlay + `bg-blush` wash; text `text-fg` (clay-900 on coral-100 = 8.56:1) | `bg-clay-950` underlay + `bg-clay-900` wash; text `text-clay-100` (13.0:1) | new surface |
| FAQ panel | `bg-surface` (`clay-card`) | `bg-surface` | shipped |
| Trust badge card | `clay-card` (surface) | `clay-card` | shipped |
| Footer | `bg-footer` = `clay-950` `#3a2a18` | `bg-footer` = `surface-sunken` `#2c1e12` | **new token**, §4 |
| Primary CTA | `bg-peach-500` / `bg-surface-brand` | `bg-peach-400` | see §3.2 |
| Focus ring | `shadow-focus-ring` | dark variant in tokens | shipped |

### 3.2 Text on brand fills

Measured on the shipped tokens:

| Pair | Ratio | Verdict |
|---|---|---|
| white on `peach-500` (`#f97316`) | **2.80:1** | fails AA for body text |
| `clay-900` (`#4e3820`) on `peach-500` | **3.92:1** | fails AA for body text; passes the 3:1 large-text bar only |
| `clay-950` (`#3a2a18`) on `peach-500` | **4.91:1** | passes AA for body text |
| `clay-950` on `peach-400` (`#fb923c`) | **6.09:1** | passes AA |
| `peach-800` on `peach-50` | **6.88:1** | passes |

Measured with the WCAG relative-luminance formula against the shipped hex values (an earlier draft
of this table carried unverified figures — 5.35:1 for `clay-900` on `peach-500` was wrong, and a
rule built on it would have shipped 14px text at 3.92:1).

**Rule:** every *new* orange fill (`peach-400` / `peach-500`) carries `text-clay-950` — the only
clay step that clears AA for body text on that fill. `text-clay-900` is allowed on an orange fill
only at ≥24px (or ≥18.66px bold), i.e. as a large bold label, never on 12–14px copy. The shipped
hero CTA uses white-on-`peach-500` at 2.80:1 and is **out of scope for this spec set** — changing
it is a separate decision with its own gate run.

### 3.3 Copy hierarchy tokens

`fg` (primary) → `fg-secondary` → `fg-muted` (clay-700 light / clay-400 dark, both ≥ 4.5:1) →
`fg-placeholder`. Never express hierarchy by lowering contrast below those steps; use size and
weight instead.

## 4. New tokens (documented here, implemented in a later engineering commit)

Exactly three new token families. All three need `docs/design-system.md` **and**
`src/styles/tokens.css` amended in the same commit, per the standing rule.

```css
/* 1. Polka texture — colour + geometry, never a colour alone */
:root {
  /* The stop is a RADIUS: 2px → 4px dots on a 12px pitch, ≈8.7% coverage. */
  --texture-dot: rgba(253, 186, 116, 0.32);   /* peach-300 @ 32% → 1.16:1 on peach-50 */
  --texture-dot-size: 2px;
  --texture-dot-gap: 12px;
}
[data-theme='dark'] {
  --texture-dot: rgba(251, 146, 60, 0.08);    /* peach-400 @ 8% → 1.16:1 on clay-950 */
}

/* 2. Footer surface — the warm dark-brown finish */
:root {
  --bg-footer: var(--clay-950);
  --fg-footer: var(--clay-100);
  --fg-footer-muted: var(--clay-300);
  --border-footer: var(--clay-800);
}
[data-theme='dark'] {
  --bg-footer: var(--bg-sunken);
  --fg-footer: var(--clay-100);
  --fg-footer-muted: var(--clay-400);
  --border-footer: var(--clay-700);
}
```

Tailwind bindings (proposed): `bg-footer`, `text-footer`, `text-footer-muted`, `border-footer`.
Contrast budget for the footer: `clay-100` on `clay-950` = **13.0:1**, `clay-300` on `clay-950` =
**10.2:1** — both pass for text and links in the light theme. In the dark theme the footer is
`#2c1e12`, where `clay-100` is **15.2:1** and `clay-400` (the muted step) is **9.5:1**. (The
11.4:1 that an earlier draft quoted was `clay-100` on the dark *card* surface `#46321c`, not on the
sunken footer — the footer is darker, so every pairing in it is stronger, not weaker.)

**Geometry is identical in both themes; only `--texture-dot` changes.** That is what “colour *and*
geometry” means here: both are specified, not both varied. Visual reference:
`docs/spec/polka-swatch.html`.

**How the alpha was chosen:** not by eye — by a composite-ratio target of **1.14–1.20:1** against
the theme's base, computed with the WCAG formula over the real underlays. The first placeholder
(`peach-300` at 22%) measured **1.10:1** on `peach-50`: printer grain rather than a brand texture,
and only ~10 points of alpha away from reading as dirt, so it has to be measured rather than
nudged.

| Theme | Underlay | Composite dot | Ratio |
|---|---|---|---|
| light | `peach-50` `#fff7ed` (page base) | `#fee3c6` | **1.16** |
| light | `peach-100` `#ffedd5` (hero card) | `#fedcb6` | **1.13** |
| light | `#fafaf9` (surface / FAQ) | `#fbd1ce` | **1.15** |
| light | `coral-100` `#fadcde` (promo) | `#fbd1bc` | **1.09** |
| dark | `clay-950` `#3a2a18` (page base) | `#49321b` | **1.16** |
| dark | `clay-900` `#4e3820` (hero card) | `#5c3f22` | **1.14** |
| dark | `#2c1e12` (sunken / footer) | `#3d2715` | **1.16** |

The promo band is the weakest pair at 1.09 by construction — its underlay is already a tint, so a
dot on top of it has less room. That is acceptable because the promo also carries a `bg-blush` wash
and a 240px mascot; the texture there is the third-most prominent thing, not the only thing.

**Not a new token:** the polka dot never introduces a hue. If the client supplies the logo
source, the pattern's density and gap are re-derived from it, and `--texture-dot` is re-solved for
the same 1.14–1.20 composite band — those three variables are the whole diff. Nobody needs to wait
for the logo: this swatch is shippable on its own and a later swap is a tokens-only commit.

## 5. Typography

| Role | Class | Family | Size / line-height |
|---|---|---|---|
| Page h1 (hero) | `text-xl sm:text-2xl` | `font-display` (Mitr) | 20/28 → 24/31 |
| Desktop h1 | `text-2xl md:text-3xl xl:text-4xl` | `font-display` | 24 → 30 → 36 (36 only from `xl`) |
| Section h2 | `text-lg` (`md:text-xl`) | `font-ui` semibold/bold | 18 → 20 |
| Card title | `text-sm font-semibold` | `font-ui` | 14 |
| Body | `text-sm` / `text-base` | `font-ui` (Noto Sans Thai Looped) | 14 / 16 |
| Helper, meta, counts | `text-xs` | `font-ui` | 12 |
| Bottom-nav label | `text-[10px]` | `font-ui` medium | 10 |

Letter-spacing comes from the `fontSize` pairs in `tailwind.config.ts` (`lg` and up already
tighten). No new display sizes above `6xl`; the desktop hero headline is the page's only `4xl`.

## 6. Spacing, containers, radius, elevation

**Containers (measured from the code):**

| Layer | Width |
|---|---|
| Chrome wrapper (`FacebookLayout`) | `max-w-[1440px]` — caps the **content column**, not the viewport; there is no desktop sidebar under it (`nk-02` §2) |
| Content (`max-w-content`, `--content-max-width`) | 1280px (`Footer` only; page sections use the wrapper) |
| Hero | `max-w-5xl` 1024px — unchanged; widens to `2xl:max-w-6xl` only (see `nk-02` §2) |
| FAQ / narrow prose | `max-w-2xl` 672px; `max-w-prose` 680px |
| Trust badges | `max-w-4xl` 896px |
| Section gutter | `px-4` (16px) phone, `md:px-8` (32px) and up |

**Vertical rhythm:** section padding `py-4` (compact phone bands), `py-6` (default), `py-8`
(trust/FAQ), `py-16` (footer). Desktop specs may use `md:py-10` / `md:py-12` on the promo band
only — no other section grows.

**Radius — the compiled scale in `tailwind.config.ts`** (this is what ships; `tokens.css` carries
an older `--radius-*` set that the utilities do not use):

| Utility | px | Use |
|---|---|---|
| `rounded-sm` | 10 | chips, pills inside cards |
| `rounded-md` | 16 | inputs, small media |
| `rounded-lg` | 22 | buttons, nav items |
| `rounded-xl` | 28 | cards, tiles |
| `rounded-2xl` | 32 | panels, drawers, hero card |
| `rounded-3xl` | 36 | promo banner only |
| `rounded-full` | 9999 | CTAs, count pills, mascot halos |

**Elevation — three levels plus two named exceptions** (from `tokens.css`):

1. `shadow-clay-xs` — rows, chips, resting tiles.
2. `shadow-clay-sm` — cards, product tiles, inputs, sticky bars.
3. `shadow-clay-lg` — drawers, dialogs, popovers **only**.

Exceptions, both already shipped and both kept as-is:

- `shadow-clay` is the **panel / app-tile resting level** — the categories panel and `AppTile` use
  it today (`page.tsx`, `AppTile.tsx`). It is not a brand accent and must not spread to any other
  surface; the two layout specs use it on those two elements and nowhere else.
- `shadow-clay-brand` is the brand accent for the hero CTA, the card buy button and the launcher.

Tailwind's neutral `shadow-lg` / `shadow-xl` are off-palette and forbidden. (`AppTile`'s
`hover:shadow-clay-lg` is a shipped hover state, not a modal surface.)

## 7. Background and texture system

Three treatments, all CSS-only, all layered **over a declared `background-color`** — the contrast
scanner follows the `background-color` chain and will otherwise fall through to the page base.

### 7.1 Polka dot (the brand texture)

```css
/* Texture only — never a background-color. The underlay is always a Tailwind
   bg-* class on the same element (bg-peach-50, bg-coral-100, bg-surface), because
   the contrast scanner follows the background-color chain and a utility that
   paints its own cream would silently override the promo band's underlay. */
.polka {
  background-image: radial-gradient(circle, var(--texture-dot) var(--texture-dot-size),
                                    transparent calc(var(--texture-dot-size) + 0.5px));
  background-size: var(--texture-dot-gap) var(--texture-dot-gap);
}
```

| Variant | Gap | Dot radius | Coverage | Where |
|---|---|---|---|---|
| `.polka-sm` | 12px | 2px (4px dots) | 8.7% | hero card, promo banner, mascot halos |
| `.polka-lg` | 28px | 4.5px (9px dots) | 8.1% | section washes, outer decorative circles |

The two variants keep the same **coverage**, not the same dot size — a 28px pitch with a 2px
radius would read as nearly empty, which is why the radius scales with the gap.

**At halo size.** A 96px halo with the `sm` pitch holds only ~64 dots. If that reads as noise
rather than texture, add `.polka-xs` (8px gap, 1.5px radius, same 11% coverage) for halo call sites
only — do not darken the colour, which would overpower the hero it sits behind.

Rules: never the sole background of a text-carrying surface (always on top of a token colour);
never animated; never `pointer-events`-interactive (`aria-hidden` + `pointer-events-none`);
`sm` variant only above the fold. Optional single `polka-mask.svg` for blob shapes — one file,
one request, only if the client supplies the logo source. Today the pattern exists **only in the
logo**, not in the code, so the values above are *derived from* it rather than traced from it.

**Unblocked by default.** `docs/spec/polka-swatch.html` is the reviewable swatch: the texture at
both pitches, laid over every real underlay in both themes, with the magnified geometry and the
halo sizes. Phase 2 can ship against it; if the logo file ever arrives, only `--texture-dot`
(and possibly the two geometry values) change.

### 7.2 Organic shapes

Absolutely positioned, `aria-hidden`, `pointer-events-none` divs with `rounded-[40%_60%_55%_45%]`
style blended radii, filled with `bg-peach-200/40` (light) or `bg-clay-800/30` (dark). Maximum
two per section. They add **zero height** — they overlay existing padding.

### 7.3 Ambient glow

One `radial-gradient` behind the mascot only, using the existing brand glow language
(`rgba(249,115,22,0.18)` light / `rgba(217,127,62,0.16)` dark). Not a shadow replacement.

## 8. Mascot system

The hamster is the brand. It is **not** replaced, redrawn or AI-generated; every pose is built
from the existing character's face, chubby proportions, cream-and-orange fill and outline weight.

| Pose | Status | Used in |
|---|---|---|
| `HamsterFace` | **exists** | logo, how-to-buy step 1, search focus peek |
| `HamsterMascot` | **exists** | general |
| `HamsterWorried` | **exists** | how-to-buy step 2 (slip being checked) |
| `HamsterCelebrating` | **exists** | how-to-buy step 3, purchase success |
| `HamsterSleeping` | **exists** | empty states today; the FAQ decoration is new work (`nk-01` §9) |
| `HamsterWheelSpinner` | **exists** | loading |
| **Shopping hamster** | **to build** | promo banner, cart empty state |
| **Movie hamster** | **to build** | category group header for streaming groups, promo banner alt |
| **Curious hamster** | **to build** | category discovery, FAQ secondary |

Sizes: `56 / 84 / 120 / 140 / 160 px` at `xs / sm / md / lg / xl`. Line weights and fill scale
with the SVG, not with CSS.

**Known limitation to design around:** `SiteMascot` renders a single admin-uploaded image
(`MascotProvider` / `useMascotUrl`) with inline `width`/`height` that beat Tailwind unless
overridden with `!`. When an upload is set, pose swapping is impossible — the same image is used
everywhere. Therefore **no layout may depend on a pose being different in two places**; poses are
an enhancement on the built-in illustration, never a load-bearing element.

Accessibility: decorative mascots are `aria-hidden`; a mascot that conveys information gets
`alt`/`aria-label`; mascots never sit on top of a control.

## 9. Motion system

CSS only. No library, now or later.

| Token / class | Duration | Use |
|---|---|---|
| `duration-instant` | 80ms | press feedback |
| `duration-fast` | 120ms | colour, hover fill |
| `duration-default` | 180ms | transforms, lifts |
| `duration-moderate` | 240ms | accordion, reveal |
| `duration-slow` | 300ms | panel expand |
| `.page-enter` | `--animate-page-duration` (240ms default) | **the only route-entry animation** |
| `ScrollReveal` | `duration-interactive` (180ms), `threshold: 0.1` | section entrance, no retained transform afterwards |

| Existing keyframe class | Motion |
|---|---|
| `.mascot-wave` | greeting wave, loop |
| `.mascot-sniff` | browsing |
| `.mascot-beg` | waiting for confirmation |
| `.mascot-celebrate` | success |
| `.mascot-peek` | footer paw / curiosity |
| `grass-sway` | background scene |

Allowed per section: **one** entrance (reveal or keyframe) + **one** hover response. Forbidden:
parallax, scroll-linked transforms, autoplaying carousels beyond the admin-managed hero carousel,
anything that keeps a `transform` after it ends, animating more than one element at a time at rest.

Reduced motion is handled site-wide by `globals.css` (`prefers-reduced-motion` plus the
`data-motion` toggle). New CSS must not use inline `animation` styles, which that rule cannot
override.

## 10. Breakpoints and responsive rules

| Name | Width | Role |
|---|---|---|
| `xs` | 320px | smallest supported phone |
| `sm` | 480px | large phone / small tablet portrait |
| `md` | 768px | tablet — first two-column moment |
| `lg` | 1024px | desktop — bottom nav disappears, theme/motion toggles appear |
| `xl` | 1280px | wide desktop — navbar text links appear |
| `2xl` | 1536px | capped by containers, no new layout |

The v1.0 proposal's `375` and `430` breakpoints **do not exist and will not be added.**

Viewport reference for every mobile decision: **390 × 844 CSS px**, iPhone-class, with the
sticky navbar (56px `h-14` + 1px border = **57px** rendered) and the fixed bottom nav (63px +
safe-area inset) both present. Acceptance is by screenshot, not by arithmetic.

## 11. Component inventory

**Exists — extend, do not fork:** `FacebookNavbar`, `FacebookSidebar`, `MobileBottomNav`,
`Footer`, `HeroCarousel`, `AppTile`, `CategoryIcon`, `ProductCard`, `ProductGrid`, `ProductCardSkeleton`,
`TrustBadges`, `FAQAccordion`, `StatsCounter`, `ScrollReveal`, `ScrollToTop`, `LINEChatButton`,
`AnnouncementBar`, `CookieConsentBanner`,
`PawDivider`, `Button`, `Badge`, `Dialog`, `Drawer`, `Toast`, `SiteMascot`, `ClayIcons`.

**New (small, presentational only):** `PolkaBackdrop` (a div wrapper, no state),
`PromoBanner` (server-rendered, settings-driven like `TrustBadges`), `MascotHalo` (decorative
div). Nothing else. No new provider, no new client boundary unless required for interactivity.

## 12. Withdrawn from v1.0

| v1.0 instruction | Status |
|---|---|
| GSAP, Lottie/Rive, Three.js | **withdrawn** — CSS only |
| `#F6A84E`, `#F9C2C4`, `#FFE0B9`, `#E9858D`, `#30241E` as new tokens | **withdrawn** — existing ramps |
| "white product surfaces" | **withdrawn** — `bg-surface` |
| `/promotions` route, 5-item bottom nav | **withdrawn** — 4 live items, promo codes in the notifications bell |
| fixed category trio (Streaming / Productivity / Chinese Series) | **withdrawn** — DB groups |
| breakpoints 375 / 430 | **withdrawn** |
| parallax on promo art | **withdrawn** |
| full-width illustrated hero band on phones | **withdrawn** — see `nk-01` §4 |

## 13. Data honesty

Copy, prices, durations, stock, discounts and recommendations come from the database. The spec
never invents a product, a price or a campaign; the promo banner renders only when an admin
configures one, exactly like `HeroCarousel` (hidden until configured) and `TrustBadges`
(hidden when disabled).

## 14. Amendment checklist (later engineering commit, not now)

- [ ] `src/styles/tokens.css` — `--texture-dot*`, `--bg-footer`, `--fg-footer*`, `--border-footer`
- [ ] `docs/design-system.md` — same four families in **§2** (Semantic tokens), the
      `shadow-clay` panel/tile exception in **§4**, and one entry in **§8** (ประวัติการแก้). The file
      has eight sections; an earlier draft of this checklist said "§12 tokens + §13 Tailwind mirror",
      which does not exist.
- [ ] `tailwind.config.ts` — `footer` colour + `footer-muted` aliases
- [ ] `e2e/contrast.spec.ts` re-run in both themes after the footer lands
- [ ] No `bg-white`, no neutral `shadow-lg`, no new dependency
