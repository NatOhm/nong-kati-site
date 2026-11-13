# Mobile audit — iOS และ Android (13 พ.ย. 2569)

เอกสารนี้คือผลตรวจมือถือรอบรวมของ `nongkatistore.com` ทุกข้อถูกตรวจซ้ำกับโค้ดที่ HEAD
ไม่ใช่การคัดลอกบันทึกเดิม และระบุชัดว่าข้อไหนพิสูจน์แล้วในเบราว์เซอร์จริง ข้อไหนเป็นข้อจำกัด
ของฮาร์ดแวร์ และข้อไหนไม่ใช่ข้อบกพร่องพร้อมหลักฐาน

- Commit ที่เอกสารนี้อ้างถึง: `81ccf00` (overlay/back gesture), `06846fe` (safe-area + touch targets), `5f0505e` (รอบก่อนหน้า)
- Gate ที่เกี่ยวข้อง: [quality-gates.md](./quality-gates.md) — `MOB-OVL` และชุด 44px/contrast เดิม
- เวอร์ชันแอปไม่เปลี่ยนในรอบนี้ (1.2.2) และไม่ได้ push/deploy

## สภาพแวดล้อมที่ใช้พิสูจน์

| ชนิด | รายละเอียด |
| --- | --- |
| Browser | Chromium (Playwright) headless, `isMobile: true`, `hasTouch: true`, DPR 2 |
| Viewports | 390×844 (iPhone 14-ish) และ 360×800 (Android) |
| แอป | production build (`npm run build` → `next start`) ที่ `localhost:3100` ต่อ DB จริงแบบอ่านอย่างเดียว |
| อัตโนมัติ | `vitest` (unit), `e2e/touch-targets.spec.ts` (Playwright gate), สคริปต์วัดในเครื่อง (ไม่ commit) |
| ยังไม่ได้รัน | WebKit/iOS Safari, อุปกรณ์มีติ่งจริง, PWA standalone, กล้อง/อัลบั้ม iOS |

ข้อสรุปสำคัญ: ทุกข้อที่เป็น „โค้ด" ถูกแก้และวัดใน Chromium จริงทั้งสองความกว้างแล้ว
ส่วนพฤติกรรมที่ขึ้นกับ WebKit หรือติ่งจริงถูกทำเครื่องหมาย **เครื่องจริงเท่านั้น** และไม่ถูกกล่าวอ้างว่าผ่าน

## ตารางสรุป

| ID | ข้อค้นพบ | พื้นที่ | ระดับ | สถานะ | หลักฐาน / สภาพแวดล้อม |
| --- | --- | --- | --- | --- | --- |
| MOB-01 | ปุ่มย้อนกลับ/สไวป์กลับทิ้ง cart drawer และ search sheet (ออกจากหน้าไปเลย) | both | High | ปิดแล้ว `81ccf00` | Chromium 390×844 + 360×800: 24 checks ผ่าน (back ปิด overlay, URL เดิม, ซ้อนกันถอยในก่อน, ปิดจาก UI แล้ว back เป็น navigation จริง) + `tests/mobile-overlay.test.tsx` 9 เคส |
| MOB-02 | หน้าเบื้องหลัง overlay ยังเลื่อน/เด้ง (iOS ไม่สนใจ `overflow:hidden`) | both (สาเหตุ iOS) | High | ปิดแล้ว `81ccf00` | Chromium: `body` เป็น `fixed` ที่ `-scrollY`, wheel 1400px แล้ว `body.top` ไม่ขยับ, ปิดแล้วคืน `scrollY` เดิมเป๊ะ; rubber-band ของ WebKit = เครื่องจริงเท่านั้น |
| MOB-03 | ไม่มี `viewport-fit=cover` / ไม่ใช้ `env(safe-area-inset-*)` — taskbar ลอยเหนือ home indicator เป็นแถบ และ overlay ชนขอบจอ | both | Medium | ปิดแล้ว `06846fe` | Chromium: meta มี `viewport-fit=cover`, ตั้ง `--nk-safe-bottom: 34px` แล้ว taskbar สูงขึ้น 34px, padding ล่างของ `main` เพิ่ม 34px, reset แล้วกลับเท่าเดิม; ติ่งจริง = เครื่องจริงเท่านั้น |
| MOB-04 | ลิงก์ „กดซื้อเลย!" ในแถบประกาศสูง 32px | both | Medium | ปิดแล้ว `06846fe` | วัดได้ ≥44px ทั้ง 390 และ 360 (hit area 44, layout แถบไม่ขยับเพราะ negative margin) |
| MOB-05 | ชิปหมวดหมู่ใน /search สูง 35px | both | Medium | ปิดแล้ว `06846fe` | วัดได้ 44px ทั้งสองความกว้าง (รวมชิป „ทั้งหมด" และชิปช่วง DB ล่ม) |
| MOB-06 | ตัวกรอง „เฉพาะที่มีของ" สูง 40px | both | Low | ปิดแล้ว `06846fe` | วัดได้ 44px |
| MOB-07 | breadcrumb „หน้าหลัก" สูง 32px | both | Low | ปิดแล้ว `06846fe` | วัดได้ 44px (`-my-3` คงความสูงแถวเดิม) |
| MOB-08 | ลิงก์ „สมัครสมาชิก" ท้ายฟอร์ม login สูง 23px | both | Medium | ปิดแล้ว `06846fe` | วัดได้ 44px |
| MOB-09 | ปุ่ม „กลับ" บนหน้า login สูง 36px | both | Medium | ปิดแล้ว `06846fe` | วัดได้ 44px |
| MOB-10 | ปุ่ม „ช้อปปิ้งต่อ" ในตะกร้าสูง 20px | both | Medium | ปิดแล้ว `06846fe` | วัดได้ 44px (footer ตะกร้าเผื่อ safe-area ล่างด้วย) |
| MOB-11 | ปุ่มแจ้งเตือนบน navbar 40×40 | both | Low | ปิดแล้ว `06846fe` | วัดได้ 44×44 |
| MOB-12 | ปุ่มหัวใจ wishlist บนการ์ดสินค้า 28–32px | both | High | ปิดแล้ว `06846fe` | วัดได้ 44×44 (ก่อน reveal การ์ดถูก `scale(0.99)` จึงวัดได้ 43.6 — `offsetHeight` = 44, ดู MOB-21) |
| MOB-13 | dropdown เรียงลำดับ 36px, ลูกศร pagination 36×36, ตัวเลือกในลิสต์ 40px | both | Medium | ปิดแล้ว `06846fe` | วัดได้ 44px ทุกตัว (dropdown, ลูกศร, options) |
| MOB-14 | ปุ่ม action ในการ์ดผลค้นหา (`ดูสินค้า`/`เลือกราคา`) สูง 36px | both | Medium | ปิดแล้ว `06846fe` | วัดได้ 44px; ปุ่มในการ์ดหน้าแรกเป็น `h-11` + `min-h-[44px]` |
| MOB-15 | ลิงก์ „ดูทั้งหมด" ตามหัวข้อหน้าแรก สูง 21–38px | both | Medium | ปิดแล้ว `06846fe` | วัดได้ 44px ทั้งลิงก์หัวข้อและลิงก์ในแถบหมวด (`-my-*` คงระยะบรรทัด) |
| MOB-16 | wordmark ใน footer สูง 26px | both | Low | ปิดแล้ว `06846fe` | วัดได้ 44px (Logo ใช้ร่วมกับ navbar) |
| MOB-17 | input login สูง 42px, ปุ่ม submit 41px, แถว „จดจำฉัน" 20px | both | Medium | ปิดแล้ว `06846fe` | input/submit วัดได้ ≥44px, label จดจำฉันสูง 44px (checkbox 20px อยู่ใน label ที่กดได้ทั้งแถว) |
| MOB-18 | ฟอนต์ input <16px ทำให้ iOS ซูมหน้าเมื่อโฟกัส | iOS | High | ไม่ใช่ข้อบกพร่อง — มีอยู่แล้ว | `globals.css` บังคับ `font-size:16px` ให้ input/select/textarea บนจอ ≤1023px; วัด computed style ที่ 390 ได้ 16px ทุกช่อง (login, register, orders lookup, checkout) |
| MOB-19 | ไฟล์ HEIC จาก iPhone อาจอัปโหลดไม่ได้ | iOS | Medium | ไม่ใช่ข้อบกพร่อง — ถูกปฏิเสธโดยออกแบบ + เครื่องจริงเท่านั้นสำหรับการแปลง | หลักฐานในโค้ด: ทุก picker ใช้ `accept="image/jpeg,image/png,image/webp"`, client ปฏิเสธก่อนส่งพร้อมข้อความไทย, server ตรวจ MIME (415 `UNSUPPORTED_TYPE`) และ magic bytes (400 `CONTENT_MISMATCH`) ทั้ง `/api/v1/payments/slip-upload` และ `/api/v1/admin/upload`; ไม่มี HEIC ถูกเก็บได้ การที่ iOS แปลง HEIC→JPEG ให้เองเมื่อ accept ไม่รวม HEIC เป็นพฤติกรรม WebKit ที่ยังไม่ได้ทดสอบบนเครื่องจริง |
| MOB-20 | ลิงก์ชื่อสินค้าในการ์ดผลค้นหาสูง 21px | both | Low | ไม่ใช่ข้อบกพร่อง — มีเป้าหมายเทียบเท่า | การ์ดเดียวกันมีลิงก์รูปขนาดเต็มพื้นที่ (149×134+) ไปหน้าเดียวกัน และปุ่ม action 44px; WCAG 2.5.8 ยกเว้นเมื่อมีลิงก์/คอนโทรลเทียบเท่าในหน้าเดียวกัน |
| MOB-21 | วัดการ์ดที่ยังไม่ reveal ได้ 43.6px (ควรเป็น 44) | both | — | ไม่ใช่ข้อบกพร่อง — artifact ของการวัด | การ์ดที่อยู่นอกจอถือ `scale(0.99)` ของ ScrollReveal; `offsetHeight` = 44 และหลัง scroll เข้าจอวัดได้ 44 — สคริปต์วัดต้องเลื่อนการ์ดเข้าจอก่อน |
| MOB-22 | skip link กว้าง 1px („ข้ามไปยังเนื้อหาหลัก") | both | — | ไม่ใช่ข้อบกพร่อง | `sr-only` จนกว่าจะได้รับ focus ด้วยคีย์บอร์ด — ไม่ใช่เป้าหมายสัมผัส; ไม่ปรากฏบนจอให้แตะ |
| MOB-23 | `100vh` ทำแถวล่างหลุดใต้ URL bar บน iOS | iOS | Medium | ปิดแล้วในรอบก่อน (ยืนยันที่ HEAD) | โค้ด storefront ใช้ `dvh` แล้ว; `100vh` ที่เหลืออยู่มีเพียง `src/app/docs/manual/manual.module.css` ซึ่งเป็นหน้าพิมพ์/เอกสารภายใน ไม่ใช่หน้าใช้งานมือถือ |
| MOB-24 | พื้นที่เลื่อนของ drawer/search ยัง scroll ทะลุไปหน้าเบื้องหลังบน Android | Android | Medium | ปิดแล้ว `5f0505e` (ยืนยันที่ HEAD) | `overscroll-contain` อยู่บนพื้นที่เลื่อนของทั้งสอง overlay ที่ `81ccf00` ยังคงอยู่; Android จริงยังไม่ได้ทดสอบ |
| MOB-25 | ปุ่มปิดตะกร้าเล็กกว่า 44px | both | High | ปิดแล้ว `5f0505e` (ยืนยันที่ HEAD) | วัดได้ 44×44 ใน Chromium ทั้งสองความกว้าง (e2e + สคริปต์ตรวจ) |
| MOB-26 | taskbar ล่าง/ปุ่มหลักเล็กกว่า 44px | both | High | ปิดแล้ว `5f0505e` (ยืนยันที่ HEAD) | e2e „mobile taskbar items are ≥44px tall" ผ่าน; ปุ่มแจ้งเตือน/หัวใจที่เหลือแก้เพิ่มใน `06846fe` |
| MOB-27 | theme-color ของ Android และ safe-area ของ navbar | Android | Low | ปิดแล้ว `5f0505e` / `06846fe` | `viewport.themeColor` มี light `#FFF7ED` / dark `#3A2A18`; navbar/แถบประกาศไม่ต้องใช้ inset บนเพราะ Safari วาง layout ใต้ browser chrome — cover ใช้กับ standalone เป็นหลัก |

## เครื่องจริงเท่านั้น (device-only) — สิ่งที่ทำแล้วและยังไม่ได้ทำ

รายการต่อไปนี้ **ไม่ถูกนับว่าผ่าน** เพราะ Chromium จำลองไม่ได้:

1. **iOS swipe-back gesture (WebKit)** — โค้ดผูก `popstate` ตัวเดียวกับปุ่ม back และทดสอบแล้วว่า pop แล้วปิด overlay ถูกตัว/URL ไม่เปลี่ยน; แต่ท่าทางสไวป์จากขอบจอเองยังไม่ได้รันบน iPhone
   วิธีตรวจ: เปิด Safari บน iPhone → เปิดตะกร้า → สไวป์จากขอบซ้าย → ต้องปิดตะกร้าและยังอยู่หน้าเดิม → สไวป์อีกครั้งจึงออกจากหน้า
2. **Rubber-band ของหน้าเบื้องหลัง** — ล็อกด้วย `position:fixed` + คืน `scrollY` เป๊ะ ซึ่งเป็นวิธีที่ iOS ต้องใช้; การเด้งจริงของ WebKit ยังไม่ได้เห็นบนเครื่อง
   วิธีตรวจ: เปิดตะกร้าบน iPhone → ลากขึ้น/ลงแรงๆ บริเวณขอบ overlay → หน้าเบื้องหลังต้องนิ่ง → ปิดแล้วกลับไปตำแหน่งเดิม
3. **ติ่งจริง / home indicator** — พิสูจน์เฉพาะ „ท่อ" ของ inset (ตั้ง `--nk-safe-bottom: 34px` แล้ว taskbar กับ content spacer โตตาม 34px พร้อมกัน) ยังไม่ได้เห็นค่าจริงจากอุปกรณ์มีติ่ง หรือในโหมด Add to Home Screen
   วิธีตรวจ: เปิดบน iPhone มีติ่ง (portrait + landscape) → taskbar ต้องไม่ทับ home indicator, ปุ่มลอย (LINE/เลื่อนขึ้นบน) ต้องลอยเหนือ taskbar, เนื้อหาต้องไม่ถูกติ่งด้านข้างบังในแนวนอน
4. **การแปลง HEIC ของ iOS** — ยังไม่ได้อัปโหลดรูปจากอัลบั้ม iPhone จริง; ฝั่งแอปปฏิเสธ HEIC อย่างชัดเจนอยู่แล้ว จึงไม่มีความเสี่ยงข้อมูลเสียหาย
   วิธีตรวจ: เลือกรูป HEIC จากอัลบั้มในหน้าอัปโหลดสลิป → ต้องได้ไฟล์ JPEG (iOS แปลงให้) และอัปโหลดผ่าน หรือได้ข้อความ „รองรับเฉพาะไฟล์ภาพ JPG/PNG/WebP"
5. **Android จริง** — ทุกตัวเลขวัดใน Chromium mobile emulation; ยังไม่ได้ลอง Chrome บนเครื่อง Android จริง (โดยเฉพาะ `overscroll-contain` และ Pull-to-Refresh)

## Gate และตัวเลขจริง ณ commit นี้

| Gate | ผล |
| --- | --- |
| `npx tsc --noEmit` | ผ่าน (0) |
| `npm run lint` (`eslint . --max-warnings=0`) | ผ่าน (0) |
| `npm test` (vitest) | 122 ไฟล์ผ่าน / 2 skipped (124), 1125 tests ผ่าน / 5 skipped (1130) |
| `npm run build` | ผ่าน (0) |
| `npx playwright test e2e/touch-targets.spec.ts` | 9 ผ่าน / 1 skipped (consent banner ไม่แสดงเมื่อมี consent แล้ว) |
| สคริปต์วัดมือถือ 390×844 + 360×800 | ผ่านทุกข้อ: viewport-fit, safe-area ±34px, 44px ของคอนโทรลที่ระบุ, overlay 24 checks |
| `docs/quality-gates.md` | ยังคงมี `MOB-OVL` และ gate เดิมครบ; เพิ่มเคส safe-area ใน e2e เดิมโดยไม่เพิ่มไฟล์ test |

หมายเหตุ: ตัวเลข 44px ในตารางคือ `getBoundingClientRect()` หลังเลื่อนการ์ดเข้าจอและรอแอนิเมชันจบ; ค่าที่วัดได้ระหว่าง reveal คือ 43.6px ตาม MOB-21
