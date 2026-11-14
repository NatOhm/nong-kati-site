# Mobile audit — iOS และ Android (14 พ.ย. 2569, รอบยืนยันผล)

เอกสารนี้ตอบคำถามเดียว: **ข้อไหนปิดได้แล้วด้วยหลักฐาน และข้อไหนยังเปิดเพราะอะไร**
ไม่มีสถานะกลาง ๆ ทุกแถวเป็นอย่างใดอย่างหนึ่ง:

- **ปิด** — วัด/ตรวจจริงในรอบนี้ พร้อมตัวเลขหรือค่าที่อ่านได้
- **เปิด** — ยังปิดไม่ได้ และระบุเหตุผลว่าเพราะอะไร (ไม่มีเครื่อง, ต้องตัดสินใจ, ต้องงานหลังบ้าน)

## รอบนี้ตรวจอะไร ที่ไหน

| ชนิด | รายละเอียด |
| --- | --- |
| Build | production build ที่ commit `40df18b` → `next start` ที่ `localhost:3100` (โค้ดไม่เปลี่ยนในรอบนี้) |
| Viewports | **390×844** (iPhone 14-ish) และ **360×800** (Android ทั่วไป) — portrait |
| โหมดชี้ | **touch** (`isMobile + hasTouch`, `hover` media = false) และ **mouse** ที่ความกว้างเดียวกัน (`hover` media = true) เพื่อให้วัด pseudo-class `:hover` ได้จริง |
| ธีม | light และ dark ผ่าน `colorScheme` ของ browser context → แอปเรนเดอร์เอง (theme-init) ไม่ได้ยัด `data-theme` ทีหลัง |
| หน้า | `/`, `/search`, `/account/login` |
| ผล | **208 checks ผ่านทั้งหมด / 0 ล้ม** (constrast, PWA, viewport, tap, 44px, scroll lock, overflow) |
| ยังไม่มี | WebKit/iOS Safari, ติ่งจริง, คีย์บอร์ด iOS, PWA standalone, Android เครื่องจริง |

## คอนทราสต์ปุ่มหลัก — ตัวเลขจากการเรนเดอร์จริง

วัด computed `background-color` + `color` ของปุ่มที่วาดด้วยพื้นส้มบนหน้าเว็บจริง (ไม่ใช่ค่าจาก token)
แล้วคำนวณด้วยสูตร WCAG 2.x

| สถานะ | 390×844 | 360×800 |
| --- | --- | --- |
| light — rest (ปุ่ม `bg-peach-500` / `bg-surface-brand`) | 4.96–5.18 | 4.96–5.18 |
| light — hover | **7.00–7.31** | **7.00–7.31** |
| dark — rest | 4.86–5.18 | 4.86–5.18 |
| dark — hover | **6.52–7.31** | **6.52–7.31** |
| `/search` การ์ดสินค้า (ปุ่มขอบ ไม่มีพื้น) | 4.58 (light) / 5.58 (dark) | 4.58 / 5.58 |

ปุ่ม probe สองแบบที่เอกสารอ้างถึง (สร้างในหน้าจริงแล้ววัด): `bg-surface-brand` ได้ rest 4.96 (light) / 4.86 (dark)
และ hover 7.00 / 6.52; `bg-peach-500` + `text-white` ได้ rest 5.18 ทั้งสองธีม และ hover 7.31 ทั้งสองธีม
พื้น hover ที่วัดได้คือ `rgb(154, 52, 18)` (light) และ `rgb(253, 186, 116)` (dark) ตรงกับค่าที่กฎคาดไว้

**บนมือถือจริงไม่มี hover**: วัดแล้วว่า `(hover: hover) and (pointer: fine)` เป็น `false` ในโหมด touch
ดังนั้นผู้ใช้มือถือเห็นเฉพาะ rest (≥4.86) และ `:active`; ตัวเลข hover ข้างบนคือผู้ใช้เมาส์/ปากกาที่ความกว้างมือถือ

## ตารางตรวจครบทุกหัวข้อ

| ID | หัวข้อ | สถานะ | หลักฐาน / เหตุผล |
| --- | --- | --- | --- |
| MOB-01 | Viewport & `viewport-fit` | **ปิด** | meta ที่เสิร์ฟจริง: `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content` (390/360, ทั้งสองธีม); ไม่มี `maximum-scale` → pinch zoom ใช้ได้ (`layout.tsx:43,47`) |
| MOB-02 | Safe-area (ติ่ง/home indicator/แนวนอน) | **เปิด** | โค้ดผูกครบ (`globals.css:15-18`, `:71-73`, `MobileBottomNav.tsx:73`, `ProductDetailClient.tsx:295`) แต่ใน emulation `env()` = 0 (วัด `body padding-top: 0px`) จึงพิสูจน์ค่าจริงไม่ได้ — ต้องเครื่องมีติ่งหรือ standalone |
| MOB-03 | `100vh` vs `dvh` | **ปิด** | ตรวจโค้ดทั้ง `src`: storefront ไม่เหลือ `100vh`; `.h-screen`/`.min-h-screen` ถูก remap เป็น `100dvh` (`globals.css:786-792`); ที่เหลือมีแต่ `app/docs/manual` ซึ่งเป็นหน้าพิมพ์ภายใน |
| MOB-04 | คีย์บอร์ด: fixed bars ถูกบัง / focus | **เปิด** | Android ได้ `interactive-widget=resizes-content` (ยืนยันใน meta) แต่ iOS ไม่รองรับคีย์นี้ และย่อเฉพาะ visual viewport — ต้อง iPhone จริง |
| MOB-05 | input < 16px → iOS auto-zoom | **ปิด** | วัด computed input ทั้งหมดในหน้า login = **16px** ที่ 390 และ 360 ทั้ง light/dark (`globals.css:765`) |
| MOB-06 | Hover-only affordance | **ปิด** | `matchMedia('(hover: hover) and (pointer: fine)')` = false บน touch (วัดแล้ว) และสแกน 3 หน้า × 2 ความกว้าง × 2 ธีม ไม่พบคอนโทรลที่ซ่อนด้วย `opacity:0` + `group-hover` (0 รายการ); ปุ่มใช้ `:active`/`:focus-visible` (`Button.tsx:62`, `MobileBottomNav.tsx:98`) |
| MOB-07 | 44px touch targets | **ปิด** | วัดที่ 390 และ 360: ปุ่มปิด QuickView, ปุ่ม −/+, ปุ่มปิด sidebar = 44×44 (tolerance 43.5 สำหรับ sub-pixel) |
| MOB-08 | Tap highlight / `touch-action` / 300ms | **ปิด** | computed: `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation`, `text-size-adjust: 100%` ทั้ง 390/360 (`globals.css:43-44, 51-57`) |
| MOB-09 | Long-press & selection | **เปิด** | เมนู long-press บนรูปเป็นพฤติกรรม WebKit ที่ตรวจไม่ได้ที่นี่; การปิดมัน (`-webkit-touch-callout: none`) เป็นการตัดสินใจ ไม่ใช่บั๊ก |
| MOB-10 | Scroll lock / overscroll | **ปิด** | เปิด QuickView และ sidebar ที่ 390/360 แล้ว `document.body.style.position === 'fixed'`; พื้นที่เลื่อนมี `overscroll-contain` 5 จุด (`CartDrawer.tsx:119`, `SearchOverlay.tsx:157`, `QuickViewModal.tsx:181`, `CatalogSearchBox.tsx:127`, `NotificationsDropdown.tsx:124`) |
| MOB-11 | Momentum / nested scroll | **เปิด** | โมเมนตัมของ WebKit/Android วัดใน Chromium ไม่ได้; โค้ดฝั่งเราใช้ native scroll + `overscroll-contain` เท่านั้น |
| MOB-12 | Double-tap zoom บนปุ่ม | **ปิด** | `touch-action: manipulation` เป็นค่าที่ computed จริงบนปุ่ม (390/360) → ไม่มีดีเลย์ double-tap; pinch ยังทำงาน |
| MOB-13 | `position: sticky/fixed` บน iOS | **เปิด** | navbar/taskbar/buy bar ใช้ sticky/fixed ถูกต้องในโครงสร้าง (`FacebookNavbar.tsx:125-126`, `MobileBottomNav.tsx:71`, `ProductDetailClient.tsx:295`) แต่ `backdrop-blur` 7 จุดเป็นเรื่อง compositing ของ WebKit — ต้อง iPhone จริง |
| MOB-14 | PWA surface (manifest + ไอคอน + theme-color) | **ปิด** | `/manifest.webmanifest` = 200, `display: standalone`, มีไอคอน 192/512/maskable; `/icons/*.png` และ `/apple-icon.png` = 200 image/png ที่ 390/360; `<link rel=manifest>` + `apple-touch-icon` มีใน `<head>` (`manifest.ts:17-38`, `layout.tsx:48-51,79-80`) |
| MOB-14b | PWA offline / ไอคอนมาสเตอร์ | **เปิด** | ยังไม่มี service worker (ตัดสินใจเรื่อง offline) และไอคอน gen จาก `icon.png` 64px — ต้องไฟล์มาสเตอร์ 1024px จากงานออกแบบ |
| MOB-15 | ฟอนต์: preload / swap / FOUT-CLS | **เปิด** | โค้ดมี `font-display: swap` + preload 4 ไฟล์ (`fonts.css:29-113`, `layout.tsx:105-130`) แต่ไม่มี `size-adjust`/`ascent-override` และวัด CLS จริงบนเครือข่ายช้าไม่ได้ในรอบนี้ — รอทิศทางฟอนต์ |
| MOB-16 | รูปภาพ: format/ขนาด/lazy/CLS | **เปิด** | จองที่ด้วย aspect ratio ทุกการ์ด (ไม่มี CLS จากรูป) และมี `loading="lazy"` แต่ยังไม่มี `srcset` เพราะรูปมาจาก admin upload — ต้อง generate หลายขนาดตอนอัปโหลด |
| MOB-17 | คอนทราสต์ (AA) | **ปิด** | ตัวเลขในตารางด้านบน: rest 4.86–5.18, hover 6.52–7.31, การ์ด `/search` 4.58–5.58 — ไม่มีคู่ต่ำกว่า 4.5 |
| MOB-18 | ไทยตัดบรรทัด/ล้นที่ 320–430 | **ปิด** | วัด `documentElement.scrollWidth - innerWidth` = **0** ทุกกรณี: 3 หน้า × 390/360 × light/dark (12 เรนเดอร์) → ไม่มี horizontal overflow (`lang="th"` `layout.tsx:95`, wrap rules `globals.css:117-120`) |
| MOB-19 | ประสิทธิภาพ Android รุ่นเล็ก | **เปิด** | ตัวเลข build: home First Load JS 149 kB, shared 103 kB, `backdrop-blur` 7 จุด, ไม่มี framer-motion — แต่ fps/ความร้อนต้องวัดบนเครื่องจริง |
| MOB-20 | body scroll ใต้คีย์บอร์ด | **เปิด** | เช่นเดียวกับ MOB-04: พฤติกรรม visual viewport ของ iOS ตรวจได้เฉพาะเครื่องจริง |

สรุป: **ปิด 11 ข้อ / เปิด 10 ข้อ** (นับ MOB-14 แยกเป็น 14 กับ 14b)

## เรื่องที่เคยรายงานผิด และแก้แล้ว

รอบก่อนเอกสารนี้ระบุเป็น High ว่า "ข้อความขาวบน `peach-500` = 2.80:1" — **นั่นคือค่าของ token ดิบ ไม่ใช่สีที่วาดจริง**
แอปมี override ที่บังคับพื้นปุ่มเป็น `peach-700` อยู่แล้ว (`globals.css:232-248, 256-260`) วัด computed จริงได้ 4.96–5.18

แต่การตรวจซ้ำกลับเจอบั๊กจริงตัวหนึ่ง: กฎ hover เดิมอยู่ใน `@layer components` ใช้ชื่อคลาสชนกับ utility
ที่ Tailwind ปล่อยมาทีหลัง (ครอบ `@media (hover: hover) and (pointer: fine)`) จึงแพ้ → ปุ่มสว่างขึ้นเป็น
accent ramp-400 (#FB9651) และตัวอักษรขาวเหลือ **2.2:1** แก้โดยย้ายไปบล็อก unlayered ท้ายไฟล์ + เติม `html` prefix
(`globals.css:795-815`) แล้ววัดซ้ำได้ 7.00–7.31 (light) และ 6.52–7.31 (dark) ที่ทั้งสองความกว้าง

## สิ่งที่แก้สะสมในแคมเปญนี้ (พร้อมบรรทัด)

| ข้อ | สิ่งที่แก้ | ไฟล์:บรรทัด |
| --- | --- | --- |
| MOB-08 | `text-size-adjust`, ปิด tap highlight, `touch-action: manipulation` | `src/app/globals.css:43-44, 51-57` |
| MOB-02 | body เว้น safe-area ด้านบน/ซ้าย/ขวา | `src/app/globals.css:71-73` |
| MOB-02 | navbar sticky ใต้ safe-area + ปุ่ม ≥44px | `src/components/layout/FacebookNavbar.tsx:126,138,150` |
| MOB-04 | `interactiveWidget: 'resizes-content'` | `src/app/layout.tsx:47` |
| MOB-14 | `appleWebApp` + `formatDetection` | `src/app/layout.tsx:79-80` |
| MOB-14 | manifest (standalone, 192/512/maskable) | `src/app/manifest.ts:17-38` |
| MOB-14 | ไอคอน PWA + apple-touch-icon | `public/icons/*.png`, `src/app/apple-icon.png` |
| MOB-10 | QuickView/Sidebar ใช้ `useScrollLock` กลาง + `85dvh` + `overscroll-contain` | `src/components/product/QuickViewModal.tsx:58,181`, `src/components/layout/FacebookSidebar.tsx:292` |
| MOB-07 | ปุ่มปิด/สเต็ปเปอร์/ชิป QuickView = 44px | `src/components/product/QuickViewModal.tsx:203,228,262,274` |
| MOB-07 | ปุ่มปิด sidebar / ลบสินค้า / −+ จำนวน = 44px | `src/components/layout/FacebookSidebar.tsx:172`, `src/components/cart/CartItem.tsx:79`, `src/components/cart/QuantitySelector.tsx:49,61` |
| MOB-17 | พื้นปุ่มหลัก light → `peach-700`; dark placeholder → clay-300 | `src/app/globals.css:232-260`, `src/styles/tokens.css:299-303` |
| MOB-17 | hover ปุ่มหลักชนะ utility ของ Tailwind (เดิม 2.2:1) | `src/app/globals.css:795-815` |

รอบยืนยันผลนี้**ไม่มีการแก้โค้ด** เพราะการวัดทั้ง 208 ข้อไม่พบ regression; สิ่งที่เปลี่ยนคือเอกสารนี้

## เปิดอยู่ — เหตุผลและทางปิด

1. **MOB-02 / MOB-04 / MOB-09 / MOB-11 / MOB-13 / MOB-20** — ต้องอุปกรณ์จริง ไม่มีในสภาพแวดล้อมนี้
   วิธีปิด: iPhone (มีติ่ง) + Android หนึ่งเครื่อง → ตรวจติ่ง/hover ไม่มี, คีย์บอร์ดทับแถบล่าง, long-press รูป,
   scroll โมเมนตัมใน overlay, repaint ของ `backdrop-blur`
2. **MOB-14b (offline)** — ต้องตัดสินใจว่าจะมี service worker/offline shell หรือไม่
3. **MOB-14b (ไอคอน)** — ต้องได้ไฟล์มาสเตอร์ 1024px แล้ว gen ใหม่ (`sharp`, lanczos3)
4. **MOB-15** — ต้องวัด metric ของ Mitr/Noto Looped แล้วเพิ่ม `size-adjust`; และทิศทางฟอนต์ยังรอเจ้าของร้าน
5. **MOB-16** — ต้องเพิ่มการ generate หลายขนาดฝั่งอัปโหลด แล้วค่อยใส่ `srcset`
6. **MOB-19** — ต้องโปรไฟล์บน Android รุ่นเล็กจริง (fps, memory, ความร้อน)

## Gate (รันหลังแก้เอกสาร)

| Gate | ผล |
| --- | --- |
| `npx tsc --noEmit` | ผ่าน (0) |
| `npm run lint` | ผ่าน (0) |
| `npm test` | 122 ไฟล์ผ่าน / 2 skipped (124); 1125 tests ผ่าน / 5 skipped (1130) |
| `npm run build` | ผ่าน (0) |
| สคริปต์ตรวจมือถือรอบนี้ | 208 checks / 0 ล้ม (390×844 และ 360×800, touch + mouse, light + dark, 3 หน้า) |
| สคริปต์ overflow / hover-hidden | 12 เรนเดอร์: overflow = 0 ทุกหน้า, คอนโทรลที่ซ่อนแบบ hover-only = 0 |

หมายเหตุการวัด: ใช้ `getBoundingClientRect()` หลัง scroll เข้าจอ; ปุ่มที่อิง `rem` อาจได้ 43.6–43.99
ภายใต้ transform ของการ์ดที่ยังไม่ reveal จึงใช้ tolerance 43.5 (ดู MOB-21 ของรอบก่อน)
