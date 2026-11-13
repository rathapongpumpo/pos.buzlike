# BUZLIKE POS

**Production บน Hostinger ใช้ MySQL/MariaDB ตามข้อกำหนดล่าสุด:** [คู่มือติดตั้ง Hostinger MySQL](docs/operations/hostinger-mysql.md) และ `.env.mysql.example` โค้ดเลือก schema/migration แยกตาม provider และเก็บ PostgreSQL เดิมสำหรับข้อมูล local ที่มีอยู่ ไม่ได้บังคับใช้ฐานข้อมูลภายนอก

ข้อกำหนดล่าสุดและแผนปรับโครงสร้าง: [แบบระบบ v2](docs/architecture/pos-saas-v2.md) / [SQL blueprint](docs/architecture/pos-saas-v2.sql) — ร้านสมัครใหม่เริ่มเปล่าแล้ว ส่วนแบบฐานข้อมูล v2 ตรวจสอบแยกและยังไม่ได้ใช้แทน schema ของแอป

แผน UX ฉบับละเอียดและเกณฑ์รับงาน: [สมัครและเริ่มตั้งร้าน](docs/signup-onboarding-ux-plan.md)

ระบบ POS SaaS ตาม `buzlike_pos_saas_srs.md` บน Next.js 15, TypeScript strict, Tailwind, Radix/shadcn-style UI, PostgreSQL/Prisma และ Auth.js v5

## เปิดใช้งานบนเครื่องนี้

ระบบอยู่ที่ **http://localhost:3100** (ใช้โดเมนเดิมตลอดเพื่อไม่ให้ session/คิวออฟไลน์แยกกัน)

```powershell
cd D:\Projects\1.buzlike\pos.buzlike
npm ci
npm run setup
```

เปิด PostgreSQL ใน terminal แรก:

```powershell
npm run db:local
```

จาก terminal ที่สอง:

```powershell
npm run db:migrate
npm run db:seed
npm run build
npm start
```

พัฒนาใช้ `npm run dev` แทน build/start ห้ามรัน dev และ build พร้อมกันใน checkout เดียวกัน

`setup` สร้าง `.env` พร้อมรหัสสุ่มเฉพาะเครื่อง ไม่ทับค่าที่มีอยู่ บัญชีเจ้าของร้านคือ `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` และผู้ดูแลคือ `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` ในไฟล์นั้น ร้านเริ่มต้น `/buzlike-cafe/pos` มี PIN `1234` ให้เปลี่ยนข้อมูลก่อนนำไปใช้จริง หรือสมัครร้านของคุณเองผ่าน `/register`

ฐานข้อมูลเก็บใน `data/postgres` และสลิปใน `data/slips` ไม่อยู่ใน public หรือ git; seed ซ้ำไม่ล้างยอดขายหรือเปลี่ยนรหัสบัญชีเดิม

## เส้นทางใช้งาน

- `/` และ `/pricing`: แพ็กเกจ/สมัครทดลองฟรี
- `/register` → `/verify-email` → `/onboarding`: บัญชีใหม่ยืนยันอีเมลก่อนตั้งชื่อ/ประเภทร้านและ PIN ใน 2 ขั้นตอน ระบบสร้างลิงก์ร้านให้เอง เริ่มจากร้านเปล่า มี draft ชื่อ/ประเภทร้านและ request key ป้องกันสร้างซ้ำ
- `/forgot-password` → `/reset-password`: ลิงก์ใช้ครั้งเดียว 30 นาที เปลี่ยนรหัสแล้ว session ทุกเครื่องหมดสิทธิ์ ต้อง login ใหม่
- หน้าพนักงาน → เชิญทางอีเมล → `/invite`: ผู้รับใช้บัญชีอีเมลเดียวกับคำเชิญ ยืนยันอีเมลและตั้ง PIN เอง เจ้าของกำหนดบทบาท/สาขาและส่งใหม่/ยกเลิกได้
- `/{storeSlug}/pos`: เครื่องขาย, modifiers, บาร์โค้ด, พักบิล, ส่วนลด, เงินสด/พร้อมเพย์/บัตร, แบ่งจ่าย, ใบเสร็จ
- `/{storeSlug}/dashboard`, `/orders`, `/products`, `/inventory`, `/tables`, `/kds`, `/shifts`, `/staff`, `/settings`, `/billing`
- `/{storeSlug}/cfd`: จอลูกค้าในเบราว์เซอร์/โปรไฟล์เดียวกับเครื่องขาย ใช้ BroadcastChannel
- `/m/{tableToken}`: เมนูลูกค้า ไม่ต้องล็อกอิน QR หมดอายุเมื่อปิด/ย้ายโต๊ะ
- `/superadmin`: ร้านค้า แพ็กเกจ คูปอง ตรวจสลิป อนุมัติและขยายเวลาทดลอง

## พฤติกรรมสำคัญ

ราคาสินค้า ตัวเลือก VAT ส่วนลด ยอดชำระ และสต็อกตรวจฝั่งเซิร์ฟเวอร์ ใช้จำนวนสตางค์ในการคำนวณเงิน/ปัดเศษ จัดการการชนกันด้วย PostgreSQL Serializable transaction และ advisory lock มี unique key `(tenantId, clientOrderId)` และ hash ของคำขอเพื่อป้องกันการส่งบิลซ้ำที่เปลี่ยนยอด

ครัวรับข้อมูลผ่าน SSE และตรวจ revision จาก PostgreSQL ทุก 1.5 วินาที ใช้ได้ข้าม process โดยไม่พึ่งหน่วยความจำใน process เดียว เมื่อตั้ง Redis จะ publish/subscribe เพื่อแจ้ง refresh ทันที และยังใช้ revision จากฐานข้อมูลเป็น fallback

ออฟไลน์ใช้ Zustand + IndexedDB/Dexie เก็บแคตตาล็อก บิลพัก และคิวเฉพาะบัญชี/ร้าน Service worker เก็บ shell หน้า POS และ static assets สำหรับกลับเข้าหน้าเดิม ต้องเปิดร้านออนไลน์ก่อนครั้งแรก รองรับขายเงินสดและพิมพ์ใบเสร็จชั่วคราว `OFFLINE-*` เมื่อเชื่อมต่อจะส่งด้วย UUID เดิม บิลที่สต็อกไม่พอ/กะปิด/แพ็กเกจหมดอายุ/สิทธิ์เปลี่ยน จะขึ้นสถานะต้องตรวจสอบ ไม่ลบทิ้งหรือแสร้งว่าซิงก์สำเร็จ ห้ามล้างข้อมูลเบราว์เซอร์ก่อนคิวเป็นศูนย์

## บริการภายนอก

กรอกค่าผ่าน environment ตาม `.env.example`:

| บริการ | ค่าที่ใช้ | สถานะเริ่มต้น |
|---|---|---|
| Google OAuth | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | ไม่แสดงปุ่มจนตั้งค่าครบ |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | ปิด checkout จนตั้งค่า |
| โอนค่าสมาชิก | `PLATFORM_PROMPTPAY_ID` | ปิดจนมีบัญชีรับเงินจริง |
| อีเมลยืนยัน/กู้บัญชี/คำเชิญ/ใบเสร็จ | `SMTP_*` และ `npm run email:worker` | เก็บ outbox พร้อม lease/retry/dead letter; Compose มี email-worker แยก ยังต้องตั้งค่าและตรวจ mailbox จริง |
| Redis | `REDIS_URL` | optional; SSE ใช้ revision ใน PostgreSQL |

Stripe webhook: `POST /api/webhooks/stripe` ตรวจ signature จาก raw body, ป้องกัน event ซ้ำ, ตรวจยอดและสกุลเงินก่อนเปิดสิทธิ์ รองรับ checkout paid/async success, invoice paid/failed และ subscription deleted. PromptPay หน้าร้านเป็น QR ของร้าน: แคชเชียร์ต้องตรวจยอดเงินจริงและกรอกเลขอ้างอิง การสร้าง QR ไม่ใช่หลักฐานว่าได้รับเงินแล้ว

สลิปค่าสมาชิกเก็บไฟล์ส่วนตัว ตรวจ PNG/JPEG magic bytes และขนาดสูงสุด 5 MB ใช้การอนุมัติโดย Super Admin ตามทางเลือกใน SRS ยังไม่ได้ต่อผู้ให้บริการตรวจสลิปอัตโนมัติหรือ LINE ภายนอก

ใบเสร็จค่าสมาชิกเป็นเอกสาร HTML พิมพ์ได้ การออก e-Tax อย่างเป็นทางการยังต้องมีข้อมูลผู้ประกอบการและเชื่อมบริการที่เกี่ยวข้อง

## ทดสอบ

```powershell
npm run typecheck
npm test
npm audit
```

ก่อน `npm test` ให้เปิดฐานข้อมูลและแอปที่ port 3100 ชุด domain ใช้ transaction แล้ว rollback; ชุด HTTP สร้างร้าน `http-*` แยกต่างหาก ไม่แก้ข้อมูลร้านจริง รายงานผลและภาพหน้าจออยู่ใน `docs/verification.md` และ `docs/evidence/`

## Deploy / Self-host

สำหรับ Hostinger/MySQL ให้ใช้ [คู่มือ MySQL ฉบับปัจจุบัน](docs/operations/hostinger-mysql.md) แทน Compose/PostgreSQL ด้านล่าง

เชื่อม repository กับ Hostinger: [คู่มือ GitHub → Hostinger](docs/operations/hostinger-github.md) — เลือก branch `main`, Node.js 22.x, Next.js และ build `npm run build`; ต้องเตรียม PostgreSQL, workers และพื้นที่เก็บสลิปแยกตามชนิด hosting

คู่มือเตรียมนำร่อง production, workers, health/alerts, backup/restore และ rollback: [Pilot deployment](docs/operations/pilot-deployment.md) · [ผลตรวจเฟส D ใน local](docs/phases/pilot-d.md) ยังไม่มีการ deploy หรือเปิดรับร้านจริงในรอบนี้


ใช้ Node.js 22+ และ PostgreSQL 16+ หรือ Neon/Supabase; ต้องเป็นโฮสต์ที่รัน Node และเปิด SSE ได้ ไม่ใช่ PHP hosting อย่างเดียว ตั้ง `DATABASE_URL`, `AUTH_SECRET` สุ่มยาว, `AUTH_URL` และ `NEXT_PUBLIC_APP_URL` เป็น HTTPS โดเมนจริง จากนั้น `npm ci`, `npm run db:migrate`, `npm run build`, `npm start` พร้อม reverse proxy ที่ปิด buffering สำหรับ SSE สำรองฐานข้อมูลและ `data/slips` เสมอ ไม่เปิด PostgreSQL ให้สาธารณะ

Lifetime ดาวน์โหลดข้อมูล JSON ได้จากหน้าแพ็กเกจ แล้วนำเข้าฐานข้อมูล Self-host **ที่ยังไม่มีร้านค้า** ได้ด้วย `npm run data:import -- path/to/store-export.json` ก่อนนำเข้าให้ migrate และ seed แพ็กเกจโดยตั้ง `SEED_DEMO=false` พร้อมตั้ง `IMPORT_OWNER_EMAIL`, `IMPORT_OWNER_PASSWORD` (10 ตัวอักษรขึ้นไป), `IMPORT_OWNER_PIN` ใน environment ของเครื่องปลายทาง ห้ามใช้ค่าบัญชี Cloud เดิมเป็นรหัสเริ่มต้น

นำเข้าสินค้า ตัวเลือก สูตร สต็อก บิล การชำระเงิน กะ เงินเข้า/ออก และ audit log ใน transaction เดียว สร้างบัญชีเจ้าของใหม่ หมุน QR โต๊ะ และปิดบัญชีพนักงานอื่นจนเจ้าของตั้ง PIN ใหม่ ทดสอบ round-trip บน PostgreSQL schema แยกแล้ว ไม่รองรับการ merge ทับร้านเดิมหรือการส่งออกสลิปค่าสมาชิก

ยังไม่มีการ deploy หรือแก้ DNS ของ `pos.buzlike.com` และไม่ได้แก้ไขโปรเจ็กต์ `demo-system`
