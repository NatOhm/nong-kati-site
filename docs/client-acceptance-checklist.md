# Client Acceptance Checklist — ครบทุกข้อในลิสต์ล่าสุด

ทุกข้อจากลิสต์ล่าสุดของลูกค้า เรียงตามหมวดเดิม พร้อมสถานะจริงจากโค้ดและเว็บ
(https://nong-kati.vercel.app) — ✅ ใช้ได้แล้ว · 🟡 มีส่วนใหญ่ (ขาดเล็กน้อย) · ⬜ ยังไม่ทำ
ตัวย่อ: MP = `/management` (แผงแอดมิน) · ทดสอบด้วยบัญชีจาก `docs/customer-login-test.md`

---

## A. Admin capabilities

| #   | Item                                                                | Status | Evidence / วิธีทดสอบ                                                                                                                                                                        |
| --- | ------------------------------------------------------------------- | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Manage products: add, remove, edit details, prices, images          |   ✅   | MP → สินค้า — CRUD ครบ + อัปโหลดรูปผ่าน `/api/v1/admin/upload`; ลบ = ซ่อนจากหน้าร้านทันที                                                                                                   |
| A2  | Manage categories and tags                                          |   ✅   | MP → หมวดหมู่ (แผนผังกลุ่มใหญ่/ย้าย/เรียง/ซ่อน) + MP → แท็ก (สร้าง/เปลี่ยนชื่อ/ลบ + นับสินค้า)                                                                                              |
| A3  | Manage stock: deduct/restock, record in/out, update after purchases |   ✅   | MP → คลังสินค้า (แก้สต๊อก + บันทึกเข้า-ออก) + ตัดจริงอัตโนมัติเมื่อยืนยันการชำระเงิน (fulfilment engine เขียน StockMove)                                                                    |
| A4  | Add multiple products at once                                       |   ✅   | MP → สินค้า → นำเข้า CSV (วาง/อัปไฟล์, upsert ตาม SKU, รายงานรายแถว) + **ราคาสมาชิก/ตัวแทนทีเดียว** สำหรับ % ราคาทั้งเว็บ                                                                   |
| A5  | Member/reseller pricing tiers (retail vs wholesale)                 |   ✅   | ตั้ง memberPrice/dealerPrice ต่อ variant ในหน้าสินค้า; ลูกค้าเห็นราคาตาม tier ทุกหน้า; ออเดอร์บันทึกราคาจริงฝั่งเซิร์ฟเวอร์; ปรับ tier ลูกค้าใน MP → ลูกค้า; ทดสอบ §D ในเอกสารล็อกอินลูกค้า |
| A6  | Verify payments                                                     |   ✅   | MP → คำสั่งซื้อ → ปุ่ม **ยืนยันการชำระเงิน** → ตัดสต๊อก + ส่งโค้ด + แจ้ง Discord อัตโนมัติ                                                                                                  |
| A7  | Detailed stock-management history                                   |   ✅   | MP → คลังสินค้า → ตารางประวัติอ่านจาก StockMove จริงทุกรายการ (ขาย/รับเข้า/ปรับมือ)                                                                                                         |
| A8  | Coupons & basic promotions (fixed/%, min purchase, expiry)          |   ✅   | MP → คูปองส่วนลด — บาท/%, ยอดขั้นต่ำ, วันหมดอายุ, จำกัดจำนวน; ใช้โค้ดได้ตอนเช็คเอาต์จริง                                                                                                    |
| A9  | **Automatically verify payment slips**                              |   ⬜   | ยังเป็นมือจับ (แอดมินกดยืนยันเอง — ใช้งานได้ปกติ) มีแผน+เปรียบเทียบราคาพร้อมที่ `docs/payment-verification-plan.md` **รอการตัดสินใจเลือกผู้ให้บริการ**                                      |
| A10 | Low-stock & new-order alerts (Discord)                              |   ✅   | `notify.ts` — แจ้งออเดอร์ใหม่ / ยืนยันชำระเงิน / สต๊อกต่ำกว่า threshold ไป Discord webhook; ตั้งค่า MP → ตั้งค่า → การแจ้งเตือน                                                             |
| A11 | Multiple admin/member permission levels                             |   ✅   | RBAC 3 บทบาท (super_admin / catalogue_manager / order_manager) + ล็อกอิน 2FA; ทดสอบด้วย 3 บัญชี seed ในเอกสารล็อกอิน                                                                        |
| A12 | Reseller/member purchasing statistics incl. per-member sales        |   🟡   | Dashboard มีสถิติลูกค้ารวม (จำนวน/ยอดซื้อ) + ระบบ tier dealer ใช้งานได้ — **ยังไม่มีหน้าสรุปยอดขายแยกรายตัวแทน** ต้องยืนยันหน้าตาที่ต้องการก่อน                                             |
| A13 | Basic sales summaries: units sold, total revenue                    |   ✅   | Dashboard: ยอดขายวันนี้/เดือนนี้, รายได้รวม, กราฟรายวัน — ตัวเลขจริงจาก DB                                                                                                                  |
| A14 | Accounting & profit: cost vs price, gross profit, COD summary       |   ✅   | Dashboard: profitReport (รายได้ − ส่วนลด − ต้นทุน = กำไรขั้นต้น) + `costThb` ต่อสินค้า; เก็บเงินปลายทางสรุปในหน้าคำสั่งซื้อ (กรองตามช่องทางชำระ)                                            |
| A15 | Stock reports: best-selling & slow-moving/remaining                 |   🟡   | Dashboard มี **สินค้าขายดี** (topProducts จริง) + สต๊อกคงเหลือต่อ SKU ในคลัง — **สินค้าค้างสต๊อก (ขายไม่เดิน) ยังไม่มีรายงานแยก**                                                           |
| A16 | Theme customization: mouse/other icons, website background color    |   🟡   | MP → ตั้งค่า → ธีมและแอนิเมชัน: **เปลี่ยนสีธีมทั้งเว็บ (accent) + ความเร็วแอนิเมชัน** ได้จริง (ทดสอบแล้ว) — **เปลี่ยนรูปมาสคอต/ไอคอนหนูยังต้องแก้โค้ด** (ส่งไฟล์มาได้)                      |

## B. Homepage / purchase information

| #   | Item                                             | Status | Evidence                                                                                                            |
| --- | ------------------------------------------------ | :----: | ------------------------------------------------------------------------------------------------------------------- |
| B1  | "How to buy" (วิธีการซื้อ) at the top            |   ✅   | เป็น section แรกหลังประกาศ — 3 ขั้นตอน 01/02/03                                                                     |
| B2  | Clarify the referenced section & benefit         |   ✅   | การ์ดโค้ดตัวอย่างถูก**เอาออกถาวรตามที่ลูกค้าตัดสินใจ** — แทนด้วยป้าย "ส่งโค้ดทันที ภายใน 60 วินาที" ใน trust badges |
| B3  | Promo/banner section below purchase instructions |   ✅   | ส่วนโปรโมชั่นอยู่ใต้ วิธีการซื้อ (marquee เดิมถูกลบตามคำขอล่าสุด — โปรโมชั่นอยู่ใน hero carousel ที่แอดมินจัดการ)   |

## C. Navigation and announcements

| #   | Item                                                                 | Status | Evidence                                                                                                     |
| --- | -------------------------------------------------------------------- | :----: | ------------------------------------------------------------------------------------------------------------ |
| C1  | Icons → text labels: All products / Recommended / Favorites / Orders |   ✅   | เมนูข้อความ 4 ลิงก์ตรงตามลิสต์: สินค้าทั้งหมด · แนะนำ · รายการโปรด · คำสั่งซื้อ (FacebookNavbar `NAV_ITEMS`) |
| C2  | Favorites feature (liked/saved products)                             |   ✅   | หัวใจบนการ์ดทุกใบ + `/account/wishlist` + ตัวนับถูกใจจริงบนหน้าสินค้า + "ลูกค้าคนอื่นก็ถูกใจ" social proof   |
| C3  | Referenced area → announcement board                                 |   ✅   | กรอบประกาศ clay (เส้นประ + พื้นพีช) ใต้ hero: "📢 โค้ดเกม สตรีมมิ่ง และอีคอมเมิร์ซ ส่งถึงอีเมลใน 60 วินาที"  |
| C4  | Announcement board in a well-designed text box                       |   ✅   | กล่องขอบประกาศพร้อมปุ่ม เลือกซื้อสินค้า — อยู่ตำแหน่งเดียวกับที่ mockup ระบุ                                 |

## D. Layout changes

| #   | Item                                          | Status | Evidence                                                                            |
| --- | --------------------------------------------- | :----: | ----------------------------------------------------------------------------------- |
| D1  | Remove duplicated side section; keep top only |   ✅   | marquee ทั้งบนและล่างถูกลบ (คำขอล่าสุด) — เหลือแหล่งโปรโมชั่นเดียวคือ hero carousel |
| D2  | Remove circles, use numbers                   |   ✅   | Dashboard stats เป็น**ตัวเลขล้วนจาก DB** แนวนอน 4 ช่อง — วงกลม/แถบสีเดิมไม่มีแล้ว   |
| D3  | Make the referenced section horizontal        |   ✅   | ตัวเลขสถิติจัดแนวนอน 4 ช่อง (ลูกค้า/สินค้า/ขายแล้ว/สต๊อก)                           |
| D4  | Place it underneath                           |   ✅   | แถบสถิติอยู่**ท้ายหน้าแรก** ตาม mockup                                              |

## E. Search and profile

| #   | Item                                  | Status | Evidence                                                                                                                                                    |
| --- | ------------------------------------- | :----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Google-like autocomplete while typing |   ✅   | พิมพ์ ≥2 ตัว → ชื่อสินค้า slide ลงมา (debounce 250ms, `/api/v1/search/suggest`) ทั้ง navbar และ /search                                                     |
| E2  | Click profile → info like the example |   ✅   | Popover ครบ: ชื่อ+อีเมล, เครดิตคงเหลือ, ปุ่มเติมเงิน, ตั้งค่าโปรไฟล์, ประวัติการเดินเงิน, ออกจากระบบ — ทดสอบ live แล้ว (ทดสอบด้วย `qa-customer@test.local`) |

## F. Product organization and selection

| #   | Item                                                         | Status | Evidence                                                                                                                          |
| --- | ------------------------------------------------------------ | :----: | --------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Group by categories (Chinese apps, M365, streaming, editing) |   ✅   | แผนผัง 5 กลุ่มใหญ่ → 13 แอป (แอปดูหนัง/เพลง/เกม/ผลิตภัณฑ์/แอปจีน) — แอดมินจัดการเองได้ในหน้าหมวดหมู่                              |
| F2  | Opening a category shows admin-assigned apps/products        |   ✅   | หน้ากลุ่ม (เช่น แอปดูหนัง) แสดง tile ของแอปย่อย + จำนวนสินค้า                                                                     |
| F3  | Separate each app individually                               |   ✅   | tile รายแอป (Netflix, Prime Video, HBO MAX… พร้อมภาพ + ป้ายจำนวน) — ไม่ใช่การ์ดซ้ำเรียงแถว                                        |
| F4  | After selecting a product → navigate/pop to its page         |   ✅   | กดแอปที่มีสินค้าเดียว → ไปหน้าสินค้าทันที; หลายสินค้า → เข้าหมวดก่อน                                                              |
| F5  | Choose a package directly on that page                       |   ✅   | หน้าสินค้าใหม่: ① เลือกแพ็กเกจ (การ์ดกระดาน ไฮไลต์ขอบพีช) ② จำนวน + ปุ่มใส่ตะกร้า; /search ซื้อจากการ์ดได้ + quick-view เลือกราคา |
| F6  | The current referenced design/flow is not wanted             |   ✅   | การ์ด HBO ซ้ำๆ เรียงแถวถูกถอดออกจากหน้ากลุ่มแล้ว — เหลือที่ปลายทางคือหน้าสินค้าของแอปนั้น                                         |

## G. Member-profile additions

| #   | Item                                        | Status | Evidence                                                                           |
| --- | ------------------------------------------- | :----: | ---------------------------------------------------------------------------------- |
| G1  | Referenced value → remaining credit/balance |   ✅   | ภาพรวม: **เครดิตคงเหลือ** (จาก walletBalanceThb จริง) + popover เดียวกัน           |
| G2  | Spending for the current month              |   ✅   | ภาพรวม: **ค่าใช้จ่ายในเดือนนี้**                                                   |
| G3  | Top-ups for the current month               |   ✅   | ภาพรวม: **เติมเงินในเดือนนี้**                                                     |
| G4  | Total lifetime spending                     |   ✅   | ภาพรวม: **ยอดใช้จ่ายสะสม**                                                         |
| G5  | Referenced section → top-up history         |   ✅   | ภาพรวม: **ประวัติการเติมเงิน** (แทนคำสั่งซื้อล่าสุด — คำสั่งซื้อมีหน้าแยกอยู่แล้ว) |

---

## สรุป

- **✅ 33 ข้อ** · **🟡 3 ข้อ** (สรุปยอดขายรายตัวแทน · รายงานสินค้าค้างสต๊อก · เปลี่ยนรูปมาสคอต/ไอคอนในแอดมิน) · **⬜ 1 ข้อ** (ตรวจสลิปอัตโนมัติ — รอการตัดสินใจ มีแผนพร้อม)
- 🟡 ทั้ง 3 ข้อต้องการ **input จากลูกค้า**: หน้าตาของรายงานรายตัวแทน, นิยาม "ค้างสต๊อก" (กี่วันถึงนับ), และไฟล์รูปมาสคอตที่ต้องการ
- ⬜ ตรวจสลิป: ตัดสินใจ SlipOK (ฟรี 100 สลิป/เดือน) vs PromptPay gateway (1.65%/รายการ) — ตารางเทียบที่ `docs/payment-verification-plan.md`

_ตรวจจากโค้ดจริงทุกข้อ (ไฟล์/route อ้างอิงในตาราง) ณ 20 ก.ย. 2569 ·
บัญชีทดสอบ: `docs/customer-login-test.md` · สถานะเต็ม: `docs/client-feedback-status.md`_
