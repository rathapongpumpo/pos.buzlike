# Pilot B — สมัครนำร่องและหน้าเว็บ

สถานะ: **ผ่านการตรวจใน local** · 11 พฤศจิกายน 2026 · โปรเจ็กต์ `D:\Projects\1.buzlike\pos.buzlike`

## ผลส่งมอบ

- เพิ่ม `/pilot`, `/pilot/invite` และ `/pilot/waitlist` รวมคำเชิญปกติ/ผิด/หมดอายุ/ถูกถอน อีเมลไม่ตรง อีเมลยังไม่ยืนยัน การจอง สิทธิ์ที่เปิดใช้แล้ว และสิทธิ์ที่หมดเวลา
- GET/HEAD/prefetch แสดงข้อมูลเท่านั้น ไม่มีการจอง สร้างร้าน หรือเริ่มนับเวลา ลูกค้ากดดำเนินการต่อจึงแลกลิงก์เป็น encrypted HttpOnly/SameSite cookie แล้วนำ raw token ออกจาก URL พร้อม `Referrer-Policy: no-referrer` และ `Cache-Control: no-store`
- เพิ่ม context/claim/activate/waitlist API โดยตรวจ origin, session, verified email, อายุ/การถอน/เวอร์ชันคำเชิญ, ความเป็นเจ้าของร้าน และ rate limit ใช้ transaction/capacity lock จาก A ต่อ ไม่สร้างระบบโควตาซ้ำ
- เพิ่ม `User.pendingPilotInvitationVersion` แบบ additive migration เพื่อรักษาคำเชิญที่ตรวจแล้วข้ามการสมัคร ยืนยันอีเมล และการเข้าสู่ระบบจากอีกอุปกรณ์ โดยไม่เก็บ raw invitation token ในบัญชี draft หรือ localStorage คำเชิญเวอร์ชันเก่าใช้รับสิทธิ์ไม่ได้
- หน้าสมัคร/เข้าสู่ระบบอ่านบริบทคำเชิญและเติมอีเมลผู้รับให้ การสมัครด้วยอีเมลผิดถูกปฏิเสธและ rollback ทั้ง user; บัญชี legacy ที่ไม่เคย verified ต้องยืนยันจริงก่อนรับสิทธิ์
- ผู้ได้รับสิทธิ์เลือกร้านทดลองเดิมของตนหรือสร้างร้านว่างใหม่ได้ การใช้ร้านเดิมไม่แก้ Tenant/branch/staff/products; ร้านใหม่ใช้ onboarding/PIN keypad/draft/request key เดิมและ activate พร้อมกันใน transaction การกดซ้ำไม่เพิ่มร้านหรือขยายเวลา
- คิวผู้สนใจเป็นแบบกดยืนยันเอง ไม่ join จากการเปิดหน้า มีรายการเดียวต่อ user ถอนและลงใหม่ได้ ไม่สร้าง Tenant ไม่เริ่ม trial และไม่ตั้ง consent การตลาด
- เมื่อ `PRIVATE_PILOT`: หน้าแรก/สมัคร/pricing/billing ตรงกับสิทธิ์ 5 ธุรกิจ/30 วัน ไม่พาไป trial 14 วันใหม่ ไม่แสดง Lifetime purchase และไม่มีปุ่มเลือกซื้อที่พร้อมจ่าย ข้ามตรงไป onboarding/intent/quote/checkout ก็รับสิทธิ์หรือชำระใหม่ไม่ได้
- `selectedPlan` เก่าไม่พาวนกลับ checkout ในโหมดนำร่อง; ลูกค้าเดิมยังเข้าร้านเดิมได้ หน้า app และสมาชิกระบุ Pro นำร่อง/วันเวลาสิ้นสุด/ไม่มีการตัดเงินเอง เจ้าของดูรายงานหลังหมดสิทธิ์ได้
- ปุ่มแจ้งปัญหาในแบนเนอร์ B เป็นลิงก์ติดต่ออีเมล ระบบฟีดแบ็กภายในและประวัติเรื่องเป็นงาน C
- ปรับ `appLink` ให้อ่าน `AUTH_URL` ฝั่งเซิร์ฟเวอร์ตอนรันก่อน public env ที่ถูกฝังตอน build ทดสอบลิงก์ยืนยันจริงบน HTTP server คนละพอร์ตกับ build แล้ว

## ตรวจรับ

รายละเอียดผลล่าสุดและภาพอยู่ใน `output/pilot-b/` และ `docs/phases/evidence/pilot-b-local.json`

| การตรวจ | ผล |
|---|---|
| ชุดทดสอบระบบ | **88/88 ผ่าน** รวม Pilot B ใหม่ 13 กรณี ไม่มี skipped |
| Build / TypeScript | ผ่าน |
| Migration | 14 migrations ใช้ครบ รวม `20261111120000_pilot_admission_context` |
| Browser responsive | **184 กรณีผ่าน** ที่ 320/360/390/430/768/1024/844/1440 px รวม tablet สองแนวและหน้าจอสั้น |
| Browser E2E | สมัครจากคำเชิญ/ยืนยันข้าม cookie context/ตั้งร้านและ PIN/ร้านว่าง, ใช้ร้านเดิม และถอน/ลงทะเบียนรอใหม่ ผ่าน |
| ข้อมูลหลัก | User 18, Tenant 17, Product 151, Order 28; checksum แถวเดิมและข้อมูล Pilot/ReleaseSettings ตรง baseline |

- ชุดทดสอบเดิมและใหม่ผ่าน รวมการสมัคร/ยืนยันอีกอุปกรณ์, credentials login จริง, โควตาพร้อมกัน, คำเชิญหมด/ถอน/หมุน, อีเมลผิด, private bypass, rate limit, reservation หมดอายุ/จองใหม่, ข้อมูลร้านเดิม และการคงวันสิ้นสุด
- Browser ตรวจ guest, ผู้ยังไม่ยืนยันอีเมล, ผู้จอง, ผู้มีสิทธิ์, ผู้หมดสิทธิ์ และผู้ลงทะเบียนรอ ทั้งมือถือ/tablet/desktop พร้อมภาพจริงของหน้าที่เปลี่ยน
- Browser เดินตั้งแต่คำเชิญ → สมัคร → ยืนยันอีเมลจาก browser ที่ไม่มี cookies เดิม → เข้าสู่ระบบ → รับสิทธิ์ → ชื่อร้าน/ประเภท → PIN keypad/ยืนยัน → ร้านว่าง Pro แล้ว refresh เพื่อตรวจวันสิ้นสุด
- อีเมลใน E2E อ่านจาก encrypted outbox ของฐานข้อมูลทดสอบ ไม่มีการส่งหาอีเมลลูกค้าจริง ไม่ใช่หลักฐาน mailbox delivery ใหม่ SMTP delivery ของ pilot/reminder ตรวจต่อ C/D
- ทดสอบ schema แยกบน PostgreSQL และ Next HTTP server 3102/3103 โดยปิด SMTP/Stripe/Google provider ทดสอบ ข้อมูลทดสอบไม่ปนร้านจริง และล้าง schemas/server หลังตรวจ
- บันทึก baseline/checksum ก่อน/หลังไว้ที่ `output/pilot-b/before.json` และ `after.json` โดยตัดเฉพาะ column ใหม่ที่เพิ่มออกจาก checksum เพื่อเทียบแถวเดิมตรงกันได้ สำรอง physical ก่อน migration ที่ `data/backups/pre-phase3-2026-11-11T13-35-24-591Z` (ใช้ backup helper เดิม)

## สถานะการเปิดใช้และข้อจำกัด

ระบบหลัก local ยัง `LEGACY/PUBLIC`, campaign `founders-5=DRAFT`, คำเชิญและผู้เข้าร่วมจริง 0 ตามแผนที่ให้ผ่าน B–D ก่อนเปิดรับร้านจริง ไม่เปลี่ยน campaign เป็น OPEN หรือออกคำเชิญให้ลูกค้าจริงในเฟสนี้ เส้นทางใหม่เปิดดูได้ที่ `http://localhost:3100/pilot` และ `/pilot/waitlist`; หน้าแรกจะใช้ข้อความนำร่องเมื่อเปิด release policy ที่ทดสอบแล้วในขั้นเตรียมเปิดจริง

ก่อนเปิด pilot ให้ตั้ง `PRIVATE_PILOT` และ `checkoutMode=DISABLED` ก่อนเปิด campaign/ส่งคำเชิญ การเปิดจริงต้องมี C (การจัดการคำเชิญ/ฟีดแบ็ก/worker) และ D (deploy/backup restore/device validation) ครบ รายละเอียด SQL สำหรับการเปลี่ยนโหมดไม่ควรรันนอกขั้นเปิดที่มี audit

Google พร้อมเชื่อมบริบทฝั่งโค้ดแต่ยังไม่มี OAuth credentials จึงยังไม่ถือว่าทดสอบ Google จริง การตรวจหน้าจอใช้ Chromium viewport emulation ไม่ใช่ Safari/มือถือ/tablet/เครื่องพิมพ์จริง และยังไม่ยืนยัน offline IndexedDB/network loss บนอุปกรณ์จริง ซึ่งเป็นงาน D ไม่ใช่ผลตรวจ B

ก่อนใช้งานคำเชิญจริงต้องตั้ง reverse proxy/access log ใน D ให้ไม่เก็บ query token ของลิงก์เชิญและลิงก์ยืนยัน โค้ด B ไม่เพิ่ม request logging ของ token และตั้ง no-referrer/no-store ให้เส้นทางเหล่านี้แล้ว
