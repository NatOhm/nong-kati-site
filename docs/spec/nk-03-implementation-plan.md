# NK-03 — Implementation Plan

**Status:** Proposal for client review — **no code is changed by this document**
**Version:** 1.0
**Depends on:** `nk-00-foundation.md`, `nk-01-mobile-homepage.md`, `nk-02-desktop-homepage.md`
**Scope:** turns the three approved specs into seven merge-sized phases, each with the files it
touches, its order, the gates that must be green, and the screenshots that prove it.

---

## 1. Client inputs, and which phase each one blocks

Two of these are hard blockers, four are sign-offs. Nothing below ships a placeholder for a
decision that belongs to the client.

| # | Input needed | Blocks | Can the phase start without it? |
|---|---|---|---|
| C1 | **Polka-dot source** (the logo file, SVG or vector) — or sign-off on the derived swatch | nothing; it is a later refinement | **No longer.** The swatch is concrete and measured: peach-300 @ 32% (light) / peach-400 @ 8% (dark), 2px radius on a 12px pitch, 1.09–1.16:1 on the real underlays — `nk-00` §7.1, previewed in `docs/spec/polka-swatch.html`. Phase 2 ships it as-is; a logo later re-solves `--texture-dot` (and maybe the two geometry values) in one tokens-only commit. |
| C2 | **How-to-buy descriptions may be hidden below `sm`** (`nk-01` §6.2) | Phase 4 merge | **Yes, code-wise.** The strip is real work either way, but hiding copy is a content decision — do not merge Phase 4 without it. |
| C3 | **Promo banner copy**: headline, one supporting line, CTA target, and whether a campaign exists at all | Phase 7 activation | **Yes.** The component and its settings panel ship disabled-by-default and render nothing; `enabled: false` is the default, so no fake campaign can appear. |
| C4 | **Mascot pose sign-off** (Shopping / Movie / Curious) — they must be drawn from the existing character | Phase 6 | **No.** Drawing three poses without approval wastes work; the character sheet is the whole brand rule (`nk-00` §8). Phase 7 needs Shopping/Movie, so 6 gates 7. |
| C5 | **Zero-product / empty-catalogue wording** — confirm that hiding the category section entirely is acceptable when the catalogue has no products | Phase 5 | **Yes.** The outage alert already covers a real outage; this only decides the genuinely-empty case. |
| C6 | **2-line headline cap** — the hero h1 must be short enough to fit two lines at 390px | Phase 4's final screenshot | **Yes.** The clamp is CSS; if the copy cannot be shortened the band grows and the first-viewport contract fails. |
| C7 | **The announcement strip may yield to the consent strip on a first visit** (`nk-01` §2.3) | Phase 4 | **Yes, a product call.** With it, the first-visit tile row lands at 712px and keeps the 720 target. Without it, 753px — still partially visible, but over target. |

**Only C4 is a true stop.** C1 has a shippable default, C3 ships dark, and C2/C5/C6 are merge-time
sign-offs.

---

## 2. Phase order at a glance

| Phase | Delivers | Primary files | Commit |
|---|---|---|---|
| **1** | Tokens + the two doc mirrors | `src/styles/tokens.css`, `docs/design-system.md`, `tailwind.config.ts` | one commit, atomic |
| **2** | Polka texture + two decorative primitives | `src/app/globals.css`, `PolkaBackdrop.tsx`, `MascotHalo.tsx` | one commit |
| **3** | Warm dark footer + the `lg` drawer defect | `Footer.tsx`, `FacebookSidebar.tsx` | two commits |
| **4** | Hero (both viewports) + how-to-buy strip — the 390×844 contract | `src/app/page.tsx` | one commit |
| **5** | Categories bento (zero-product rule, feature tile) | `src/lib/appGroups.ts`, `AppTile.tsx`, `page.tsx`, new test | one commit |
| **6** | Three mascot poses, FAQ decoration, empty states | `ClayIcons.tsx`, `FAQAccordion.tsx`, `EmptyCart.tsx`, `SearchEmptyState.tsx` | one commit |
| **7** | Promo banner + its settings surface | `lib/promoBanner.ts`, admin route, editor page, `PromoBanner.tsx`, `page.tsx`, gate allowlist, new test | one commit |

Order is a dependency chain, not a preference:

- **1 → everything.** `bg-footer` / `text-footer` / `border-footer` must exist in
  `tailwind.config.ts` before any component names them (§4, trap T1).
- **2 → 4 and 7.** Both need the texture utility.
- **4 → 5.** Both edit `src/app/page.tsx` and both change the first-viewport budget; the hero cuts
  are what make the bento's first row visible.
- **6 → 7.** The promo's art is the Shopping/Movie pose.
- **3 is independent** of 4–7 and can be merged at any point after 1.

---

## 3. Phases in detail

### Phase 1 — Tokens and their documentation

**Goal:** the three new token families exist and are documented, with no visible change yet.

| File | Change |
|---|---|
| `src/styles/tokens.css` | `--texture-dot`, `--texture-dot-size`, `--texture-dot-gap`; `--bg-footer`, `--fg-footer`, `--fg-footer-muted`, `--border-footer` — light **and** `[data-theme='dark']` |
| `docs/design-system.md` | **§2** (Semantic tokens): the four footer rows + the texture vars. **§4**: the elevation paragraph currently permits only `shadow-clay-brand` / `shadow-clay-press` beyond the three levels, but the categories panel and `AppTile` ship `shadow-clay` — add the panel/tile exception from `nk-00` §6. **§8** (ประวัติการแก้): one entry |
| `tailwind.config.ts` | `colors.footer = { DEFAULT: 'var(--bg-footer)', muted: 'var(--fg-footer-muted)' }`, plus the `border-footer` binding |

`docs/design-system.md` is the standing rule's other half: **the token file and this doc move in the
same commit**, or the rule is broken.

**Gates:** `npm test` (CU1/CU2, R1–R6, G1–G3, client-docs), `npm run lint`, `npm run typecheck`.
**Screenshot:** none — nothing renders differently. A screenshot here would prove nothing.

> Do **not** add `bg-footer` to `Footer.tsx` in this commit. CU1 compiles every colour utility under
> `src/`; a class whose config entry has not landed yet fails the gate. Config first, use second —
> which is why both live in Phase 1 and the use lives in Phase 3.

### Phase 2 — Polka texture and two primitives

**Goal:** the brand texture exists as one reusable utility, not as repeated inline CSS.

| File | Change |
|---|---|
| `src/app/globals.css` | `.polka` (background-image + size only), `.polka-sm` (12px gap / 2px radius), `.polka-lg` (28px / 4.5px) |
| `src/components/ui/PolkaBackdrop.tsx` *(new)* | `div` wrapper: `aria-hidden`, `pointer-events-none`, `polka` + variant prop. No state, no client boundary |
| `src/components/ui/MascotHalo.tsx` *(new)* | the round `polka-sm` halo behind a mascot, absolutely positioned |

`.polka` sets **only** `background-image`, `background-size` and `background-position`. It must not
set `background-color`: the contrast scanner follows the `background-color` chain, and a utility that
paints its own cream would silently override the coral promo underlay. The underlay is always a
Tailwind `bg-*` on the same element (`bg-coral-100`, `bg-peach-50`, `bg-surface`).

**Gates:** `npm test`, `npm run lint`, `npm run typecheck`.
**Screenshot:** one 390×844 capture to confirm dot density and that nothing has moved. No e2e: no
component consumes the utility yet, so there is no behaviour to regress.

### Phase 3 — Warm dark footer, and the `lg` drawer defect

**Goal:** the approved warm dark-brown finish, plus the navigation bug the desktop spec depends on.

| File | Change |
|---|---|
| `src/components/layout/Footer.tsx` | `bg-surface-base` → `bg-footer`; links `text-footer-muted` → hover `text-footer`; hairline `border-footer`; keep every `min-h-[44px]` |
| `src/components/layout/FacebookSidebar.tsx` | drop `lg:hidden` from the backdrop, the panel and the close bar — the hamburger is `xl:hidden`, so at 1024–1279px it is currently a dead button (`nk-02` §3) |

Two commits: the footer is a visual change, the drawer is a behaviour fix. Neither touches the other.

**Gates:** `npm test` (R5 white, CU1), `npm run lint`, `npm run typecheck`, then
`npm run test:e2e -- e2e/contrast.spec.ts` **in both themes**, `e2e/touch-targets.spec.ts`,
`e2e/no-hardcoded-white.spec.ts`.
**Screenshots:** footer at 390 and 1280, light + dark.
**Extra check (not automated):** at 1024px the hamburger opens the drawer.

### Phase 4 — Hero and how-to-buy: the 390×844 contract

**Goal:** the first-viewport promise actually holds, and the desktop hero gains its first signature
moment. One file, because both are the same section.

| File | Change |
|---|---|
| `src/app/page.tsx` | h1 clamped to 2 lines; polka halo + ambient glow + two floating chips layered at **zero height**; `lg:-mt-14` so the head breaks the card edge (desktop); mascot 120/140/160 at md/lg/xl with the `!h-* !w-*` overrides `SiteMascot` requires; how-to-buy becomes a strip **below `sm`** and keeps the three cards from `sm` up |
| `src/components/pdpa/CookieConsentBanner.tsx` | below `md`: one row (copy + three 44px controls), `px-3 py-2`, ≤ 61px. Desktop `fixed bottom-0` bar unchanged, still zero layout height |
| `src/components/home/AnnouncementBar.tsx` | render nothing while consent is pending (`getStoredConsent()` at mount), reappear on the existing `nk:consent` event. No new provider |

No new component, no new client boundary.

**Gates:** `npm test`, `npm run lint`, `npm run typecheck`,
`npm run test:e2e -- e2e/responsive-a11y.spec.ts e2e/landmarks.spec.ts e2e/contrast.spec.ts e2e/touch-targets.spec.ts`,
plus a new `e2e/first-visit.spec.ts` (clean `localStorage` → strip ≤ 61px, announcement suppressed,
three controls ≥ 44×44). `e2e/*.spec.ts` is outside the G1 inventory by design, so it needs no
`quality-gates.md` row.
**Screenshots:** 390×844 light **and** dark (the deliverable the whole spec set exists for), plus one
with `localStorage.nk_cookie_consent` cleared — the true first-visit state, which is what the
committed baseline captured — plus 1280 to confirm the two-column hero and the head breaking the card.

**Acceptance measurement** — a screenshot alone cannot prove a pixel budget. In the console, record
`getBoundingClientRect().top` for the first category tile row and the bottom nav, and write both
numbers into the commit message:

- first tile row ≤ **720px** in **both** visitor states
- model expectation: **692px** returning, **712px** first visit
- consent strip ≤ **61px** on a first visit, announcement suppressed while it shows
- bottom nav top edge: **781px**

If the row lands above 720, shorten the hero — never the categories.

### Phase 5 — Categories bento

**Goal:** the grid follows the catalogue instead of eight identical rows.

| File | Change |
|---|---|
| `src/lib/appGroups.ts` | zero-product filtering (group, and group whose children are all zero) + `featureAppGroup()` (highest `productCount`, first wins ties) — pure functions, no Prisma import |
| `src/components/product/AppTile.tsx` | a `span`/`feature` prop (`col-span-2`); no new size variants |
| `src/app/page.tsx` | drop filtered groups, pass the span, omit the section when nothing has products |
| `tests/app-groups-bento.test.ts` *(new)* | filter + feature-pick cases (1, 3, 6, 11 children) |
| `docs/quality-gates.md` | **required**: an overview-table row **and** a section heading for the new test file, or G1 goes red |

**Gates:** `npm test` (G1/G2 included), `npm run lint`, `npm run typecheck`,
`npm run test:e2e -- e2e/responsive-a11y.spec.ts` (no horizontal scroll at 320px).
**Screenshots:** 768, 1024, 1280 with a one-child group and a group with more than eight children —
those are the two shapes that break an 8-column grid.

### Phase 6 — Mascot poses, FAQ decoration, empty states

**Goal:** the character work, all of it enhancement-only (`nk-00` §8: no layout may depend on a pose
differing between two places).

| File | Change |
|---|---|
| `src/components/ui/ClayIcons.tsx` | `HamsterShopping`, `HamsterMovie`, `HamsterCurious` — same fill, outline weight and proportions |
| `src/components/home/FAQAccordion.tsx` | sleeping hamster as an `aria-hidden` absolute decoration (desktop two-column layout from `nk-02` §9); must not push the first question down |
| `src/components/cart/EmptyCart.tsx`, `src/components/search/SearchEmptyState.tsx` | Curious pose in place of the current default |

**Gates:** `npm test` — specifically `tests/fixed-positioning-guard.test.ts` (G1–G4): the decoration
must be a sibling, never a wrapper that retains a transform; plus `e2e/landmarks.spec.ts`,
`e2e/contrast.spec.ts`, `e2e/touch-targets.spec.ts`.
**Screenshots:** FAQ at 1280 and 390; cart-empty at 390.

### Phase 7 — Promo banner and its settings surface

**Goal:** the third signature moment, admin-driven, dark until configured.

| File | Change |
|---|---|
| `src/lib/promoBanner.ts` *(new)* | `parsePromoBanner` / `normalizePromoBannerBody` / `DEFAULT` with `enabled: false` — mirrors `src/lib/trustBadges.ts` exactly |
| `src/lib/data.ts` | `getPromoBannerSettings()` (SiteSetting key `promoBanner`) |
| `src/app/api/v1/admin/settings/promo-banner/route.ts` *(new)* | GET/PUT with the admin guard, mirroring `.../settings/trust-badges/route.ts` |
| `src/app/management/promo-banner/page.tsx` *(new)* | the editor, mirroring `/management/trust-badges` |
| `src/components/home/PromoBanner.tsx` *(new)* | server component; renders `null` unless `enabled` and a headline exist |
| `src/app/page.tsx` | mount between featured and trust |
| `tests/promo-banner-settings.test.ts` *(new)* + `docs/quality-gates.md` | parse/normalize cases; **G1 needs the doc row and heading** |
| `tests/design-token-gates.test.ts` | see T2 — either one reviewed allowlist row, or change the underlay |

**Gates:** `npm test`, `npm run lint`, `npm run typecheck`,
`npm run test:e2e -- e2e/contrast.spec.ts e2e/no-hardcoded-white.spec.ts e2e/touch-targets.spec.ts`.
**Screenshots:** 390 and 1280, light + dark, with a campaign configured — and one capture with it
disabled to prove the section is gone rather than empty.

---

## 4. Ordering traps found while planning (do not rediscover these)

**T1 — CU1 fails if a colour class arrives before its config entry.**
`tests/colour-utilities-resolve.test.ts` compiles every colour utility in `src/` and fails on any
that emits no CSS. `bg-footer` in `Footer.tsx` without the `tailwind.config.ts` entry is a red gate,
so Phase 1 must land first.

**T2 — the promo's `bg-coral-100` trips R2.**
`tests/design-token-gates.test.ts` R2: a coral tint fill must pair with `text-fg-error` on the same
source line, because coral reads as an error surface. A promo band is not an error. Two honest
options: add one allowlist row (the pattern already used for the `TrustBadges` icon stroke) with a
written reason, or use `bg-blush-50` as the underlay, which the R2 regex does not read as coral.
Prefer the allowlist — it keeps the approved colour and documents the exception.

**T3 — two new test files need two doc entries.**
G1 requires an overview-table row *and* a section heading in `docs/quality-gates.md`; a mention in
prose does not count. G2 fails if a documented file is missing. Phases 5 and 7 each add one.

**T4 — `docs/design-system.md` has eight sections, not twelve.**
`nk-00` §14 used to say "§12 tokens + §13 Tailwind mirror"; the real targets are **§2** (Semantic
tokens), **§4** (elevation exception) and **§8** (history). Corrected in `nk-00`; the plan follows
the file, not the old reference.

**T5 — `SiteMascot` pins inline `width`/`height`.**
Every new size needs the `!h-* !w-*` override the phone hero already uses, or the mascot renders at
its own size regardless of the class.

**T6 — `shadow-clay` is a shipped exception, not a violation.**
The categories panel and `AppTile` use it. Phase 1 records that in `design-system.md`; do not
"correct" the components to match the three-level table.

**T7 — nothing may retain a transform.**
`tests/fixed-positioning-guard.test.ts` (G1–G4): animating wrapper elements is what once pinned the
quick-view modal and the phone buy bar to the wrong box. Halo, glow and chips are siblings of the
content, never its parent.

**T8 — `npm run secret:scan` exits 2 locally.**
gitleaks is not vendored; that exit code is "not found", not a leak. CI fetches the pinned binary.
Do not report it as a failure in any phase.

---

## 5. Gate matrix

| Phase | `npm test` | lint | typecheck | Playwright | Screenshot |
|---|---|---|---|---|---|
| 1 | ✅ required | ✅ | ✅ | — | none (no visual change) |
| 2 | ✅ | ✅ | ✅ | — | 390 (dot density only) |
| 3 | ✅ | ✅ | ✅ | contrast (both themes), touch-targets, no-hardcoded-white | footer 390 + 1280, both themes |
| 4 | ✅ | ✅ | ✅ | responsive-a11y, landmarks, contrast, touch-targets | **390×844 light + dark**, 1280 |
| 5 | ✅ (+ G1/G2 for the new test) | ✅ | ✅ | responsive-a11y | 768 / 1024 / 1280 |
| 6 | ✅ (+ fixed-positioning G1–G4) | ✅ | ✅ | landmarks, contrast, touch-targets | FAQ 1280 + 390, cart-empty 390 |
| 7 | ✅ (+ G1/G2) | ✅ | ✅ | contrast, no-hardcoded-white, touch-targets | 390 + 1280, both themes, enabled + disabled |

`npm run typecheck` is the repo's `tsc --noEmit`. Screenshots use the documented command from the
app directory:

```
npx --no-install playwright screenshot --viewport-size="390,844" \
  --wait-for-timeout=3000 --color-scheme=dark \
  http://localhost:3000 docs/spec/<phase>-<name>.png
```

Phase 4 is the only phase whose screenshot is itself the acceptance criterion. For every other
phase the screenshot is evidence for the reviewer, not a gate.

---

## 6. Not in this plan

Everything `nk-00` §12 withdraws stays withdrawn: no GSAP/Lottie/Rive/Three, no new dependency, no
`/promotions` route, no fifth bottom-nav item, no 375/430 breakpoints, no parallax, no full-width
illustrated phone hero, no new hex. `docs/hostatom-live.md` is untouched, so no `patch-notes` run is
implied by any phase.

One item is deliberately **not scheduled**: the shipped hero CTA's white-on-`peach-500` text
(2.80:1). It is out of scope per `nk-00` §3.2 and needs its own decision and gate run.
