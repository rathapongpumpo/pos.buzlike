# Pilot C — ฟีดแบ็กและการดูแล

สถานะ: **ผ่านการตรวจใน local** · 11 พฤศจิกายน 2026 · `D:\Projects\1.buzlike\pos.buzlike`

## ผลส่งมอบ

- ผู้ดูแลที่ `/superadmin` มีส่วน **นำร่อง** และ **ฟีดแบ็ก** พร้อมทางเลือกเมนูบนมือถือ/แท็บเล็ต ส่งคำเชิญผ่าน encrypted outbox, ส่งใหม่โดยหมุน token, ถอนคำเชิญ, เปิด/พัก/ปิดรับ, ขยายวันและถอนสิทธิ์ร้าน พร้อมเหตุผลและ audit
- คำเชิญสร้างด้วย request UUID เดิมได้ครั้งเดียวใน transaction คำเชิญใหม่สำหรับอีเมลที่ยังมีคำเชิญใช้ได้ต้องใช้การส่งใหม่ ลิงก์/context เดิมและ reservation เดิมถูกยกเลิก ไม่ส่ง raw token กลับ API
- การขยายวันตรวจ grant version และวันใหม่ ต้องหลังวันเดิม/เวลาปัจจุบันและไม่เกิน 90 วันจากวันนี้ การถอนร้านที่เริ่มใช้แล้วไม่คืนที่ว่างให้ร้านอื่น ไม่แก้ subscription ที่จ่ายเงินจริงหรือข้อมูลธุรกรรม
- ร้านนำร่องมี `/{storeSlug}/feedback` ผ่านเมนูและแบนเนอร์ ส่งประเภทเรื่อง/รายละเอียด 10–2,000 ตัวอักษร/คะแนนความง่ายไม่บังคับ และติดตามสถานะกับข้อความตอบกลับได้ หลังหมดสิทธิ์ยังส่งฟีดแบ็กได้ แต่การขายยังถูกปิดตาม entitlement
- บันทึก account, ผู้สลับ PIN และ branch จาก server context พนักงานเห็นเฉพาะเรื่องของตัวเองในสาขาที่มีสิทธิ์ เจ้าของเห็นเรื่องของร้านทั้งหมด ตรวจ membership/branch ซ้ำใน transaction ตอนส่ง และปฏิเสธ identity fields จาก payload
- ผู้ดูแลกรองร้าน/ประเภทธุรกิจ/สาขา/หมวด/ความรุนแรง/สถานะ/อุปกรณ์ รับเรื่องและอัปเดตโดยตรวจสถานะกับประวัติรุ่นล่าสุด บันทึกทุกการเปลี่ยนใน history ข้อความตอบกลับเป็นข้อความที่ลูกค้าเห็น ไม่มีช่องเก็บ note ลับปะปน
- ข้อความ HTML/XSS แสดงเป็นข้อความ ไม่ render HTML ไม่แนบบิล/ข้อมูลลูกค้า/token/รูปหน้าจออัตโนมัติ ไม่รองรับอัปโหลดไฟล์ในเฟสนี้
- Dashboard แสดงผู้รอ เรื่องค้าง คิวอีเมล สถานะคำเชิญ/สิทธิ์ จำนวนสาขาและจำนวนรายการขายทั้งหมดของแต่ละร้าน ตัวเลขรายการขายรวมข้อมูลเดิมและทุกสถานะ ไม่ใช่จำนวนบิลชำระหรือรายได้ ไม่อ้าง retention/เวลาเฉลี่ยปิดบิลที่ยังไม่มีข้อมูลรองรับ

## Worker และอีเมล

`npm run pilot:worker -- --once` ประมวลผลหนึ่งรอบ หรือ `npm run pilot:worker` ทำต่อเนื่องทุก 30 วินาที ปล่อยการจองที่หมดอายุ เปลี่ยน grant หมดเวลา และสร้างคิวเตือนช่วง 7/3/1 วันหรือสิ้นสุดแล้ว โดยเลือกเฉพาะช่วงปัจจุบัน ไม่ส่งทุกช่วงที่พลาดย้อนหลัง

ใช้ `npm run email:worker` เดิมสำหรับส่ง SMTP ออกจากคิว ทั้งสอง worker ต้องตั้ง process supervision/monitoring ใน D เฟสนี้ไม่เปิด worker ส่งจริงค้างไว้ อีเมลจาก C ทดสอบในฐานข้อมูลแยกด้วย sender ที่ควบคุมได้ ชุดทดสอบ SMTP local เดิมยังผ่าน ไม่อ้างว่า C ส่งอีเมลใหม่ถึงกล่องลูกค้าจริง

คีย์เตือนผูก enrollment/version/ช่วงเตือน และเก็บวันสิ้นสุดเป้าหมาย ขยาย/ถอนสิทธิ์ทำให้งานเก่าหมดอายุ Worker ตรวจ version/deadline/status/paid precedence อีกครั้งก่อนส่ง ใช้ campaign lock ระหว่างส่ง SMTP เพื่อให้การขยาย/ถอนที่ commit แล้วไม่ถูกตามด้วยอีเมลวันเก่า Transaction ที่มี SMTP **ไม่ retry อัตโนมัติ**; การเรียกซ้ำเกิดผ่าน outbox retry/backoff และ stable Message-ID

SMTP ไม่รับประกัน exactly-once หาก provider รับข้อความแล้ว แต่ connection หรือการบันทึกผลขาดหาย อาจส่งซ้ำได้ อีเมลที่ส่งออกแล้วเรียกคืนไม่ได้ จึงระบุเวลาที่อ้างอิงและให้ตรวจวันปัจจุบันในแอป การหมดสิทธิ์ตรวจทุก request อยู่แล้วแม้ worker หยุด

## Route inventory และขอบเขตสิทธิ์

| เส้นทาง | การใช้งาน | การคุ้มครอง |
|---|---|---|
| `GET /api/admin/pilot` | campaign/invitation/grant/audit/dashboard ล่าสุด | SUPER_ADMIN; ไม่คืน token/hash |
| `POST /api/admin/pilot` | invite/resend/revokeInvitation/campaign/extend/revoke | SUPER_ADMIN, verified session, Origin, rate 30/min/account, version/reason, transaction/audit; invite UUID dedupe |
| `GET /api/admin/feedback` | ตัวกรองและ history ล่าสุดไม่เกิน 100 เรื่อง | SUPER_ADMIN; allowlist query |
| `POST /api/admin/feedback` | สถานะ/ความรุนแรง/ข้อความตอบกลับ | SUPER_ADMIN, Origin, rate, expectedStatus + expectedHistoryId, row lock/history |
| `GET /api/v1/{storeSlug}/feedback?branchId=…` | เรื่องของร้าน/พนักงานไม่เกิน 100 | account + switched PIN + current branch; ไม่มีสิทธิ์ข้ามร้าน |
| `POST /api/v1/{storeSlug}/feedback?branchId=…` | ส่งเรื่อง/idempotent retry | scopes เดียวกัน, activated pilot grant, Origin, rate 10/min/operator, UUID dedupe, payload allowlist |
| `/{storeSlug}/feedback` | ฟอร์มและประวัติลูกค้า | store context เดียวกับระบบ POS |

ใช้ตาราง/constraints จาก A ต่อ ไม่มี migration ใหม่หรือการ reset/seed ฐานข้อมูลหลัก ฟีดแบ็กใช้รหัส `GENERAL/TRIAGED/P0–P3` ตาม constraints เดิม พร้อมชื่อภาษาไทยใน UI

## หลักฐานตรวจ

- Build, typecheck และ migrations status ผ่าน; ชุดทดสอบรวม **100/100**, ไม่ข้าม (เพิ่ม C 12 กรณี)
- DB/HTTP: admin/Origin/role guards, DRAFT version 0, invitation concurrent dedupe/encrypted link/rotation/revoke, feedback duplicate/payload/XSS/rating/size, switched PIN/branch removal/inactive staff/cross tenant, expired feedback, history/stale update/filters และ rate limit
- Worker: parallel maintenance ไม่สร้างคิวซ้ำ, 7/3/1/expired stages, expiry audit, ขยายชน expiry, ถอน/ขยาย invalidates queued mail, parallel SMTP claim, campaign lock กัน SMTP ส่งวันเก่าหลังขยาย, retry/backoff/stable Message-ID
- Browser journey: cashier ส่งข้อความ HTML โดยไม่ execute และไม่เห็นเรื่อง owner → admin เปลี่ยนสถานะ/ตอบ → filter อุปกรณ์ → cashier โหลดใหม่เห็นผล → expired pilot ส่งเรื่องได้ → admin สร้างคำเชิญเข้าคิวโดยไม่ส่งภายนอก
- Responsive **104/104**: 13 หน้าหรือสถานะ × 8 viewport (320×740, 360×800, 390×844, 430×932, 768×1024, 1024×768, 844×390, 1440×900); ไม่พบ page/dialog ล้นแนวนอน, control สั้นกว่า 44px หรือ input ต่ำกว่า 16px ในส่วนที่ตรวจ; ไม่มี page errors ภาพจริงตรวจฟอร์ม/ประวัติ/ผู้ดูแลด้วย แก้ปุ่มปิด modal เดิม 36px เป็น 44px และช่องกรอก modal เป็น 16px
- หลักฐาน `output/pilot-c/{build.log,typecheck.log,tests.log,migrations.log,responsive.json,journey.log}` และภาพ `feedback-owner-390.png`, `feedback-history-768.png`, `admin-pilot-768.png`, `admin-feedback-390.png`, `feedback-resolved-390.png`
- Snapshot checksum ของข้อมูลหลักก่อน/หลังตรงกัน: User 18, Tenant 17, Product 151, Order 28, SaaS payment 0, campaign 1, invitation 0, enrollment 0 คง `LEGACY/PUBLIC` และ `founders-5=DRAFT`

## ก่อนเปิดจริง

ยังต้องผ่าน D: production deploy/HTTPS/reverse-proxy token redaction, backup restore, worker supervision/queue alerts, monitoring และมือถือ/แท็บเล็ต/เครื่องพิมพ์จริง รวม offline network interruption การตรวจรอบนี้ใช้ headless Chromium viewport emulation ไม่แทนอุปกรณ์จริง ไม่ deploy ไม่เปิดรับร้านจริงและไม่ส่งคำเชิญจริงใน C

รายงานหลักฐานแบบอ่านด้วยเครื่อง: [pilot-c-local.json](evidence/pilot-c-local.json)
