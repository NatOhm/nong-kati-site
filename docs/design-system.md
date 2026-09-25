# Nong-Kati Design System — v2 (Clay)

> **สถานะ: source of truth** (ตั้งแต่ 26 ก.ย. 2569)
> เอกสารก่อนหน้า (04-design-system.md ฉบับ ink-navy `#0D1424` / amber แบบ dark-first)
> **เลิกใช้แล้ว** — ผลิตภัณฑ์จริงถูกสร้างและขัดเงาบนระบบ clay/peach มาตลอด
> (ผ่าน contrast/touch-target gate ใน Playwright) จึงขึ้นทะเบียนระบบนี้เป็นทางการ
> ตามการตัดสินใจของเจ้าของร้าน การแก้ค่าใด ๆ ต้องแก้ที่ `src/styles/tokens.css`
> **พร้อมเอกสารนี้** ใน commit เดียวกัน

แนวคิด: น้องแฮมสเตอร์ดินน้ำมัน (clay) — อบอุ่น มีมิติ เป็นมิตร แต่คุมระเบียบด้วย
token เดียวกันทั้งแอป ทั้ง light (default) และ dark cocoa

---

## 1. โทนสีหลัก (Primitive)

### Clay ramp — พื้น/เส้น/ตัวอักษร cocoa
| token | hex | ใช้ |
|---|---|---|
| clay-50 | `#fafaf9` | ขาวอุ่น (surface) |
| clay-100 | `#fdf8ee` | ครีมอ่อน |
| clay-200 | `#f5ebd8` | เส้นบาง |
| clay-300 | `#eadcc3` | เส้น default |
| clay-400 | `#d9c4a5` | เส้นเข้ม |
| clay-700 | `#8c6d46` | ตัวอักษรรอง/muted (4.5:1 บนครีม) |
| clay-900 | `#4e3820` | ตัวอักษรหลัก |
| clay-950 | `#3a2a18` | พื้น dark mode |

### Peach/Butterscotch ramp — สีแบรนด์
| token | hex | ใช้ |
|---|---|---|
| peach-50 | `#fff7ed` | พื้นหน้าเว็บ (cream) |
| peach-100 | `#ffedd5` | พื้นไฮไลต์ |
| peach-300 | `#fdba74` | เส้นแบรนด์ |
| peach-500 | `#f97316` | ปุ่มหลัก (ตัวอักษรขาว) |
| peach-700 | `#c2410c` | ลิงก์/ไอคอนแบรนด์บนพื้นสว่าง |
| peach-800 | `#9a3412` | หัวข้อเน้น (4.5:1+) |

### สีอื่น (ใช้เป็นสถานะ/หมวดหมู่เท่านั้น)
coral (error — `#b8404b` ขึ้นไปบนพื้นสว่าง), jade (success — `#0a5c30` ขึ้นไป),
sapphire (info), topaz/fawn (warning) — **ค่าที่ต่ำกว่า 4.5:1 ห้ามใช้เป็นตัวอักษร**
บนพื้นสว่าง (เช่น jade-500/coral-500 ใช้ได้เฉพาะไอคอนขนาดใหญ่/พื้นหลัง chip)

## 2. Semantic tokens (แสดงคู่ light/dark)

| token | Light | Dark |
|---|---|---|
| bg-base | peach-50 | clay-950 |
| bg-surface | warm-white | clay-900 |
| bg-nav | `#fdebd3` | clay-900 |
| bg-brand | peach-500 | peach-400 |
| bg-brand-subtle | peach-100 | `#5c4426` |
| fg-primary | clay-900 | clay-100 |
| fg-muted / placeholder | clay-700 | clay-400/500 |
| fg-brand | peach-700 | peach-200 |
| border-default | clay-300 | clay-700 |

กติกา: ห้าม hardcode hex ใน component — อ้าง semantic token
(`bg-surface`, `text-fg-muted`, `border-line`) ผ่าน Tailwind ที่ map ไว้แล้ว

## 3. Typography

- Display: **Mitr** (`--font-display`) — หัวข้อ
- UI: **Noto Sans Thai Looped** (`--font-ui`) — เนื้อความ
- Scale: 12/14/16/18/20/24/30/36px (text-xs → text-3xl)
- H1 หน้า: 20px mobile / 24–28px desktop, weight 700 — **หนึ่ง H1 ต่อหน้า** (มี e2e gate)
- ไทย: เปิด `word-break: break-word` + ห้าม hyphen (`.text-thai`)

## 4. Spacing / Radius / Elevation

- Spacing base 4px (space-1 … space-32) — ห้ามค่าอื่นที่ไม่ได้มาจาก scale
- Radius: md 8px (input) / xl 16px (การ์ด) / 2xl 20px (การ์ดใหญ่) / full (ปุ่มยา)
- Elevation 3 ระดับแบบ clay (inset สว่าง + drop โค้งลง):
  `shadow-clay-sm` → `shadow-clay` → `shadow-clay-lg` + `shadow-clay-press` (สถานะกด)

## 5. Motion

- interactive 180ms / page entry 240ms / deliberate 450ms (drawer)
- easing: `ease-out-quart` ทั่วไป, `ease-spring` เฉพาะจุดเน้น
- เคารพ `prefers-reduced-motion` เสมอ (มี global guard)

## 6. การเข้าถึง (บังคับด้วย Playwright gate)

- Contrast ตัวอักษร ≥ 4.5:1 ทุกหน้าทั้งสองธีม (`e2e/contrast.spec.ts`)
- Touch target ≥ 44×44px (`e2e/touch-targets.spec.ts`)
- Landmark: 1 main + skip link + H1 ต่อหน้า (`e2e/landmarks.spec.ts`)
- Dialog: focus ไปตัว dialog, Tab ค้างใน, Escape ปิด, ล็อก scroll, คืน focus
- Disclosure (FAQ): `aria-expanded` + `aria-controls` + เนื้อหายุบใช้ `hidden`
- Error ฟอร์ม: `role="alert"` + `aria-invalid` + `aria-describedby` เสมอ
- Focus ring: `shadow-focus-ring` (2px พื้น + 4px แบรนด์)

## 7. ประวัติการแก้

- **v2 (2569-09-26)** — ยกเลิกทิศทาง ink-navy/amber dark-first จากเอกสาร v1;
  ขึ้นทะเบียนระบบ clay ที่ใช้จริงเป็น source of truth (audit UX #11: drift)
- tokens.css v1.0.0 ยังคงเป็นไฟล์ค่าจริง — เอกสารนี้อธิบายและควบคุมมัน
