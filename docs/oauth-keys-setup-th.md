# Google OAuth Setup — คู่มือสำหรับคุณโอห์ม (ทำตามทีละข้อ ~10 นาที)

**สิ่งที่ผมค้นพบ:** ใน Vercel มี `NK_GOOGLE_CLIENT_ID` / `NK_GOOGLE_CLIENT_SECRET` อยู่แล้ว แต่**ค่าเป็นค่าว่าง** (สร้างค้างไว้ 30 วันก่อน ไม่เคยใส่คีย์จริง) — และ LINE ยังไม่มีคีย์เลย เลยต้องสร้างกุญแจจริงก่อน ปุ่มถึงจะขึ้น

ผมแก้โค้ดเรียบร้อยแล้ว (รับทั้งชื่อ `NK_GOOGLE_*` และ `GOOGLE_*`) — เหลือแค่คุณสร้างกุญแจแล้วส่งมาให้ผม (หรือใส่เองก็ได้)

---

## ส่วนที่ 1 — Google (ต้องใช้บัญชี Google ของคุณ)

1. เปิด https://console.cloud.google.com/apis/credentials (ล็อกอินด้วยบัญชี Google ที่คุณใช้เป็นเจ้าของเว็บ)
2. ถ้าขึ้นหน้าให้สร้าง **Project** ใหม่ → ตั้งชื่อ `Nong-Kati` → Create → เลือก project นี้
3. ที่หน้า **Credentials** กด **+ CREATE CREDENTIALS → OAuth client ID**
4. ถ้ามันบังคับให้ตั้ง **OAuth consent screen** ก่อน:
   - User Type เลือก **External** → Create
   - กรอกแค่: App name = `Nong-Kati`, User support email = อีเมลคุณ, Developer contact = อีเมลคุณ
   - กด Save ผ่านทุกหน้า (Scopes ไม่ต้องเพิ่ม, Test users ไม่ต้องใส่ — จะเป็น *Testing* ก็ยังใช้ได้เฉพาะอีเมลคุณ; จะให้ทุกคนใช้ได้ต้องกด **PUBLISH APP** ภายหลัง)
5. กลับมา **+ CREATE CREDENTIALS → OAuth client ID**:
   - Application type: **Web application**
   - Name: `Nong-Kati web`
   - **Authorized redirect URIs** → กด **ADD URI** แล้ววาง:
     ```
     https://nong-kati.vercel.app/api/v1/auth/oauth/google/callback
     ```
     (ถ้าอยากให้ preview ใช้ได้ด้วย เพิ่มอีกบรรทัด: `https://nong-kati-git-master-natohms-projects.vercel.app/api/v1/auth/oauth/google/callback` — หรือบอกผมทีหลังค่อยเพิ่ม)
6. กด **Create** → จะได้ป็อปอัปแสดง **Client ID** (หน้าตาประมาณ `1234567890-abc123.apps.googleusercontent.com`) และ **Client secret** (`GOCSPX-...`)
7. **คัดลอกสองค่านี้ส่งให้ผมในแชทนี้** (หรือจะใส่ Vercel เองตามส่วนที่ 3 ก็ได้)

## ส่วนที่ 2 — LINE (ข้ามไว้ก่อนตามที่คุณบอก — ทำภายหลังเมื่อพร้อม)

1. เปิด https://developers.line.biz/console/ ล็อกอินด้วยบัญชี LINE
2. สร้าง **Provider** (ชื่ออะไรก็ได้ เช่น Nong-Kati) → **Create a LINE Login channel**
3. แท็บ **LINE Login** → Callback URL ใส่:
   ```
   https://nong-kati.vercel.app/api/v1/auth/oauth/line/callback
   ```
4. แท็บ **Basic settings** → เปิด **Email address permission** (ต้องใส่อีเมลในช่อง email ของ channel ก่อน)
5. คัดลอก **Channel ID** + **Channel secret** ส่งให้ผม

## ส่วนที่ 3 — ใส่คีย์ใน Vercel (ให้ผมทำก็ได้)

ถ้าคุณส่งค่ามาให้ผม ผมจะรันคำสั่งเหล่านี้เอง (ไม่ต้องทำอะไร) แต่ถ้าจะใส่เอง:

```bash
cd webapp/nong-kati/nong-kati
npx vercel env add GOOGLE_CLIENT_ID production        # วาง Client ID แล้วกด Enter
npx vercel env add GOOGLE_CLIENT_SECRET production    # วาง Client secret
npx vercel env add GOOGLE_CLIENT_ID preview
npx vercel env add GOOGLE_CLIENT_SECRET preview
npx vercel --prod
```

> ผมจะลบ `NK_GOOGLE_CLIENT_ID/SECRET` ตัวเปล่าทิ้งเพื่อไม่ให้สับสน (โค้ดใหม่ใช้ชื่อไหนก็ได้) ปุ่ม **"ดำเนินการต่อด้วย Google"** จะโผล่ทันทีที่ production ได้ build ใหม่หลังใส่คีย์ — LINE จะยังซ่อนจนกว่าจะมีคีย์ LINE
