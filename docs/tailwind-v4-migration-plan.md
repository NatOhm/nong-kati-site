# Tailwind 3 → 4 migration plan (2026-10-03)

แผนย้าย `tailwindcss` 3.4.7 → 4.x สำหรับ nong-kati — อ่านก่อนลงมือ
ยังไม่ได้ทำ แผนนี้คือการสำรวจจากของจริงใน repo (นับ class จริง, อ่าน gate จริง,
ยืนยัน breaking change จาก upgrade guide ทางการ) ไม่ใช่การเดาจากความจำ

---

## ข้อสรุปก่อนอ่านต่อ

**ค่าใช้จ่ายของ migration ไม่ได้อยู่ที่ config** — config ซับซ้อนแต่เป็นการ
แปลงรูปแบบ สิ่งที่เสี่ยงจริงมีสองอย่าง:

1. **Phase 0 (ต้องทำก่อนแตะ Tailwind):** การย้ายจะทำให้ **gate a11y สองตัว
   (E2 no-hardcoded-white + E4 contrast) หยุดทำงานเงียบ ๆ** ไม่แดง ไม่เตือน
   แค่ผ่านตลอด ด้วยเหตุผลทางเทคนิคที่อธิบายด้านล่าง
2. **Phase 3:** Tailwind เปลี่ยนค่า default ของ `ring` และ `border` เงียบ ๆ ซึ่ง
   กระทบ ~131 จุดโดยไม่มีอะไรแดง

`braces` ที่ยังแดงอยู่ **ไม่ใช่เหตุผลที่ดีพอ** — มันคือ DoS ใน dev toolchain
ที่ไม่รันบน production (`npm audit --omit=dev` = 0) ดูหัวข้อ Security Audit
ใน `docs/quality-gates.md`

---

## 1. Blast radius (นับจากของจริง)

| สิ่ง | จำนวน | ผลกระทบ |
| --- | --- | --- |
| ไฟล์ `.tsx` ทั้งหมด | 168 | — |
| `bg-peach-*` (ramp ที่ใช้ `<alpha-value>`) | **252** | ต้องเขียนใหม่ทั้ง ramp |
| alpha modifier `/NN` บน token | 199 | เปลี่ยนเป็น `color-mix()` |
| `shadow-clay*` (ชื่อกำหนดเอง) | 149 | ปลอดภัย — ชื่อไม่ชนกับ default ของ v4 |
| `ring-*` | **131** | **default 3px → 1px + สีเปลี่ยนเป็น currentColor** |
| `ease-out` (config override ของเราเอง) | 63 | ต้องยืนยันว่าค่าเดิมยังเหมือนเดิม |
| `dark:` variant | 61 (18 ไฟล์) | `darkMode` เปลี่ยนรูปแบบ + **ลำดับ variant กลับด้าน** |
| `divide-*` | 4 | selector เปลี่ยน (`> :not(:last-child)`) |
| `outline-none` | 6 | ถูก rename เป็น `outline-hidden` |
| `@apply` | 3 | อยู่หมดใน `globals.css` base layer — ง่าย |
| token semantic (`fg-*`/`surface-*`/`line-*`) | 120 ไฟล์ | ชื่อคงเดิมได้ ถ้าประกาศผ่าน `@theme` |

ไฟล์ที่ต้องแก้โดยตรง: `tailwind.config.ts`, `postcss.config.js`,
`src/app/globals.css`, `src/styles/tokens.css`, `package.json`

---

## 2. Phase 0 — ต้องแก้ก่อน: gate a11y จะดับเงียบ

นี่คือข้อค้นพบที่สำคัญที่สุด และเป็นเหตุผลที่ไม่ควรเริ่ม migration ก่อนแก้เรื่องนี้

**สถานะปัจจุบันของ gate ที่อ่านสีจาก browser**

`e2e/helpers.ts` → `parseCssColor` รับได้**แค่** 2 รูปแบบ:

```
#rrggbb   และ   rgb(...) / rgba(...)
```

ทุกอย่างอื่นคืน `null` และ `contrastRatio` ตอบว่า:

```ts
if (!f0 || !b0) return 21;   // 21 = ค่าสูงสุด = "ผ่าน"
```

ตั้งใจทำให้ "ค่าแปลก ๆ ไม่ทำให้ gate แดงมั่ว" — เหตุผลที่ถูกต้อง **ตอนที่ค่าแปลก
เกิดได้ไม่บ่อย** แต่การย้าย Tailwind ทำให้*ทั้งรูปแบบ* เปลี่ยนพร้อมกัน

**ทำไม:** v4 compile opacity modifier เป็น `color-mix()` แทน `rgb(... / alpha)`
และ `<alpha-value>` (รูปแบบที่ ramp `peach` ใช้อยู่) **ไม่มีใน v4**
เมื่อ Chromium คืนค่า `color-mix()` / `color(srgb …)` จาก `getComputedStyle`
`parseCssColor` จะคืน `null` → ratio = 21 → **ผ่าน**

`e2e/no-hardcoded-white.spec.ts` มีปัญหาเดียวกันแต่อีกแบบ:

```ts
const m = /rgba?\(([^)]+)\)/.exec(s.backgroundColor);
```

regex ไม่ match → element ถูกข้าม → **ผ่าน**

**ผลคือ gate ทั้งสองกลายเป็นตรายประทับ** — คืนสี 21 ทุกคู่ ไม่มีอะไรแดง
ไม่มีใครรู้ว่ามันตายไปแล้ว และมันจะตายไป**พร้อมกับ** migration ที่ทำให้สีจริงขยับ

**ต้องทำ (เป็นงานแยกต่างหาก ไม่ต้องรอ migration):**

1. เปลี่ยน `parseCssColor` ให้**ตอบผิดเงียบเป็น error** แทน `return 21`
   หรืออย่างน้อยให้ gate นับ "ค่าที่ parse ไม่ได้" แล้ว **fail เมื่อมันมี**
2. ครอบ `parseCssColor` ให้รู้จัก `oklch()` / `oklab()` / `color(srgb …)` /
   `color-mix()` — หรือวางกลไกให้ browser resolve ค่าให้ก่อนส่งกลับ
3. เพิ่ม regression test: ยิง `contrastRatio` ด้วย `oklch(...)` และ
   `color-mix(...)` แล้ว assert ว่า **ไม่ได้กลับ 21**
4. ทำให้ `no-hardcoded-white` ใช้ทางเดียวกันแทน regex ตัวเอง

เมื่อเสร็จ Phase 0 นี้ gate จะ**แดงขึ้นทันที**ที่ยังไม่ได้ย้าย (ถ้ามีค่าแปลกอยู่
แล้ว) ซึ่งถือว่าเป็นเรื่องดี — มันแปลว่า gate มีชีวิตอยู่จริงแล้ว

---

## 3. Phase 1 — Toolchain

```diff
 // package.json (dependencies)
-"tailwindcss": "3.4.7"
+"tailwindcss": "^4.x"
+"@tailwindcss/postcss": "^4.x"      // v4 ย้าย plugin ออกจากตัว tailwindcss
-"tailwind-merge": "2.3.0"
+"tailwind-merge": "^3.x"            // v2 รู้จัก namespace ของ v3 เท่านั้น
-"prettier-plugin-tailwindcss": "0.6.5"
+"prettier-plugin-tailwindcss": "^1.x"

 // postcss.config.js  →  .mjs
 export default {
   plugins: {
-    tailwindcss: {},
-    autoprefixer: {},
+    '@tailwindcss/postcss': {},
   },
 };
```

- **`tailwind-merge` เป็นข้อที่ต้องระวังที่สุด** — `src/utils/cn.ts` เรียก
  `twMerge()` ทุกที่ ถ้ายังเป็น v2 มันจะ merge class ผิดชุด (namespace สี/เงา
  เปลี่ยนไป) อาการคือ padding หาย หรือ style ซ้อนกัน ซึ่ง**ไม่มี test จับได้**
- `autoprefixer` **ลบได้** — v4 ทำ prefixing เองแล้ว
- แนะนำให้ใช้ `npx @tailwindcss/upgrade` (ต้อง Node 20+) ทำ config → CSS
  แล้วค่อย review diff เอง — อย่าเชื่อมัน 100% สำหรับโปรเจกต์ที่ config ใหญ่แบบนี้

---

## 4. Phase 2 — Config → CSS-first

`tailwind.config.ts` (~330 บรรทัด) กลายเป็น `@theme` ใน CSS

| v3 | v4 |
| --- | --- |
| `content: [...]` | ตรวจ source อัตโนมัติ (หรือ `@source` เฉพาะจุด) |
| `darkMode: ['selector', '[data-theme="dark"]']` | `@custom-variant dark ([data-theme="dark"] &)` |
| `theme.extend.colors.peach[*]` | `--color-peach-*: …` |
| `theme.extend.fontSize.xs` (tuple) | `--text-xs-*` + `--tracking-*` |
| `theme.extend.boxShadow['clay-sm']` | `--shadow-clay-sm` |
| `theme.extend.borderRadius` | `--radius-*` |
| `theme.extend.screens` | `--breakpoint-*` |
| `transitionDuration.default` | `--duration-*` (ระวังชื่อ `default`) |
| `keyframes` | `--animate-*` + `@keyframes` ในไฟล์เดิม |
| `<alpha-value>` | **ไม่มีใน v4** → ใช้ `color-mix()` |

**ประเด็นที่ต้องตัดสินใจ ไม่ใช่แค่แปลง**

1. **`peach` ramp (252 จุด)** — ปัจจุบันคือ
   `rgb(var(--accent-ramp-500) / <alpha-value>)` ซึ่งทำให้ชุด accent ที่แอดมิน
   เปลี่ยนได้ runtime ได้ **คุณสมบัตินี้ต้องรอด** ทางเลือกคือประกาศเป็น
   `--color-peach-500: var(--accent-ramp-500)` แล้วให้ v4 จัดการ alpha เอง
   — ต้อง **ทดสอบว่าสลับ accent แล้วสียังถูกต้อง** ไม่ใช่แค่ build ผ่าน
2. **ชื่อชนกับ default ของ v4** — config นี้ override `shadow-xs/sm/md/lg/xl`
   และ `borderRadius-xs/sm/md/lg/xl` ไว้เอง ส่วน v4 **เปลี่ยนชื่อ scale เริ่มต้น**
   (`shadow-sm` → `shadow-xs`, `rounded-sm` → `rounded-xs`) ชื่อของเราจะไป
   ทับค่าที่ v4 คิดว่าเป็น "ค่าเริ่มต้นของอีกชื่อ" → ต้อง map ทีละตัวและ**เทียบ
   ค่าจริง** ไม่ใช่แค่เชื่อว่า migrate แล้ว
3. **ค่าสีต้องคงเดิมแบบ byte-identical** — เหตุผลใน Phase 4

---

## 5. Phase 3 — การเปลี่ยนที่เงียบ (ไม่มีอะไรแดง)

นี่คือส่วนที่อันตรายที่สุด เพราะ**ทุกอันผ่านทุก gate**

| เปลี่ยน | ผล | ทำอย่างไร |
| --- | --- | --- |
| `ring` default 3px → **1px** | ~131 จุด บางจุดบาง | ใส่ `@theme { --default-ring-width: 3px }` (มีตัวแปรนี้เฉพาะเพื่อ compat) |
| `ring` default สี → **currentColor** | ring ที่ไม่ระบุสี | `--default-ring-color` หรือระบุสีให้ครบทุกจุด |
| `border-*` default → **currentColor** | กรอบที่ไม่ระบุสี (มี `@apply border-clay-200` คุมอยู่แล้ว แต่ `divide-*` 4 จุดไม่) | ตรวจ `divide-*` |
| **ลำดับ variant กลับด้าน** (right→left เป็น left→right) | `dark:hover:`, `hover:focus:` ที่ซ้อนกัน — **ชนะคนละคนเฉย ๆ** | ไล่หา class ที่ซ้อน 2 variant บน property เดียวกัน |
| `outline-none` → `outline-hidden` | 6 จุด | rename; ของใหม่ `outline-none` หมายถึงคนละอย่าง (style:none) |
| placeholder default | สี placeholder | เพิ่ม base rule ถ้าต้องการค่าเดิม |
| `space-y-*` / `divide-*` selector | `:not([hidden]) ~` → `:not(:last-child)` | ตรวจ element ซ่อน/inline |
| `hidden` attribute ได้ precedence | โครงที่พึ่ง `hidden` + `block` | ตรวจ |

**เรื่องที่ต้องตัดสินใจเป็นนโยบาย:** ring 131 จุด — ปล่อยให้เล็กลงทั้งหมด
(เล็กกว่าแต่คง contrast ของ focus ring) หรือรักษา 3px ด้วย
`--default-ring-width`? ตัวเลือกหลังปลอดภัยกว่าและตรงกับหน้าตาปัจจุบัน แต่
upgrade guide บอกตรงว่าตัวแปรนั้น "ไม่ใช่แบบ idiomatic"

---

## 6. หก gate ของ design token — ผลต่อแต่ละตัว

ไฟล์ `tests/design-token-gates.test.ts` **สแกน source เป็นข้อความดิบ** ไม่ได้
อ่าน config และไม่รู้จักว่า Tailwind เวอร์ชันไหน → **ไม่แตะ config เลย**

| gate | สแกนอะไร | ผลกับ v4 |
| --- | --- | --- |
| **R1** | `text-coral-NNN` + ตรวจ prefix `dark:` | **เสี่ยง** — ถ้าค่า coral ขยับ ยังผ่านอยู่เพราะมันแค่ดูชื่อ class |
| **R2** | `bg-coral-*` ต้องมี `text-fg-error` บรรทัดเดียวกัน | เหมือน R1 |
| **R3** | `bg-coral-*` + `text-white` | เหมือน R1 |
| **R4** | `disabled:bg-peach-*` / `disabled:shadow-(brand-glow\|clay-brand)` | ต้องยืนยันว่าชื่อ `shadow-brand-glow` / `shadow-clay-brand` รอด |
| **R5** | `bg-white` + marker | ปลอดภัย (`bg-white` ยังมีใน v4) |
| **R6** | `id="…"` ใน component | **ไม่เกี่ยวกับ Tailwind** |

**ประเด็นที่สำคัญที่สุดของตารางนี้:** R1/R2/R3 encode *ค่าคอนทราสต์ที่วัดไว้*
(coral-600 = 2.6–4.1:1 บนพื้นสว่าง) แต่ตัว gate ตรวจแค่ **ชื่อ class**
→ ถ้าการย้ายทำให้ค่าสีขยับ ทุก gate จะ**ยังเขียว** ทั้งที่คอนทราสต์พัง

ดังนั้นหลักการคือ: **ต้องพิสูจน์ว่าค่าสีไม่ขยับ โดยไม่อาศัย gate**

---

## 7. วิธีพิสูจน์ (สำคัญกว่าตัว migration)

1. **เทียบ CSS ที่ generate จริง** — build ทั้งสองเวอร์ชัน แล้ว diff ค่า
   `--color-coral-600`, `--color-peach-500`, `--shadow-clay-sm` ฯลฯ ทีละตัว
   ต้อง **เหมือนเดิมทุกตัว** ถ้าต่าง นั่นคือบั๊กที่ gate จะไม่จับ
2. **เทียบ computed style ของหน้าจริง** ไม่ใช่แค่ชื่อ class — เปิด `/`,
   `/orders/lookup`, `/management/orders` ทั้งธีม แล้วเทียบสี/เงา/ring
3. **เทียบ accent runtime** — เปลี่ยนชุดสีในหลังบ้าน แล้วดูว่า ramp ทั้ง 10
   ขั้นเปลี่ยนตาม (คุณสมบัติ `--accent-ramp` ต้องไม่หาย)
4. **รัน E1–E5 เต็มชุด** — แต่จำไว้ว่าต้องผ่าน Phase 0 ก่อน ไม่งั้นเขียวแล้วไม่ได้แปลว่าผ่าน
5. **visual diff** ถ้ามีเครื่องมือ — screenshot ก่อน/หลังที่ breakpoint เดิม

---

## 8. ประมาณการความเสี่ยง

| ส่วน | ความเสี่ยง | เหตุผล |
| --- | --- | --- |
| Phase 0 (gate ตายเงียบ) | **สูง และเกิดก่อนทุกอย่าง** | ถ้าไม่แก้ ทุกอย่างหลังจากนั้นไม่มีความหมาย |
| Phase 1–2 (toolchain + config) | ต่ำ | งานแปลงรูปแบบ เครื่องมือช่วยได้มาก |
| Phase 3 (default ที่เปลี่ยงีบ) | **กลาง–สูง** | 131 ring + ลำดับ variant + ชื่อ scale ที่ชนกัน |
| Phase 4–5 (ค่าสี/contrast) | **สูง** | gate ไม่ช่วย ต้องพิสูจน์เอง |

**ข้อเสนอ:** ทำ **Phase 0 เดี่ยว ๆ ก่อน** เป็น PR แยก เพราะเป็นการแก้บั๊กจริง
ที่มีอยู่แล้ว (ไม่เกี่ยวกับ Tailwind) และได้ประโยชน์ทันทีทั้งก่อนและหลังย้าย
หลังจากนั้นค่อยตัดสินใจว่าจะย้ายเมื่อไร — และถ้าไม่รีบ ก็**ไม่ต้องรีบ**
เพราะ `braces` ไม่กระทบ production เลย

**Browser baseline ที่ต้องยืนยัน:** v4 ต้องการ Safari 16.4+ / Chrome 111+ /
Firefox 128+ ถ้าลูกค้าเก่าใช้เครื่องเก่า ต้องคุยเรื่องนี้ก่อน ไม่ใช่หลัง