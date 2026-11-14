# Mobile audit — iOS และ Android (14 พ.ย. 2569)

เอกสารนี้คือผลตรวจมือถือทั้งระบบของ `nongkatistore.com` รอบ iOS + Android (mobile web)
ทุกข้อตรวจกับโค้ดที่ HEAD และระบุชัดว่าข้อไหน **พิสูจน์ในเบราว์เซอร์แล้ว** ข้อไหนเป็น
**ข้อจำกัดของฮาร์ดแวร์/WebKit** และข้อไหนเป็น **การตัดสินใจของเจ้าของร้าน**

- Commit ที่ตรวจ: `8174cf6` (overlay/back gesture `81ccf00`, safe-area + touch targets `06846fe`) + การแก้ในรอบนี้ (ยังไม่ commit ตอนเขียนเอกสาร)
- Gate ที่เกี่ยวข้อง: [quality-gates.md](./quality-gates.md) — `MOB-OVL` และชุด 44px/contrast เดิม
- เวอร์ชันแอปไม่เปลี่ยนในรอบนี้ (1.2.2) ไม่ได้ push/deploy

## สภาพแวดล้อมที่ใช้พิสูจน์

| ชนิด | รายละเอียด |
| --- | --- |
| Browser | Chromium (Playwright) headless, `isMobile: true`, `hasTouch: true`, DPR 2 |
| Viewports | 320×568 (SE เล็กสุดที่รองรับ), 390×844 (iPhone 14-ish), 430×932 (iPhone Pro Max) |
| แอป | production build (`npm run build` → `next start`) ที่ `localhost:3100` |
| อัตโนมัติ | สคริปต์วัดในเครื่อง 21 ข้อ × 3 ความกว้าง = **63 checks ผ่านทั้งหมด**, `vitest`, `e2e/touch-targets.spec.ts` |
| ยังไม่ได้รัน | WebKit/iOS Safari, ติ่งจริง/home indicator จริง, คีย์บอร์ด iOS จริง, PWA standalone, Android เครื่องจริง |

ข้อสรุปสั้น: **ไม่มี blocker และไม่มี high ค้าง** — ปุ่ม CTA สีส้มผ่าน AA เพราะพื้นจริงถูก override เป็น
`peach-700` (ไม่ใช่ `peach-500` ดิบ) และกฎ hover ที่เดิมแพ้ utility ของ Tailwind ก็ย้ายไป unlayered แล้ว;
วัด computed color จริงได้ rest 4.96–5.18:1 และ hover 6.52–7.31:1 ทั้ง light/dark (`globals.css:228-260, 795-815`)
ทุกข้อที่เหลือเป็น partial ที่ต้องวัดบนเครื่องจริงหรือเป็นการตัดสินใจของเจ้าของร้าน

## ตารางสรุป — blocker / high ก่อน

| ID | ข้อค้นพบ | ระดับ | สถานะ |
| --- | --- | --- | --- |
| — | **ไม่มี blocker** | — | — |
| — | **ไม่มี high ค้าง** — ปุ่มหลักวัดได้ 4.96–5.18:1 (rest) และ 6.52–7.31:1 (hover) ทั้งสองธีม | — | ผ่าน (`src/app/globals.css:228-260, 795-815`) |
| MOB-17a | placeholder ในโหมดมืดบนการ์ด elevated = 3.23:1 | Medium | ปิดแล้ว (`src/styles/tokens.css:299-303`) |
| MOB-04 | คีย์บอร์ด iOS ไม่ย่อ layout viewport — แถบ taskbar/ปุ่มซื้ออาจอยู่ใต้คีย์บอร์ด | Medium | ทำเท่าที่ทำได้ (`interactiveWidget`) + เครื่องจริงเท่านั้น |
| MOB-12 | 7 จุดใช้ `backdrop-blur` บนแถบ sticky/fixed — เสี่ยง repaint บน iOS | Medium | เครื่องจริงเท่านั้น |
| MOB-14 | ยังไม่มี service worker / offline shell | Polish | ค้าง — ต้องตัดสินใจเรื่อง offline |

## ตารางตรวจครบทุกหัวข้อ

| ID | หัวข้อ | ผล | ระดับ | หลักฐาน |
| --- | --- | --- | --- | --- |
| MOB-01 | Viewport & `viewport-fit` | **ผ่าน** | — | `src/app/layout.tsx:43` (`viewportFit: 'cover'`), `:47` (`interactiveWidget: 'resizes-content'`); meta วัดได้ครบที่ 320/390/430; ไม่ตั้ง `maximum-scale` → pinch zoom ยังใช้ได้ |
| MOB-02 | Safe-area (ติ่ง, home indicator, แนวนอน) | **ผ่าน** (โค้ด) / เครื่องจริงเท่านั้น | — | `globals.css:15-18` ประกาศ `--nk-safe-*`; `:71-73` body padding top/left/right; `MobileBottomNav.tsx:73`, `CartDrawer.tsx:147`, `SearchOverlay.tsx:158`, `ProductDetailClient.tsx:295`, `LINEChatButton.tsx:17`, `ScrollToTop.tsx:28` ใช้ `--nk-safe-bottom` |
| MOB-03 | `100vh` vs `dvh`/`svh` | **ผ่าน** | — | `globals.css:792-798` remap `.h-screen`/`.min-h-screen` เป็น `100dvh`; storefront ไม่เหลือ `100vh` ยกเว้น `CatalogSearchBox.tsx:127` ที่มี `max-h` 24rem ครอบไว้จึงไม่ล้น |
| MOB-04 | คีย์บอร์ด: แถบ fixed/ช่องกรอกถูกบัง, focus scroll-into-view | **บางส่วน** | Medium | `layout.tsx:47` แก้ Android Chrome; iOS ไม่รู้จัก `interactive-widget` (ย่อ visual viewport เท่านั้น) — ไม่มีโค้ด `visualViewport` โดยเจตนา (ดูหัวข้อตัดสินใจ); ช่องกรอก 16px จึงไม่ซูม |
| MOB-05 | input `font-size` < 16px → iOS auto-zoom | **ผ่าน** | — | `globals.css:763-773` บังคับ 16px ให้ input/select/textarea ที่ ≤639px (วัด computed = 16px ที่ 320/390/430) |
| MOB-06 | Hover-only affordance | **ผ่าน** | — | `tailwind.config.js:11` `future.hoverOnlyWhenSupported`; คอนโทรลใช้ `active:`/`:focus-visible` เป็น feedback หลัก (เช่น `MobileBottomNav.tsx:98`, `Button.tsx:62`) |
| MOB-07 | 44px touch target + ระยะห่าง | **ผ่าน** | — | ปิดครบในรอบ `06846fe` + รอบนี้: `QuickViewModal.tsx:203,228,262,274`, `FacebookSidebar.tsx:172`, `CartItem.tsx:79`, `QuantitySelector.tsx:49,61`, `FacebookNavbar.tsx:138,150`, `MobileBottomNav.tsx:98,147,155,172,185`; วัดจริง 44px ทุกจุดทั้ง 3 ความกว้าง |
| MOB-08 | Tap highlight / `touch-action` / ดีเลย์ 300ms | **ผ่าน** | — | `globals.css:51-57` `-webkit-tap-highlight-color: transparent` + `touch-action: manipulation` บน a/button/`[role=button]`/submit/select/summary; `:43-44` `text-size-adjust: 100%` |
| MOB-09 | Long-press & text selection บนการ์ด | **บางส่วน** | Polish | ข้อความบนการ์ดเลือก/คัดลอกได้ตามปกติ, รูป hero ตั้ง `draggable={false}` (`HeroCarousel.tsx:99`); ไม่มี `-webkit-touch-callout: none` เลย → long-press รูปสินค้าเปิดเมนู "บันทึกรูป" ของ iOS (พฤติกรรมมาตรฐาน ไม่ใช่บั๊ก) |
| MOB-10 | Scroll lock + overscroll หลัง modal/sheet | **ผ่าน** | — | `useMobileOverlay.ts:93-121` ล็อกด้วย `position: fixed` + คืน `scrollY`; ใช้ที่ `CartDrawer.tsx:61`, `SearchOverlay.tsx:53`, `QuickViewModal.tsx:58`, `FacebookSidebar.tsx:292`; `overscroll-contain` ที่ `CartDrawer.tsx:119`, `SearchOverlay.tsx:157`, `QuickViewModal.tsx:181`, `CatalogSearchBox.tsx:127`, `NotificationsDropdown.tsx:124` |
| MOB-11 | Momentum / nested scroll | **ผ่าน** | — | พื้นที่เลื่อนทุกจุดมี `overscroll-contain`; ไม่ต้องใช้ `-webkit-overflow-scrolling` บน iOS 13+; ไม่มี nested scroll ซ้อนเกิน 2 ชั้น |
| MOB-12 | Double-tap zoom บนปุ่ม | **ผ่าน** | — | `touch-action: manipulation` (`globals.css:57`) — ตัดดีเลย์ double-tap โดยไม่ปิด pinch zoom |
| MOB-13 | `position: sticky/fixed` เพี้ยนบน iOS | **บางส่วน** | Medium | navbar `FacebookNavbar.tsx:125-126` (sticky + `top: var(--nk-safe-top)`), buy bar `ProductDetailClient.tsx:295`, taskbar `MobileBottomNav.tsx:71`; เคยแก้กับดัก transform แล้วที่ `globals.css:282-288` (`fill-mode: backwards`) — ที่เหลือคือ `backdrop-blur` 7 จุด ซึ่ง WebKit วาด repaint แพง/บางรุ่นมีแถบเงา ต้องดูบนเครื่อง |
| MOB-14 | PWA readiness | **บางส่วน** | Medium | manifest `src/app/manifest.ts:17-38` (name/short_name/lang/start_url/display standalone/orientation/bg+theme/icons 192+512+maskable), apple-touch-icon `src/app/apple-icon.png` (180px), `layout.tsx:79-80` (`appleWebApp`, `formatDetection`), theme-color light/dark `layout.tsx:48-51` — ยังไม่มี service worker/offline และไอคอนต่อจาก `icon.png` 64px |
| MOB-15 | ฟอนต์: preload / swap / FOUT-CLS / Thai fallback | **บางส่วน** | Medium | `fonts.css:29-113` `@font-face` + `font-display: swap` (ทุกหน้า), preload 4 ไฟล์ที่ `layout.tsx:105-130`; **ไม่มี** `size-adjust`/`ascent-override` และ fallback `Quicksand`/`Nunito` ไม่ได้โหลด (`tokens.css:100-101`) → วัด CLS จาก metric ต่างไม่ได้ในโค้ด |
| MOB-16 | รูปภาพ: format/ขนาด/lazy-load/CLS | **บางส่วน** | Medium | ทุกการ์ดใช้ `aspect-[...]` จองที่ → ไม่มี CLS; `loading="lazy"` ที่ `ProductCard.tsx:93`, `CartItem.tsx:49`, `SearchResultCard.tsx:39`, `AppTile.tsx:54`, `SearchOverlay.tsx:214`, `OrderSummaryPanel.tsx:77`; hero โหลดสไลด์แรก `eager` (`HeroCarousel.tsx:97`); **ไม่มี `srcset`/`next/image`** เพราะรูปมาจาก admin upload (`next.config.js:4-9` มี remotePattern แค่ CDN) → มือถือโหลดไฟล์เต็ม |
| MOB-17 | Dark-mode contrast บนโทเคน clay/peach (AA) | **ผ่าน** (แก้ไป 2 คู่) | — | วัดด้วยสูตร WCAG: light `fg-muted` 4.50, `fg-brand` 4.88, `fg-primary` 10.35; dark `fg-muted` 8.13, `fg-primary` 13.01, `fg-brand` 10.18; **dark placeholder บนการ์ด elevated 3.23 → clay-300 = 5.58** และ **hover ปุ่มหลัก 2.2 → 7.00–7.31** (แก้แล้วทั้งคู่); rest 4.96–5.18 — override ที่ `globals.css:232-260, 795-815` |
| MOB-18 | ไทยตัดบรรทัด/ล้นที่ 320–430px | **ผ่าน** | — | `<html lang="th">` (`layout.tsx:95`), `globals.css:117-120` (`word-break`/`overflow-wrap`, ปิด hyphens), `line-clamp-2` ที่ `ProductCard.tsx:115,119`, `SearchProductCard.tsx:111`, `AppTile.tsx:70`; วัดแล้วไม่มี horizontal overflow ที่ 320/390/430 |
| MOB-19 | ประสิทธิภาพเครื่อง Android รุ่นเล็ก | **ผ่าน** | — | First Load JS home 149 kB / shared 103 kB; ไม่มี framer-motion (0 ไฟล์), `requestAnimationFrame` 2 จุด, `filter: blur` 0 จุด, `backdrop-blur` 7 จุด, animation CSS 16 keyframes ความยาว 120–240ms (`tokens.css:214-222`) |
| MOB-20 | ช่องกรอก/ฟอร์มเลื่อนหลุดใต้คีย์บอร์ด (body scroll) | **บางส่วน** | Medium | เหมือน MOB-04: Android แก้ด้วย `resizes-content`; iOS ใช้ native scroll-into-view ของ Safari ซึ่งไม่ถูกปิดกั้นด้วย `overflow` ใด ๆ (body ไม่ได้ล็อกตอนฟอร์ม) — ต้องยืนยันบนเครื่อง |

## รายละเอียดรายพื้นที่ (เฉพาะข้อที่เป็น partial/fail)

### MOB-04 / MOB-20 — คีย์บอร์ดและ fixed bars
Android Chrome: `interactiveWidget: 'resizes-content'` (`layout.tsx:45-47`) ทำให้ layout viewport หดตามคีย์บอร์ด
แถบ taskbar (`MobileBottomNav.tsx:71`) และ buy bar (`ProductDetailClient.tsx:295`) จึงยังอยู่เหนือคีย์บอร์ด
iOS ไม่รองรับคีย์นี้ และย่อเฉพาะ visual viewport — แถบ `fixed bottom-0` จะถูกคีย์บอร์ดทับระหว่างพิมพ์
ซึ่งเป็นพฤติกรรมเดียวกับเว็บส่วนใหญ่ ทางเลือกที่ยังไม่ทำเพราะเป็นการตัดสินใจ UX:
ซ่อน taskbar ตอน `visualViewport.height` ลดลง หรือใช้ `position: sticky` แทน `fixed`
ช่องกรอกไม่ทำให้หน้า zoom เพราะ 16px (`globals.css:763-773`) และไม่มี `overflow: hidden` บน body ตอนฟอร์ม
จึงปล่อยให้ Safari เลื่อนช่องที่โฟกัสเข้าเองได้

### MOB-13 — sticky/fixed บน iOS
navbar เป็น `sticky top-0` + `top: var(--nk-safe-top)` (`FacebookNavbar.tsx:125-126`) ซึ่งจำเป็นใน standalone
เพราะ viewport เริ่มใต้สถานะบาร์ ส่วน `backdrop-blur-md` มี 7 จุด (navbar, taskbar, buy bar, dropdown)
บน iPhone รุ่นเก่า blur บนเลเยอร์ที่ scroll จะกินเฟรมและบางครั้งทิ้งแถบเงาที่ขอบ — ยังไม่ได้วัดบนเครื่อง
และไม่ควรถอด blur ออกเพราะเป็นหน้าตาของธีม (ต้องเป็นการตัดสินใจร่วมกับเจ้าของร้าน)

### MOB-14 — PWA
มี manifest + ไอคอนครบตามที่ Chrome ต้องการสำหรับ "เพิ่มไปยังหน้าจอโฮม" และ `appleWebApp.capable`
ทำให้ iOS เปิดแบบ standalone มี `theme-color` ทั้ง light/dark
ที่ยังขาด: service worker (ติดตั้งได้แต่ไม่มี offline), ไอคอน 512 ซึ่งขยายจาก `src/app/icon.png` 64px
จะนุ่มเมื่อแสดงผลใหญ่ และไม่มี `screenshots`/`shortcuts` ใน manifest (ไม่บังคับ)

### MOB-15 — ฟอนต์
12 ไฟล์ woff2 self-host ใน `public/fonts/`, preload 4 ไฟล์ที่ใช้ above-the-fold, `font-display: swap` ทุก face
ความเสี่ยง CLS อยู่ที่ fallback: `tokens.css:100-101` อ้าง `Quicksand`/`Nunito` ซึ่งไม่ได้แพ็กมาด้วย
จึงตกไปที่ `system-ui`/`sans-serif` ที่ metric ต่างจาก Mitr/Noto Looped ชัด (โดยเฉพาะความสูงบรรทัดไทย)
ยังไม่แก้เพราะการเพิ่ม `size-adjust` ต้องวัด metric ของฟอนต์จริง และทิศทางฟอนต์ยังรอเจ้าของร้านตัดสิน

### MOB-16 — รูปภาพ
ทุกจุดจองพื้นที่ด้วย aspect ratio หรือ container ขนาดคงที่ (`QuickViewModal.tsx:189-195`, `CartItem.tsx:45-50`)
จึงไม่มี layout shift แต่ไม่มี `srcset` เพราะรูปเป็น URL จาก admin (`/api/v1/images`) ที่ optimizer ไม่รู้จัก
ผลคือมือถือโหลดรูปความละเอียดเดียวกับเดสก์ท็อป — ทางแก้คือ generate หลายขนาดตอนอัปโหลด (งานฝั่งหลังบ้าน)

### MOB-17 — คอนทราสต์
สีดิบใน token กับสีที่วาดจริงไม่เท่ากัน: `globals.css:228-260` override ให้พื้นปุ่มหลัก (`bg-peach-500` + `text-white`,
`bg-surface-brand`) เป็น `peach-700` #C2410C ทั้งสองธีม จึงไม่มีปุ่มไหนวาดด้วย `peach-500` + ตัวอักษรขาว

hover เป็นบั๊กจริงที่เจอระหว่างตรวจ: กฎเดิมอยู่ใน `@layer components` และแพ้ utility `.hover\:bg-peach-400:hover`
ที่ Tailwind ปล่อยมาทีหลัง (ครอบ `@media (hover: hover) and (pointer: fine)`) → ปุ่มสว่างขึ้นเป็น accent ramp-400
(#FB9651) และตัวอักษรขาวเหลือ **2.2:1**. ย้ายกฎไปบล็อก unlayered ท้ายไฟล์และเติม `html` prefix
(`globals.css:795-815`) เพื่อให้ชนะทั้งชั้นและ specificity; โหมดมืดยังคง hover สว่างเป็น `peach-300` เพราะ label
เป็น clay-900. วัด computed style ซ้ำ (ทั้งหน้า `/`, `/search`, `/account/login` และปุ่ม probe ทั้งสองแบบ):
rest **4.96–5.18:1**, hover **6.52–7.31:1** — ผ่าน AA ทั้งหมด
ค่าที่วัดจาก token จริง (สูตร WCAG 2.x, ไม่ได้ commit สคริปต์):

| คู่สี | โหมดสว่าง | โหมดมืด |
| --- | --- | --- |
| `fg-primary` / base | 10.35 | 13.01 |
| `fg-secondary`/`fg-muted` / base | 4.50 | 8.13 |
| `fg-brand` / base | 4.88 | 10.18 |
| `fg-placeholder` / การ์ด elevated | 4.78 | **3.23 → 5.58 (แก้แล้ว)** |
| ข้อความขาว / พื้นปุ่มจริง (rest) | 4.96–5.18 | 4.86–5.18 |
| ข้อความขาว / พื้นปุ่มจริง (hover) | 7.00–7.31 | 6.52–7.31 |
| ข้อความขาว / `peach-500` ดิบ (ไม่ถูกวาด) | 2.80 | 3.56 |
| ข้อความขาว / hover เดิม (accent ramp-400) | 2.2 (แก้แล้ว) | 2.2 (แก้แล้ว) |

## สิ่งที่แก้ในรอบนี้ (พร้อม file:line)

| ข้อ | สิ่งที่แก้ | ไฟล์:บรรทัด |
| --- | --- | --- |
| MOB-08 | `text-size-adjust: 100%`, ปิด tap highlight, `touch-action: manipulation` | `src/app/globals.css:43-44`, `:51-57` |
| MOB-02 | กันเนื้อหาชนติ่งด้านบน (นอกเหนือจาก taskbar ที่กันอยู่แล้ว) | `src/app/globals.css:71-73` |
| MOB-02/13 | navbar sticky เริ่มใต้ safe-area | `src/components/layout/FacebookNavbar.tsx:126` |
| MOB-02 | ปุ่มเมนู/ลิงก์ซัพพอร์ตใน navbar ≥44px | `src/components/layout/FacebookNavbar.tsx:138,150` |
| MOB-04 | `interactiveWidget: 'resizes-content'` (Android) | `src/app/layout.tsx:47` |
| MOB-14 | `appleWebApp` + `formatDetection` | `src/app/layout.tsx:79-80` |
| MOB-14 | manifest ใหม่ (standalone, ไอคอน 192/512/maskable) | `src/app/manifest.ts:17-38` |
| MOB-14 | ไอคอน PWA + apple-touch-icon 180px | `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`, `src/app/apple-icon.png` |
| MOB-10 | QuickView ใช้ scroll lock กลาง + จำกัดความสูง `85dvh` + `overscroll-contain` | `src/components/product/QuickViewModal.tsx:58,181` |
| MOB-07 | ปุ่มปิด/สเต็ปเปอร์/ชิปตัวเลือกใน QuickView = 44px | `src/components/product/QuickViewModal.tsx:203,228,262,274` |
| MOB-10 | Sidebar ใช้ scroll lock กลาง (ลบ body-overflow เดิม) | `src/components/layout/FacebookSidebar.tsx:292` |
| MOB-07 | ปุ่มปิด sidebar = 44px | `src/components/layout/FacebookSidebar.tsx:172` |
| MOB-07 | ปุ่มลบสินค้าในตะกร้า = 44px | `src/components/cart/CartItem.tsx:79` |
| MOB-07 | ปุ่ม −/+ จำนวน = 44px | `src/components/cart/QuantitySelector.tsx:49,61` |
| MOB-17 | placeholder โหมดมืดเป็น clay-300 (3.23 → 5.58 บนการ์ด elevated) | `src/styles/tokens.css:299-303` |
| MOB-17 | hover ของปุ่มหลักเดิมแพ้ utility ของ Tailwind (พื้นอ่อนลงเป็น ramp-400 = 2.2:1) — ย้ายกฎไป unlayered + เติม `html` prefix | `src/app/globals.css:795-815` |

## รายการที่ยังต้องแก้ (เรียงตามลำดับความสำคัญ)

1. **MOB-15 (Medium)** — วัด metric ของ Mitr/Noto Looped แล้วเพิ่ม `size-adjust`/`ascent-override`
   ให้ fallback (ต้องรอทิศทางฟอนต์)
2. **MOB-16 (Medium)** — สร้างรูปหลายขนาดตอนอัปโหลด + `srcset`
3. **MOB-13 (Medium)** — ทดสอบ `backdrop-blur` บน iPhone รุ่นเก่า; ถ้ากระตุกให้ลดเหลือ navbar เดียว
4. **MOB-04/20 (Medium)** — ตัดสินใจว่าจะซ่อน taskbar ตอนคีย์บอร์ดเปิดบน iOS หรือปล่อยเป็นพฤติกรรมปกติ
5. **MOB-14 (Polish)** — service worker/offline shell และไอคอนมาสเตอร์ 1024px
6. **MOB-09 (Polish)** — ถ้าต้องการปิดเมนู long-press บนรูปสินค้า ต้องเพิ่ม `-webkit-touch-callout: none`
   เฉพาะรูป (ปัจจุบันปล่อยเป็นพฤติกรรมมาตรฐานของ iOS)

## ต้องการการตัดสินใจของเจ้าของร้าน

1. **ไอคอนแอป 1024px** — ไอคอนที่ gen มาจาก `icon.png` 64px จะนุ่มเมื่ออยู่บนหน้าจอโฮมจริง
   ต้องมีไฟล์มาสเตอร์จากนักออกแบบแล้ว gen ใหม่ (`sharp`, lanczos3)
2. **ทิศทางฟอนต์** — ยังไม่ตัดสิน; audit นี้ไม่เปลี่ยน/ไม่เพิ่มฟอนต์ตามที่ตกลง
3. **Offline** — ต้องมี service worker หรือไม่ (มีผลต่อการติดตั้งและต้นทุนแคช)
4. **ซ่อน taskbar ตอนพิมพ์บน iOS** — แลกมาด้วย taskbar กระพริบ/เลื่อนขึ้นลงระหว่างสลับช่อง

## ตรวจบนเครื่องจริงเท่านั้น (ห้ามนับว่าผ่าน)

1. **iOS Safari** — คีย์บอร์ดทับแถบล่าง, scroll-into-view ของฟอร์ม, sticky navbar หลังหมุนจอ
   วิธีตรวจ: iPhone → เปิด `/checkout` → แตะช่องเบอร์โทร → ช่องต้องไม่ถูกคีย์บอร์ดบังและหน้าไม่ซูม
2. **Swipe-back / rubber-band** — โค้ดผูก `popstate` และล็อกด้วย `position: fixed` แล้ว
   (`useMobileOverlay.ts:44-90, 93-121`) แต่ท่าทางจริงของ WebKit ยังไม่ได้ลอง
3. **ติ่งจริง/landscape** — วัดเฉพาะ "ท่อ" ของ `env()` (ตั้งค่าแล้ว taskbar โตตาม) ยังไม่เห็นค่าจริง
4. **PWA standalone** — ติดตั้งจาก Chrome/Safari แล้วเปิด: ต้องไม่มีแถบที่อยู่, theme-color ถูก,
   ไอคอนไม่ถูกตัด (maskable)
5. **Android เครื่องจริง** — `overscroll-contain`, pull-to-refresh, `resizes-content` บน Chrome จริง
6. **HEIC** — ยังไม่ได้อัปโหลดรูปจากอัลบั้ม iPhone (ฝั่งแอปปฏิเสธ HEIC อย่างชัดเจนอยู่แล้ว)

## Gate และตัวเลขจริง

| Gate | ผล |
| --- | --- |
| `npx tsc --noEmit` | ผ่าน (0) |
| `npm run lint` | ผ่าน (0) |
| `npm test` (vitest) | ผ่าน 122 ไฟล์ / 1125 tests (5 skipped) |
| `npm run build` | ผ่าน (0) |
| `e2e/touch-targets.spec.ts` | 9 ผ่าน / 1 skipped (รันล่าสุดที่ `8174cf6`; ไฟล์ทดสอบไม่ถูกแก้ในรอบนี้) |
| สคริปต์วัดคอนทราสต์ปุ่ม (light+dark) | พื้นปุ่มส้ม rest 4.86–5.18:1, hover 6.52–7.31:1 (`/`, `/search`, `/account/login` + ปุ่ม probe ทั้ง `bg-peach-500` และ `bg-surface-brand`); ไม่มีคู่ที่ต่ำกว่า 4.5 |
| สคริปต์วัดมือถือ 320/390/430 | 63/63 checks ผ่าน (manifest, ไอคอน, viewport, tap/touch, 44px, scroll lock, ไม่มี horizontal overflow) — รันกับ production build หลังแก้ layout/คอมโพเนนต์ทั้งหมด; การแก้โทเคนสีภายหลังไม่กระทบรายการที่วัด |

หมายเหตุการวัด: `getBoundingClientRect()` ของปุ่มที่อิง `rem` อาจได้ 43.6–43.99 ภายใต้ transform
ของการ์ดที่ยังไม่ reveal; `offsetHeight` = 44 — ใช้ tolerance 43.5 ในการวัด (ดู MOB-21 ของรอบก่อน)
