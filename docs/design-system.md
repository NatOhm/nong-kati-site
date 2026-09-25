# Nong-Kati Design System — v2 (Clay)

> **สถานะ: source of truth** (ตั้งแต่ 26 ก.ย. 2569)
> เอกสารก่อนหน้า (04-design-system.md ฉบับ ink-navy `#0D1424` / amber แบบ dark-first)
> **เลิกใช้แล้ว** — ผลิตภัณฑ์จริงถูกสร้างและขัดเงาบนระบบ clay/peach มาตลอด
> (ผ่าน contrast/touch-target gate ใน Playwright) จึงขึ้นทะเบียนระบบนี้เป็นทางการ
> ตามการตัดสินใจของเจ้าของร้าน การแก้ค่าใด ๆ ต้องแก้ที่ `src/styles/tokens.css` > **พร้อมเอกสารนี้** ใน commit เดียวกัน

แนวคิด: น้องแฮมสเตอร์ดินน้ำมัน (clay) — อบอุ่น มีมิติ เป็นมิตร แต่คุมระเบียบด้วย
token เดียวกันทั้งแอป ทั้ง light (default) และ dark cocoa

---

## 1. โทนสีหลัก (Primitive)

### Clay ramp — พื้น/เส้น/ตัวอักษร cocoa

| token    | hex       | ใช้                              |
| -------- | --------- | -------------------------------- |
| clay-50  | `#fafaf9` | ขาวอุ่น (surface)                |
| clay-100 | `#fdf8ee` | ครีมอ่อน                         |
| clay-200 | `#f5ebd8` | เส้นบาง                          |
| clay-300 | `#eadcc3` | เส้น default                     |
| clay-400 | `#d9c4a5` | เส้นเข้ม                         |
| clay-700 | `#8c6d46` | ตัวอักษรรอง/muted (4.5:1 บนครีม) |
| clay-900 | `#4e3820` | ตัวอักษรหลัก                     |
| clay-950 | `#3a2a18` | พื้น dark mode                   |

### Peach/Butterscotch ramp — สีแบรนด์

| token     | hex       | ใช้                          |
| --------- | --------- | ---------------------------- |
| peach-50  | `#fff7ed` | พื้นหน้าเว็บ (cream)         |
| peach-100 | `#ffedd5` | พื้นไฮไลต์                   |
| peach-300 | `#fdba74` | เส้นแบรนด์                   |
| peach-500 | `#f97316` | ปุ่มหลัก (ตัวอักษรขาว)       |
| peach-700 | `#c2410c` | ลิงก์/ไอคอนแบรนด์บนพื้นสว่าง |
| peach-800 | `#9a3412` | หัวข้อเน้น (4.5:1+)          |

### สีอื่น (ใช้เป็นสถานะ/หมวดหมู่เท่านั้น)

coral (error — `#b8404b` ขึ้นไปบนพื้นสว่าง), jade (success — `#0a5c30` ขึ้นไป),
sapphire (info), topaz/fawn (warning) — **ค่าที่ต่ำกว่า 4.5:1 ห้ามใช้เป็นตัวอักษร**
บนพื้นสว่าง (เช่น jade-500/coral-500 ใช้ได้เฉพาะไอคอนขนาดใหญ่/พื้นหลัง chip)

## 2. Semantic tokens (แสดงคู่ light/dark)

| token                  | Light      | Dark         |
| ---------------------- | ---------- | ------------ |
| bg-base                | peach-50   | clay-950     |
| bg-surface             | warm-white | clay-900     |
| bg-nav                 | `#fdebd3`  | clay-900     |
| bg-brand               | peach-500  | peach-400    |
| bg-brand-subtle        | peach-100  | `#5c4426`    |
| fg-primary             | clay-900   | clay-100     |
| fg-muted / placeholder | clay-700   | clay-400/500 |
| fg-brand               | peach-700  | peach-200    |
| border-default         | clay-300   | clay-700     |

กติกา: ห้าม hardcode hex ใน component — อ้าง semantic token
(`bg-surface`, `text-fg-muted`, `border-line`) ผ่าน Tailwind ที่ map ไว้แล้ว

## 3. Typography

- Display: **Mitr** (`--font-display`) — หัวข้อ
- UI: **Noto Sans Thai Looped** (`--font-ui`) — เนื้อความ
- Scale: 12/14/16/18/20/24/30/36px (text-xs → text-3xl)
- H1 หน้า: 20px mobile / 24–28px desktop, weight 700 — **หนึ่ง H1 ต่อหน้า** (มี e2e gate)
- ไทย: เปิด `word-break: break-word` + ห้าม hyphen (`.text-thai`)

## 4. Spacing / Radius / Elevation

**สัดส่วนการใช้งาน (70/20/10)** — 70% สะอาดแบบ commerce UI, 20% พื้น clay
(การ์ด/ปุ่ม/ช่องกรอก), 10% บุคลิกแฮมสเตอร์ — ก่อนเพิ่มของตกแต่งใหม่ ให้แก้ปัญหา
การใช้งานจริงก่อนเสมอ

**Elevation 3 ระดับ (บังคับ):**

| ระดับ  | token            | ใช้กับ                                 |
| ------ | ---------------- | -------------------------------------- |
| subtle | `shadow-clay-xs` | แถว, chip, tile พักตัว                 |
| raised | `shadow-clay-sm` | การ์ด, product tile, input, sticky bar |
| modal  | `shadow-clay-lg` | drawer, dialog, popover เท่านั้น       |

ห้ามใช้ Tailwind `shadow-lg`/`shadow-xl` (เทาเย็น หลุดพาเลตต์) — เงาอื่นที่อนุญาต
มีเพียง `shadow-clay-brand` (CTA hero/ปุ่มลอย) และ `shadow-clay-press`
(สถานะกด) — หน้า checkout/payment ใช้ระดับ raised ลงไป พื้นเรียบ เส้นบาง เพื่อ
สื่อความปลอดภัย

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

## 7. มาสคอตแฮมสเตอร์ (บทบาทตามสถานการณ์)

หนึ่งตัวละสถานการณ์ ไม่วางคู่ทุกหัวข้อ/ปุ่ล/เมนู — artwork สินค้าต้องเด่นกว่าตัวละครเสมอ:

| สถานการณ์                | ตัวละคร               | ที่ใช้อยู่                                                                                      |
| ------------------------ | --------------------- | ----------------------------------------------------------------------------------------------- |
| ค้นหาแล้วว่าง/ไม่เจอ     | จับสัมผัส (sniff)     | `mascot-sniff` ใน /search และหน้าค้นหา                                                          |
| ตะกร้าว่าง               | โค้งคำนับ/โบกมือ      | `mascot-wave` (EmptyCart + checkout ตะกร้าว่าง)                                                 |
| ชำระเงินสำเร็จ           | ฉลอง (ยกแขน+คอนเฟตตี) | `HamsterCelebrating` บนหน้ายืนยันเมื่อ `completed` + keyframe `mascot-celebrate` เด้งครั้งเดียว |
| 404                      | หลับ                  | `HamsterSleeping` ใน not-found.tsx                                                              |
| error แก้ได้ (retry ได้) | กังวล                 | `HamsterWorried` ในหน้า /search ตอน DB ล่ม                                                      |
| error ร้ายแรง            | หลับ                  | `HamsterSleeping` ใน error.tsx                                                                  |
| คำแนะนำ onboarding       | ผู้ช่วย               | ใช้ข้อความแนะนำสั้นพร้อมไอคอน ยังไม่ใส่ตัวละคร                                                  |

กติกา motion ของมาสคอต: 150–300ms ต่อ reaction (เด้งฉลอง 900ms ครั้งเดียวเป็น
ข้อยกเว้นเชิงพิธีกรรม) — และทุก animation ถูกปิดโดย guard
`prefers-reduced-motion` ทั้งไซต์อัตโนมัติ

## 8. ประวัติการแก้

- **v2.1 (2569-09-26)** — เพิ่มบทบาทมาสคอตตามสถานการณ์, elevation 3 ระดับ
  (subtle/raised/modal), checkout แบนลง, สัดส่วน 70/20/10
- **v2 (2569-09-26)** — ยกเลิกทิศทาง ink-navy/amber dark-first จากเอกสาร v1;
  ขึ้นทะเบียนระบบ clay ที่ใช้จริงเป็น source of truth (audit UX #11: drift)
- tokens.css v1.0.0 ยังคงเป็นไฟล์ค่าจริง — เอกสารนี้อธิบายและควบคุมมัน
