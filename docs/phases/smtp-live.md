# SMTP จริง — ผ่าน 8 พฤศจิกายน 2026

ตั้งค่าใน `.env` ของ `pos.buzlike` แล้ว ไม่บันทึกรหัสผ่านลงเอกสารหรือผลทดสอบ และไม่ได้แก้โปรเจ็ค demo-system

| รายการ | ผลตรวจ |
|---|---|
| SMTP | `smtp.hostinger.com:465`, TLS certificate ผ่าน, เชื่อมต่อ TLS 1.3 |
| บัญชีส่ง | `support@buzlike.com` — authenticate ผ่าน |
| ผู้รับทดสอบ | `support@buzlike.com` |
| ส่งผ่าน outbox แบบระบุงานเดียว | สำเร็จใน attempt 1 |
| ส่งผ่าน background worker ที่กำลังรัน | สำเร็จใน attempt 1 โดยไม่เรียก flush จาก script |
| รับจริง | พบ Message-ID ของทั้ง 2 ฉบับใน **INBOX** ผ่าน IMAP read-only |
| Header ของทั้ง 2 ฉบับ | **SPF=pass, DKIM=pass, DMARC=pass**, มี DKIM signature |
| Runtime หลังตั้งค่า | rebuild/restart แอปแล้ว `/login` ตอบ 200 และเปิด email-worker แล้ว |

เวลาอีเมลฉบับแรกประมาณ **20:29 น.** และฉบับ background worker ประมาณ **20:34 น.** วันที่ 8 พฤศจิกายน 2026 (Asia/Bangkok) หัวข้อ `BUZLIKE POS · ทดสอบ SMTP จริง` พร้อมเลขทดสอบท้ายหัวข้อ เนื้อหาไม่มี credentials ข้อมูลลูกค้า หรือลิงก์กู้บัญชี

หลักฐานแบบไม่เก็บความลับ: [ฉบับแรก](evidence/smtp/live-check-initial.json), [ฉบับ background worker](evidence/smtp/live-check.json)

ก่อนเปิด worker ตรวจแล้วไม่มีคิวเก่ารอส่ง การอ่าน mailbox ค้นหาเฉพาะ Message-ID ของอีเมลที่สร้างในการทดสอบ ไม่อ่านอีเมลอื่น ไม่เปลี่ยนสถานะอ่าน และไม่ลบอีเมล

## คำสั่งตรวจครั้งต่อไป

ตรวจ DNS/เชื่อมต่อ/login โดยไม่ส่งอีเมล:

```powershell
npm run email:check
```

ส่งทดสอบเฉพาะหนึ่งงาน ตรวจ INBOX ของบัญชีเดียวกัน และรอ worker ส่งอัตโนมัติ:

```powershell
npm run email:check -- --send --to support@buzlike.com --receive --imap-host imap.hostinger.com --wait-worker
```

ต้องเปิด `npm run email:worker` อยู่ก่อน หากไม่ใช้ `--wait-worker` script จะส่งเฉพาะ outbox ID ของการทดสอบ ไม่ไล่ส่งคิวทั้งหมด คำสั่งส่งแต่ละครั้งสร้างอีเมลใหม่หนึ่งฉบับ ส่วนคำสั่งตรวจอย่างเดียวไม่ส่ง

เพิ่ม regression check ว่าการระบุ outbox ID ไม่ทำให้งานอื่นถูกส่ง และรันชุดทดสอบ worker ผ่าน พร้อม TypeScript/production build ผ่านในรอบนี้ ไม่ได้รัน full suite ระหว่างเปิด worker ที่ใช้ SMTP จริง เพื่อไม่ส่ง fixture ของชุดทดสอบไปภายนอก

ผลนี้ยืนยันการส่งและรับจริงใน mailbox Hostinger ที่กำหนด ไม่ใช่ผลทดสอบส่งข้ามไป Gmail/Outlook หรือ delivery/bounce ระยะยาว การ deploy production/monitoring ยังตามเฟส 4–5 หน้าอีเมลที่สร้างจากแอปในเครื่องยังใช้ URL local จนกว่าจะตั้ง URL production

อ้างอิงค่าบริการ: [Hostinger Email configuration](https://www.hostinger.com/support/1575756-how-to-get-email-account-configuration-details-for-hostinger-email/), [Nodemailer verify/send semantics](https://nodemailer.com/smtp)
