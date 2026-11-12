# เฟส 2 — บัญชีและการตั้งร้าน

8 พฤศจิกายน 2026 · **พัฒนาและตรวจผ่านใน local** · อัปเดต: ตั้งค่าและทดสอบ SMTP จริงแล้ว ส่งถึง INBOX และ SPF/DKIM/DMARC ผ่านทั้งฉบับ scoped outbox และ background worker — [รายงาน SMTP จริง](smtp-live.md)

## ผลที่ได้

- บัญชีใหม่สมัครด้วย email/password/confirmation → login → ยืนยันอีเมล → ตั้งร้าน บัญชีเดิมก่อน migration ยังใช้ได้ ไม่ถูกบังคับยืนยันย้อนหลังและไม่ถูกทำเครื่องหมายว่าเคยยืนยันแล้ว
- ลิงก์ยืนยันอีเมลใช้ได้ครั้งเดียว 24 ชั่วโมง ส่งใหม่ทำให้ลิงก์เดิมใช้ไม่ได้; หน้า GET ไม่ใช้ token อัตโนมัติ เพื่อไม่ให้ mail scanner กินลิงก์
- ลืมรหัสผ่านตอบเหมือนกันสำหรับอีเมลที่มี/ไม่มีบัญชี ใช้ลิงก์ครั้งเดียว 30 นาที มี password confirmation และตรวจความยาวก่อน bcrypt ไม่ให้ตัดรหัสผ่านเงียบ ๆ
- เปลี่ยนรหัสผ่านแล้วเพิ่ม sessionVersion ทำให้ JWT เดิมทุกเครื่องใช้ API/หน้าที่ป้องกันต่อไม่ได้ ต้อง login ใหม่ ไม่ auto-login จาก reset link และเข้าคิวแจ้งเตือนการเปลี่ยนรหัสโดยไม่มีรหัสผ่านในอีเมล
- เจ้าของเชิญพนักงานด้วยอีเมล บทบาท และสาขาได้ คำเชิญ 72 ชั่วโมง ส่งใหม่/ยกเลิกได้ ผู้รับต้องใช้บัญชีอีเมลเดียวกันและยืนยันอีเมลก่อนตั้ง PIN ด้วยตัวเอง; คงปลายทางคำเชิญข้าม login/signup/verification
- คำเชิญค้างนับโควตาพนักงาน ไม่ให้ส่งใหม่หรือรับคำเชิญเพื่อข้ามโควตา; พนักงานใหม่เข้าได้เฉพาะสาขาที่มอบให้ ไม่มีการสร้างบัญชีด้วยรหัสผ่านที่เจ้าของตั้งแทน
- หน้าตั้งร้านบันทึกชื่อและประเภทธุรกิจไว้ใน DB ตามบัญชี โหลดกลับหลัง reload ได้ ใช้ version กันแท็บเก่าเขียนทับ และ request key กันคำขอซ้ำ/response หายแล้วสร้างร้านซ้ำ หน้าเคยสร้างสำเร็จมีทางเปิดร้านเดิมหรือเริ่มร้านใหม่โดยชัดเจน
- ไม่เก็บ PIN/password ใน draft หรือ browser storage; การตั้งร้านเก็บ request digest แบบ HMAC เพื่อเทียบคำขอโดยไม่บันทึก PIN ดิบ

## อีเมลและวิธีรัน

อีเมลบัญชีและคำเชิญอยู่ใน transaction เดียวกับข้อมูลต้นทาง เก็บ token เป็น hash และเข้ารหัสเนื้อหาอีเมลที่มีลิงก์ด้วย AES-256-GCM ใน outbox เมื่อส่งสำเร็จจะลบเนื้อหาเข้ารหัสออก ไม่เริ่มส่งคิวที่ตรวจพบว่าลิงก์หมดอายุ/ยกเลิก/ใช้แล้ว หากยกเลิกขณะ SMTP กำลังส่ง อีเมลอาจถึงผู้รับแต่ลิงก์นั้นใช้ไม่ได้แล้ว

```powershell
npm run email:worker
# ตรวจหนึ่งรอบ (ไม่ใช่ daemon)
npm run email:worker -- --once
```

Compose เพิ่มบริการ `email-worker` แยกจาก web ใช้ DB และ AUTH_SECRET ชุดเดียวกับแอป ตั้ง `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` และ credentials ตามผู้ให้บริการ; remote SMTP บังคับ TLS/STARTTLS ไม่ลดการตรวจ certificate การส่งอีเมลไม่รั้ง checkout/webhook request

- claim คิวด้วย `FOR UPDATE SKIP LOCKED`, lease 5 นาที, worker ค้างแล้วคิวกลับมาทำต่อได้
- timeout การเชื่อมต่อ/คำทักทาย 10 วินาที, socket 30 วินาที; retry exponential เริ่ม 30 วินาที สูงสุด 1 ชั่วโมง และหยุดหลัง 8 attempts
- มีจำนวนรอส่ง/ล้มเหลว/สถานะตั้งค่า SMTP ในผู้ดูแล และปุ่มเข้าคิวใหม่เฉพาะงานที่ยังไม่หมดอายุ; worker แสดงผลรวมโดยไม่ log ผู้รับ/token/credentials
- ใช้ UTC สำหรับเวลาคิวแม้ DB รัน timezone กรุงเทพฯ; ผลทดสอบพบและแก้ปัญหา retry รวดเดียวเพราะเทียบ clock คนละ timezone
- มี stable Message-ID แต่ SMTP เป็น at-least-once: หากโปรเซสล้มหลังผู้ให้บริการรับอีเมลก่อนบันทึกผล อาจมีอีเมลซ้ำได้ token ครั้งเดียวป้องกันการเปิดสิทธิ์ซ้ำ ไม่อ้างว่า SMTP ส่ง exactly once

การตรวจเริ่มต้น `email:worker -- --once` เคยรายงาน `not_configured` ต่อมาตั้งค่า Hostinger จริงและตรวจส่งเข้า INBOX สำเร็จแล้ว รวมถึง background worker อัตโนมัติ ดูรายงาน SMTP ด้านบนสำหรับหลักฐานล่าสุด

## หลักฐานทดสอบ

- Prisma validate/migrate/generate, TypeScript และ production build ผ่าน
- **`npm test`: 38 ผ่าน, 0 ล้มเหลว, 0 ข้าม** — [ผลรัน](evidence/phase2/tests.txt)
- HTTP/DB: unverified account ถูกกั้น, expired/used/reissued token ใช้ไม่ได้, ยืนยันพร้อมกันสำเร็จครั้งเดียว, จำกัด resend/reset, reset ยืนยันไม่ตรง/รหัสยาวเกิน/หมดอายุถูกปฏิเสธ, session เดิมหลัง reset เป็น 401 และ credentials login ใหม่ได้
- HTTP/DB: draft เก่าได้ 409, metadata ไม่มี PIN, ส่งตั้งร้านพร้อมกัน 4 คำขอได้ร้านเดียวที่ว่างจริง, retry คืน slug เดิม, key เดิมกับข้อมูลต่างกันถูกปฏิเสธ
- HTTP/DB: คำเชิญตรวจ owner/email/verification/branch/tenant/โควตา, รับครั้งเดียว, resend/revoke/expiry ปิดลิงก์เดิม; พนักงานรับเชิญอ่านอีกสาขาไม่ได้
- Worker ใช้ PostgreSQL schema ทดสอบแยก และ **SMTP server จริงที่จำลองใน loopback**: worker สองตัวส่งงานเดียวครั้งเดียว, retry/backoff, ส่งสำเร็จหลัง retry, dead letter, expiry และ lease ของ worker ที่ล้ม ไม่ติดต่ออีเมลภายนอก
- Browser ด้านขวา Codex: มือถือ 390×844 และ tablet 820×1180 ตรวจหน้ากู้/ตั้งรหัสผ่าน/รอยืนยัน/ยืนยันสำเร็จ/คำเชิญ; modal ไม่ล้น viewport และแถวสาขาสูง 48px
- Browser: กรอกชื่อ/ประเภทร้าน → ไปขั้น PIN → reload → ชื่อและประเภทธุรกิจกลับมาถูกต้อง; ไม่กรอกหรือเปลี่ยน credential ผ่าน browser การ reset/accept พร้อม PIN ตรวจผ่าน HTTP tests ด้านบน

ภาพ: [กู้รหัสมือถือ](evidence/phase2/mobile-forgot.jpg), [ยืนยันสำเร็จ](evidence/phase2/mobile-verified.jpg), [draft หลัง reload](evidence/phase2/mobile-draft-restored.jpg), [reset tablet](evidence/phase2/tablet-reset.jpg), [เชิญมือถือ](evidence/phase2/mobile-invite-form.jpg), [เชิญ tablet](evidence/phase2/tablet-invite-form.jpg), [หน้าผู้รับคำเชิญ](evidence/phase2/mobile-invite-preview.jpg)

## ข้อมูลเดิมและ migration

Cold backup ก่อนเริ่ม: `D:\Projects\pos.buzlike\data\backups\pre-phase2-2026-11-08T12-06-42-676Z`

เพิ่ม migration `20261108080000_account_lifecycle`, `20261108083000_account_email_cleanup`, `20261108084500_email_utc_clock` ไม่มี reset/reseed ข้อมูลเดิม

หลังลบ fixture จำนวนธุรกิจ **17**, บัญชี **18**, บิล **28**, ยอดบิลรวม **2,485.00**, สินค้า **151**, ผลรวม stock เดิม **7,504** ตรงกับก่อนเริ่ม ยอดติดลบและคู่สินค้า–สาขาที่หาย **0** — [ผลเปรียบเทียบ](evidence/phase2/data-preservation.json)

## ข้อจำกัดและงานต่อ

- SMTP จริงส่งเข้า INBOX ของ support@buzlike.com และ SPF/DKIM/DMARC ผ่านแล้ว; การส่งข้ามไป Gmail/Outlook และ spam/delay/bounce ระยะยาวยังไม่ได้ตรวจ
- ต้อง deploy worker และเก็บ AUTH_SECRET อย่างปลอดภัยร่วมกับ backup; หากเปลี่ยน secret เนื้อหา outbox เก่าจะถอดรหัสไม่ได้ ต้องวางแผน drain/reissue ไม่ทิ้งงาน
- draft autosave หลังหยุดพิมพ์ 600ms ปุ่มถัดไปจะรอให้บันทึกสำเร็จ สถานะบันทึกแสดงบนหน้า การปิดทันทีระหว่างยังไม่บันทึกไม่รับประกัน keystroke ล่าสุด
- การรับคำเชิญด้วยบัญชีใหม่ผ่าน HTTP ครบ ส่วน browser ตรวจ layout/ลิงก์และการยืนยัน ไม่อ้างว่า browser กรอก credentials ใหม่ครบทุก flow
- ยังไม่มี production deploy, restore drill, load หรืออุปกรณ์จริงจากผลเฟสนี้ ต้องดำเนินการในเฟส 4–5
- **ถัดไปเฟส 3:** คงแพ็กเกจข้าม signup/setup → ชำระ → เปิดสิทธิ์บัญชีเดิมเอง และวงจรสมาชิก/webhook/reconcile ตามแผน

แนวทางที่ตรวจประกอบ: [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) สำหรับ single-use/expiry และ session invalidation; [Nodemailer SMTP](https://nodemailer.com/smtp) สำหรับ TLS และ timeouts การตรวจโค้ดนี้ไม่ใช่ผล penetration test ทั้งระบบ
