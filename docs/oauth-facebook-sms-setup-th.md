# สมัคร Facebook Login + SMS OTP (เบอร์โทร) สำหรับลูกค้า

ต่อจาก `oauth-keys-setup-th.md` (Google/LINE) — เอกสารนี้คือขั้นตอนเปิดช่องทางที่เหลือ
ปุ่มแต่ละช่องทางจะแสดงบนหน้า login เองเมื่อใส่คีย์ครบ (ไม่ต้องแก้โค้ดเพิ่ม)

## ส่วนที่ 1 — Facebook Login

1. เปิด https://developers.facebook.com/apps → **Create App** → เลือกประเภท **Business** (หรือ Consumer) ตั้งชื่อ เช่น Nong-Kati
2. ในแดชบอร์ดของแอป เพิ่มสินค้า **Facebook Login**
3. **Settings → Basic** → คัดลอก **App ID** และ **App secret**
4. **Facebook Login → Settings** → **Valid OAuth Redirect URIs** ใส่:
   ```
   https://nong-kati.vercel.app/api/v1/auth/oauth/facebook/callback
   ```
   (ถ้าอยากให้ preview ใช้ได้ด้วย เพิ่ม `https://nong-kati-git-master-natohms-projects.vercel.app/api/v1/auth/oauth/facebook/callback`)
5. แอปต้องอยู่โหมด **Live** แล้วผ่าน App Review สำหรับสิทธิ์ `email` ก่อนขึ้น production จริง (โหมด dev ใช้ได้เฉพาะผู้ที่ถูกเพิ่มเป็น tester/developer)
6. ใส่คีย์ใน Vercel:
   ```bash
   npx vercel env add NK_FB_APP_ID production
   npx vercel env add NK_FB_APP_SECRET production
   ```

## ส่วนที่ 2 — SMS OTP (เข้าสู่ระบบด้วยเบอร์โทร)

ใช้ **Twilio** ส่ง SMS (รองรับเบอร์ไทย):

1. สมัคร https://www.twilio.com → ซื้อเบอร์ SMS (หรือใช้เบอร์ trial ก่อน)
2. จาก Console คัดลอก **Account SID** (`AC...`), **Auth Token** และเบอร์ผู้ส่ง
3. ใส่ใน Vercel:
   ```bash
   npx vercel env add NK_TWILIO_ACCOUNT_SID production
   npx vercel env add NK_TWILIO_AUTH_TOKEN production
   npx vercel env add NK_TWILIO_FROM_NUMBER production
   ```
4. ทดสอบบนเครื่องโดยไม่ต้องมี Twilio: ตั้ง `NK_OTP_DEV_MODE=1` ใน `.env.local` — ระบบจะพิมพ์รหัส 6 หลักลง console ของ dev server แทนการส่ง SMS

> หมายเหตุ: ลูกค้าที่ล็อกอินด้วยเบอร์โทรครั้งแรกจะถูกสร้างบัญชีใหม่และพาไปหน้า
> ตั้งค่า (`/account/settings`) ให้กรอกอีเมลจริงต่อ — ลูกค้าเก่าที่บันทึกเบอร์ไว้ใน
> โปรไฟล์แล้วจะเข้าสู่ระบบบัญชีเดิมได้ทันทีเมื่อยืนยัน OTP ผ่าน

## สรุปตัวแปรแวดล้อมทั้งหมดของช่องทางล็อกอิน

| ช่องทาง | ตัวแปร | ปุ่มบนหน้า login |
|---|---|---|
| Google | `NK_GOOGLE_CLIENT_ID` / `NK_GOOGLE_CLIENT_SECRET` | "ดำเนินการต่อด้วย Google" |
| LINE | `LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET` | "ดำเนินการต่อด้วย LINE" |
| Facebook | `NK_FB_APP_ID` / `NK_FB_APP_SECRET` | "ดำเนินการต่อด้วย Facebook" |
| เบอร์โทร (SMS OTP) | `NK_TWILIO_ACCOUNT_SID` / `NK_TWILIO_AUTH_TOKEN` / `NK_TWILIO_FROM_NUMBER` (หรือ `NK_OTP_DEV_MODE=1`) | ฟอร์มเบอร์โทร + รหัส 6 หลัก |
