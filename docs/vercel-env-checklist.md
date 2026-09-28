# Vercel Production Fix Checklist — env, migrations, DNS

> สำหรับ: prod deploy พังตั้งแต่ commit `5d9ebad` (27 ก.ย.) — prod ยัง serve build เก่า `faa515a`
>
> **Root cause จากโค้ดจริง:** `5d9ebad` แก้ HIGH-1 โดยเปลี่ยน `siteUrl()`
> (`src/lib/fulfilment.ts`) จากเดิม "ไม่มี env → ใช้ localhost" เป็น
> **"production ไม่มี `NEXT_PUBLIC_SITE_URL` → throw ทันที (fail-closed)"** —
> ถูกต้องตามดีไซน์ แต่ env นี้ไม่ได้ถูกตั้งฝั่ง Vercel Production → ทุก build
> ตั้งแต่ commit นั้นล้ม ส่วน CI/ในเครื่องผ่านเพราะตั้ง env ครบใน job
>
> หลักการเติม env: **แก้ที่ต้นเหตุตัวเดียวก่อน (NEXT_PUBLIC_SITE_URL) → redeploy
> → แล้วค่อยเติมตัวอื่นตามตาราง** อย่ารอตั้งครบทุกตัวก่อนค่อย deploy

---

## 0. ก่อนเริ่ม — เก็บหลักฐาน (2 นาที)

- [ ] Vercel Dashboard → Project → **Deployments**: กด deploy ที่ fail ล่าสุด
      แล้วอ่าน **Build Logs** — คาดหวังเจอข้อความ
      `NEXT_PUBLIC_SITE_URL is required in production (customer-facing links would point at localhost)`
      (ถ้าเจอ error อื่น ให้จดไว้แล้วไล่ตาราง §2 ตามอาการ)
- [ ] Settings → Environment Variables: สกรีนช็อตรายการที่มีอยู่จริง ทั้ง 3 scope
      (Production / Preview / Development) — เช็คว่า env ที่มีอยู่ถูก scope ไว้เฉพาะ Preview หรือเปล่า
      (สาเหตุยอดฮิต: ตั้งไว้ตอนทดสอบ Preview แล้วลืมติ๊ก Production)

## 1. ตัวแก้ต้นเหตุ (ต้องมีก่อน redeploy ทุกตัว)

| สิ่งที่ต้องทำ | ค่า / วิธีทำ |
| --- | --- |
| [ ] เพิ่ม `NEXT_PUBLIC_SITE_URL` scope **Production + Preview** | ใส่ **origin จริงที่ผู้ใช้เข้าถึงได้** เช่น `https://nong-kati.vercel.app` (หรือโดเมนสุดท้ายเมื่อผูก DNS แล้ว) — **ห้ามมี `/` ท้าย, ห้ามเป็น localhost** |
| [ ] เข้าใจกลไก | `NEXT_PUBLIC_*` ถูก **inline ตอน build** → แก้แล้วต้อง **Redeploy** ถึงจะมีผล (แก้แล้วไม่ redeploy = ไม่มีผล) |
| [ ] Redeploy | Deployments → deploy ล่าสุด → ⋯ → **Redeploy** (ใช้ commit เดิมก็ได้) |

## 2. Env matrix ที่เหลือ — ตั้งตามลำดับความจำเป็น

ระดับ: **[P] = บังคับ ไม่มีได้ prod พังแน่** · **[S] = ควรมี (ปิด feature เสี่ยงถ้าขาด)** · **[O] = จะค่อยตั้งเมื่อเปิดฟีเจอร์นั้น**

### 2A. กลุ่ม [P] — ทำให้ deploy/build ผ่านและปลอดภัยขั้นต่ำ

| ตัวแปร | ค่าที่ตั้ง | หมายเหตุ |
| --- | --- | --- |
| `DATABASE_URL` | Supabase **pooler :6543** + `?pgbouncer=true&connection_limit=1` | serverless ต้องผ่าน pgbouncer |
| `DATABASE_DIRECT_URL` | Supabase **:5432 (session)** | ใช้รัน migration (vercel.json buildCommand เรียก `prisma migrate deploy` ทุก deploy) |
| `NK_JWT_SECRET` | ≥ 32 ตัวอักษรสุ่ม — `openssl rand -base64 48` | jwt.ts **throw ทันทีถ้า < 32** และ production ไม่มี dev fallback |
| `NK_GIFT_CODE_ENCRYPTION_KEY` | **64-hex** — `openssl rand -hex 32` | ต้อง **32 bytes (64 อักขระ hex)** พอดี — ค่าสั้นกว่านี้ AES-256 throw ตอนออกโค้ดจริง |
| `NK_GIFT_CODE_ENCRYPTION_KEY_V1` | ค่าเดียวกับด้านบน | รองรับ rotation ในอนาคต |
| `GIT_SHA` / `GIT_REF` | vercel.json ผูกไว้แล้ว (`vercel.git.commitSha`) | ตรวจว่าไม่ถูก override ด้วยค่าคงที่เก่า |

### 2B. กลุ่ม [S] — ความปลอดภัย/ระบบที่ต้องเปิดก่อนรับจริง

| ตัวแปร | ค่า | หมายเหตุ |
| --- | --- | --- |
| `NK_CSP_REPORT_ONLY` | `false` | โค้ดปัจจุบัน enforce nonce CSP อยู่แล้ว — ค่าเริ่มต้น (ไม่ตั้ง) = enforce; **อย่าตั้ง `true` ใน Production** |
| `NK_INTERNAL_TOKEN` | `openssl rand -hex 32` | ปิด `/api/v1/internal/*` (build-info, ops-health, outbox drain) |
| `NK_SLIP_OK_KEY` / `NK_SLIP_OK_BRANCH` | จาก SlipOK dashboard | ตรวจสลิปอัตโนมัติ — ถ้ายังไม่เปิด ระบบ fallback ให้แอดมินตรวจเอง |
| `NK_RESEND_API_KEY` / `NK_RESEND_FROM_EMAIL` | Resend + `noreply@…` (โดเมนที่ verify แล้ว) | อีเมลโค้ด/รีเซ็ตรหัส — outbox จะค้าง failed ถ้าขาด |
| `NK_OAUTH_TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32` | เข้ารหัส token จาก OAuth ของลูกค้า |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | จาก Upstash console | rate limit แบบ shared ข้าม instance; **เมื่อตั้งครบแล้วค่อยเพิ่ม `NK_RATE_LIMIT_STRICT=true`** (โหมดนี้ถ้า Upstash ล่มจะตอบ 503 fail-closed ไม่ fallback) |

### 2C. กลุ่ม [O] — เปิดเมื่อเปิดฟีเจอร์นั้น (ขาดได้ ระบบไม่ล้ม)

`NK_OMISE_PUBLIC_KEY/SECRET_KEY/WEBHOOK_SECRET` (เกตเวย์บัตร — ปัจจุบัน prod ใช้โอนเงิน+สลิป),
`NK_GOOGLE_CLIENT_ID/SECRET`, `LINE_CHANNEL_ID/SECRET`, `NK_FB_APP_ID/SECRET`,
`NK_TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER` (SMS OTP), `NK_SENTRY_DSN`,
`NK_BACKUP_ENCRYPTION_KEY`, `NK_CUSTOMER_JWT_PRIVATE_KEY/PUBLIC_KEY`,
`NK_ADMIN_JWT_PRIVATE_KEY/PUBLIC_KEY`, `NEXT_PUBLIC_CDN_URL`,
`SLIP_VERIFY_BASE_OVERRIDE` (**ห้ามตั้งใน prod** — ไว้ทดสอบเท่านั้น)

> ที่มาของรายชื่อ: grep `process.env[...]` ทั้ง `src/` + `.env.example` + `.env.vercel.md`
> (คู่มือเดิมใน repo ที่อธิบายวิธี generate ทีละตัวอยู่แล้ว)

## 3. Migrations ที่ prod DB ยังขาด (4 ตัวล่าสุด)

prod build เก่าคือ `faa515a` (27 ก.ย. ก่อนชุด identity/outbox/backup-codes/rls)
→ DB คาดว่าขาด 4 migrations ล่าสุด: `20260926140000_identity_hardening`,
`20260927000000_email_outbox`, `20260927100000_admin_backup_codes`,
`20260927200000_rls_baseline` (+ `20260927300000_revoke_stale_admin_sessions`)

- [ ] ยืนยันสถานะจริง: รัน `npx prisma migrate status` ที่เครื่อง โดยชี้ `DATABASE_DIRECT_URL`
      ไปที่ prod DB (Supabase → connection string session mode)
- [ ] ทางที่ถูก: **ปล่อยให้ deploy ที่ผ่านแล้วรัน migration เอง** (vercel.json
      `buildCommand` มี `prisma migrate deploy` — deploy แรกหลังแก้ env จะเติมให้)
- [ ] ถ้าต้องการรันมือ: ทำจากเครื่องเท่านั้น ด้วย `DATABASE_DIRECT_URL` ของ prod
      **ห้าม**ชี้ prod เข้า local หรือใช้ URL ทดสอบ

## 4. DNS / โดเมน (ตอนนี้ NXDOMAIN)

- [ ] เลือกก่อน: จะใช้ `nong-kati.vercel.app` เป็น canonical ไปก่อน หรือจะผูกโดเมนจริงทันที
      (`NEXT_PUBLIC_SITE_URL` ต้องเป็นค่าเดียวกับ canonical ที่เลือก)
- [ ] ถ้าผูกโดเมน: Domain → Add → ตั้ง record ตามที่ Vercel แนะนำ
      (APEX `@` → `76.76.21.21`, www → `cname.vercel-dns.com`)
- [ ] รอ DNS propagate (`nslookup <โดเมน>` กลับมาไม่ NXDOMAIN) แล้วค่อยใช้ใน
      `NEXT_PUBLIC_SITE_URL` + Force HTTPS

## 5. Verify หลัง deploy (รันตามลำดับ)

```bash
# 1) บ้านอยู่ไหม + รู้จักตัวเองไหม (SHA ต้องตรงกับ commit ที่ deploy)
curl -s https://<โดเมน>/ | grep -o "<title>[^<]*"
curl -s https://<โดเมน>/api/v1/version
#    → {"gitSha":"<commit ที่ deploy>","gitRef":"master"} — ต้องไม่เป็น SHA เก่า faa515a

# 2) CSP โหมด enforce (ไม่ใช่ Report-Only)
curl -s -D - -o /dev/null https://<โดเมน>/ | grep -i content-security-policy
#    → ต้องขึ้นต้น "content-security-policy:" ไม่ใช่ "…-report-only" และมี 'nonce-'

# 3) หน้าที่เคยพังจาก nonce bake-in (แก้แล้วใน 1e2dfad) — body ต้องไม่ว่าง
curl -s https://<โดเมน>/account/login | grep -c "เข้าสู่ระบบ"
curl -s -o /dev/null -w "%{http_code}\n" https://<โดเมน>/legal/privacy-policy

# 4) 404 จริง (ห้าม soft-404)
curl -s -o /dev/null -w "%{http_code}\n" https://<โดเมน>/product/not-exist-xyz   # → 404

# 5) DB ผ่าน pooler + มีสินค้า (แปลว่า migration ครบแล้วด้วย)
curl -s "https://<โดเมน>/api/v1/products?limit=1"

# 6) ผู้ซื้อจริง: ซื้อจนถึงขั้นสร้าง order (ช่องทางโอนเงิน)
#    หรือยิง POST /api/v1/orders จาก UI จริง — ห้ามใช้ production ยิงเทสซ้ำ

# 7) ลบความเสี่ยงจากค่าเดิมค้าง: เช็คว่าไม่มี dev-only env หลุดมา prod
#    NK_PAYMENT_MOCK / NK_OTP_DEV_MODE / SLIP_VERIFY_BASE_OVERRIDE ต้อง "ไม่มีใน Production"
```

- [ ] Build Logs ของ deploy ล่าสุด **เขียวทั้งงวด** (รวมขั้น `prisma migrate deploy`)
- [ ] เปิดหน้าจริงใน browser: หน้าแรก, `/search`, สินค้า, `/management/login`
      (แอดมินล็อกอิน 2FA สำเร็จ), ลองสั่งซื้อถึงหน้า confirmation
- [ ] DevTools Console สะอาด (ไม่มี CSP violation)
- [ ] อีเมลโค้ดถึงผู้รับจริง 1 ฉบับ (ยืนยัน Resend + outbox drain)

## 6. สัญญาณว่าแก้สำเร็จ

Deployments ล่าสุด = commit หัว `master` และ `/api/v1/version` รายงาน SHA เดียวกัน
→ จบอาการ "prod serve build เก่า" ที่เป็นมาตั้งแต่ `5d9ebad`
