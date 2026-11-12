# POS go-live readiness — ตรวจ 8 พฤศจิกายน 2026

อัปเดต SMTP: ตั้งค่า Hostinger และทดสอบส่งจริงผ่าน outbox/worker แล้ว รับถึง INBOX support@buzlike.com ทั้ง 2 ฉบับ SPF/DKIM/DMARC ผ่าน — [หลักฐาน](phases/smtp-live.md) ข้อความที่บอกว่า SMTP ยังไม่ตั้งค่าด้านล่างเป็นสถานะก่อนการทดสอบรอบนี้ การ deploy production และการตรวจ delivery ข้ามผู้ให้บริการยังอยู่เฟส 4–5

อัปเดตหลังเฟส 2: ยืนยันอีเมล/กู้รหัสผ่าน/คำเชิญทีม/worker อีเมล และ onboarding draft/idempotency ผ่าน local แล้ว, 38/38 tests ดู [รายงานเฟส 2](phases/phase-2.md) ต่อมาทดสอบ SMTP จริงผ่านแล้ว; payment lifecycle, production และ pilot ยังรอเฟส 3–5

อัปเดตหลังทำเฟส 1: branch grants และราคา/สต็อกแยกสาขาพัฒนาและตรวจ local แล้ว, 32/32 tests ผ่าน พร้อม browser มือถือ/tablet และ data-preservation check ดู [รายงานเฟส 1](phases/phase-1.md) และ [แผนเฟส 1–5](go-live-phases.md) การตัดเน็ตจริงของโค้ดใหม่/restore/load/provider/production ยังไม่ผ่านการตรวจ ส่วนผลประเมินเริ่มต้นด้านล่างเก็บไว้เป็นบริบทก่อนทำเฟส

ข้อสรุป: ยังไม่พร้อมเปิดรับสมาชิกแบบสมัคร–ชำระเงิน–ใช้งานเองครบ และยังไม่พร้อมขายความสามารถหลายสาขาฉบับเต็มตามเป้าหมาย การใช้งานหลักผ่านการตรวจใน local แล้ว แต่ยังมีงานผลิตภัณฑ์และงาน production ที่เป็นตัวขวาง

## ขอบเขตการตรวจครั้งนี้

- อ่านโค้ดปัจจุบัน, schema/migrations, checkout/webhook, email outbox, authorization, stock deduction, onboarding, Docker/Compose และเอกสารผลตรวจเดิม
- ตรวจเฉพาะว่าค่าใน `.env` มีหรือไม่มี ไม่คัดลอกค่าลับ: Stripe key/webhook secret, SMTP และ platform PromptPay ยังไม่ตั้งค่า; URL และฐานข้อมูลของ checkout นี้ยังเป็น local
- ไม่มี credentials หรือหลักฐานใหม่จาก production จึงไม่ยืนยันสภาพเซิร์ฟเวอร์/DNS/การตั้งค่าภายนอกจาก `.env` ในเครื่องนี้
- `npm audit --omit=dev` ครั้งนี้รายงาน 0 ช่องโหว่ที่ฐานข้อมูล npm รู้จัก ไม่ใช่ผล security audit ของ application หรือ infrastructure
- ผล build/25 tests และการเดินจริงผ่าน browser อ้างอิงผลตรวจ 6 พฤศจิกายนใน `verification.md`; ไม่ได้รันทดสอบเหล่านั้นใหม่ในรอบประเมินนี้ และไม่ได้แก้ product code

## ตัวขวางก่อนเปิดรับลูกค้าแบบ self-service

| ลำดับ | งานและสถานะปัจจุบัน | เกณฑ์จบก่อนเปิด |
|---|---|---|
| 1 | **วงจรชำระค่าสมาชิก** มี checkout, ตรวจลายเซ็น webhook, เปิดสิทธิ์และบาง renewal events แล้ว แต่ keys ยังไม่ตั้งและยังไม่มีหลักฐาน provider E2E/วงจรจัดการสมาชิกครบ ทางแนบสลิปต้องให้ admin อนุมัติ | เลือกแพ็กเกจ → สมัคร/ตั้งร้านโดยไม่ทำแพ็กเกจหาย → จ่าย → เปิดสิทธิ์บัญชีเดิมเอง; ผ่านจ่ายไม่สำเร็จ/ปิดแท็บ/เหตุการณ์ซ้ำหรือสลับลำดับ/ต่ออายุ/ยกเลิก/คืนเงิน; มีงานตรวจยอดและสิทธิ์ตกหล่น ไม่ต้องอนุมัติรายลูกค้า |
| 2 | **บัญชี — เฟส 2 ผ่าน local + SMTP จริง** verification/reset/session revocation/invitations, worker lease/retry/dead letter; ส่งและรับจริงใน support mailbox ผ่านแล้ว | deploy worker/URL production และตรวจปลายทางต่าง provider/monitoring ตามเฟส 4–5; รายละเอียดในรายงานเฟส 2 และ SMTP |
| 3 | **ข้อมูลและสิทธิ์หลายสาขา — เฟส 1 ผ่านใน local** เพิ่ม grants, ราคา/สต็อกรายสาขา และ ledger; migration รักษายอดเดิม, API/SSE/cache/replay/import และ UI ผ่านการตรวจตามรายงาน | ก่อน production ยังต้องตรวจเน็ตหลุดจริง/อุปกรณ์/โหลดและ pilot ในเฟส 5; เจ้าของตรวจนับและกระจายยอดสินค้าเดิมที่จัดเข้าสาขาหลัก |
| 4 | **ตั้งร้าน — เฟส 2 ผ่าน local** มี metadata draft/version/request key แล้ว ส่งซ้ำพร้อมกัน 4 คำขอได้ร้านเดียว และ reload กู้ชื่อ/ประเภทร้านได้ | การส่งต่อแพ็กเกจและ invoice/payment idempotency อยู่เฟส 3; การตัดเน็ตและ pilot อยู่เฟส 5 |
| 5 | **ติดตั้ง production และดูแลเมื่อระบบเสีย** มี Docker/Compose/migrations แต่เอกสารยังไม่มีผล deploy/restore/load จริง | โดเมน HTTPS, URL/cookies/secrets ถูกต้อง, DB ไม่เปิดสาธารณะ, storage ถาวร, bootstrap แพ็กเกจ/admin โดย `SEED_DEMO=false`, staging แยก, release/rollback ที่ทำซ้ำได้, backup DB/ไฟล์พร้อมซ้อม restore, health checks/logs/error+payment alerts และผู้รับผิดชอบเหตุขัดข้อง |
| 6 | **ตรวจบนสภาพใช้งานจริง** local มี POS sale/receipt, tests และ viewport evidence แล้ว; ยังไม่มีหลักฐานเครื่องพิมพ์จริงหรือโหลด production | ซ้อมสมัคร→จ่าย→เพิ่มสินค้า→เปิดกะ→ขาย→คืนเงิน/ยกเลิก→ปิดกะ บน staging และ production smoke test; มือถือ/tablet จริง, thermal 58/80 มม., เน็ตหลุดและ sync กลับ, หลายเครื่องขายพร้อมกัน; วัดขีดจำกัดด้วย workload เป้าหมาย |
| 7 | **ข้อเสนอขายตรงกับสิ่งที่ส่งมอบ** ยังไม่พบหน้าเงื่อนไข/นโยบายข้อมูลและ flow ติดต่อ Enterprise ใน UI ที่ค้น; promotions/CRM/transfers เป็นงานในแบบ v2 | ระบุ trial/การต่ออายุ/การยกเลิก/คืนเงิน/ภาษี/ค่าดูแล Lifetime ให้ชัด มีช่องทางช่วยเหลือและติดต่อร้านใหญ่; ทบทวนนโยบายข้อมูลและเงื่อนไขก่อนเก็บข้อมูลและรับเงิน; ถ้าโฆษณาตั้งโปรโมชั่นหรือฟีเจอร์ v2 ต้องพัฒนาและทดสอบก่อน หรือถอดคำอ้างนั้นออก |

## ทำอะไรได้แล้ว

- สมัครด้วย email/password/confirmation; login/logout/session navigation และตั้ง/ยืนยัน PIN ด้วยแป้นกด
- ร้านใหม่ว่างจริง เพิ่มหมวดหมู่ สินค้า ราคา และสต็อกเองได้
- เลือกหลายธุรกิจในบัญชีเดียว และเข้าใช้งานตามบทบาทพนักงาน
- หลักฐาน local: เพิ่มสินค้าราคา 45 บาท → เปิดกะ → รับเงินสด 50 → ทอน 5 → ใบเสร็จ
- ชุดทดสอบเดิมครอบคลุมเงิน/สต็อก, duplicate sale, tenant isolation, QR และ feature gates บางส่วน; ไม่ใช่หลักฐานว่าทุก flow หรือหลายสาขาพร้อมขายจริง

## ลำดับที่แนะนำ

1. เลือกขอบเขตเปิดขายและแก้ฐานข้อมูล/branch isolation ส่วนที่ขอบเขตนั้นต้องใช้ให้จบก่อน ไม่จำเป็นต้องทำทุก 52 ตารางของ blueprint เพียงเพื่อเปลี่ยนชื่อเป็น v2
2. ทำ account recovery และ payment lifecycle ให้ลูกค้าจบเอง พร้อม retry/idempotency และข้อความขายที่ตรงกับความจริง
3. เปิด staging ที่ตั้งค่าเหมือน production ทดสอบเงิน อีเมล ความถูกต้องข้อมูล backup/restore และอุปกรณ์จริง
4. ปล่อย pilot จำกัดจำนวนร้านพร้อมช่องทาง support แล้วเปิดทั่วไปเมื่อผ่านเกณฑ์และมีหลักฐานการปฏิบัติการ

Pilot สาขาเดียวช่วยลดขอบเขตงานหลายสาขาได้ หากปิดการสร้าง/ขายหลายสาขาและแก้แพ็กเกจที่แสดงให้ตรง แต่ไม่ได้ทำให้เรื่องเงิน การกู้บัญชี ความปลอดภัยข้อมูล และ backup ข้ามไปได้ การเปิดให้ทดลองใช้ฟรีแบบมีทีมช่วยยังไม่ใช่ผลลัพธ์ self-service ที่เจ้าของผลิตภัณฑ์กำหนด

## เลื่อนไปหลังเปิดได้ หากไม่โฆษณารวมในรุ่นแรก

Google login, CRM/แต้มสมาชิก, ซื้อเข้า/โอนสินค้า, โปรโมชั่นขั้นสูง, analytics ขั้นสูง, CFD ข้ามอุปกรณ์ และ Enterprise integrations ส่วน Google/Redis ที่ยังไม่ตั้งค่าไม่ใช่ตัวขวางโดยอัตโนมัติ: อีเมล login ใช้งานได้ และ deployment แบบ instance เดียวไม่จำเป็นต้องเริ่มด้วย Redis แต่ต้องพิสูจน์ realtime/ความจุของรูปแบบที่เลือก

## หลักฐานจาก source

- `src/app/api/billing/checkout/route.ts`, `src/app/api/webhooks/stripe/route.ts`, `src/lib/billing.ts`: billing ยังรอเฟส 3; หลังเฟส 2 อีเมลใช้ worker ใน scripts/compose ไม่รอ SMTP ใน webhook
- `src/app/api/onboarding/route.ts`, `src/app/api/onboarding/draft/route.ts`: หลังเฟส 2 มี persistent request key, HMAC และ versioned metadata draft
- `src/lib/license-guard.ts`, `prisma/schema.prisma`: หลังเฟส 1 ใช้ grants ของบัญชีและผู้ปฏิบัติงานร่วมกัน; BranchProduct ผูก tenant/branch/product
- `src/lib/stock-deduction.ts`: หลังเฟส 1 direct unit ลด/คืน BranchProduct ของสาขาบิล; Product.directStockQty เป็นผลรวมเพื่อ compatibility; recipe ใช้ branchIngredientStock
- `Dockerfile`, `compose.yaml`, `prisma/seed.ts`: deployment scaffold มีแล้ว แต่ fresh database ต้อง seed แพ็กเกจและ bootstrap admin; container command รัน migrate/start ไม่ได้ seed ให้
- `docs/account-journey-audit.md`, `docs/verification.md`, `docs/signup-onboarding-ux-plan.md`, `docs/architecture/pos-saas-v2.md`: ผลตรวจและงานที่คงค้าง

เอกสารทางการที่ตรวจประกอบวันที่ 8 พฤศจิกายน 2026: [Stripe webhook delivery, duplicates และ event ordering](https://docs.stripe.com/webhooks), [Next.js self-hosting: reverse proxy, persistent storage และหลาย instance](https://nextjs.org/docs/app/guides/self-hosting) แนวทาง deployment ต้องประยุกต์กับ Next.js 15 ที่ติดตั้งอยู่ ไม่ย้ายไป API ของรุ่นใหม่โดยอัตโนมัติ
