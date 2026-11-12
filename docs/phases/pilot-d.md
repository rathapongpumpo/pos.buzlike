# Pilot D — เตรียมเปิดนำร่อง (ส่วน local)

วันที่ 12 พฤศจิกายน 2026 · โปรเจ็กต์ `D:\Projects\1.buzlike\pos.buzlike`

**ผล:** เตรียมและทดสอบส่วน local ตามที่ผู้ใช้ระบุแล้ว ยังไม่ผ่านเกณฑ์เปิด production ทั้งเฟส เพราะยังไม่มี hosting/domain ปลายทางที่ยืนยัน และยังไม่มีการทดสอบ Linux containers/อุปกรณ์จริง

## สิ่งที่ทำแล้ว

- Production Compose แยกจาก dev: migration one-shot, app, email/pilot/monitor workers, healthcheck, restart policy, log rotation, loopback app และ DB ไม่เปิด port สาธารณะ Workers ใช้ explicit profile ไม่มี billing/Stripe worker ใน pilot
- เพิ่ม `/api/health` สำหรับ DB availability และ `/api/ops` ที่ต้องใช้ bearer token สำหรับ heartbeat, queue lag, dead letters และ quarantine พร้อม structured alert/recovery logs
- เพิ่ม migration `20261112140000_operational_readiness` แบบ additive เฉพาะ `WorkerHeartbeat` / `OperationalControl` ไม่แตะธุรกรรมหรือข้อมูลร้านเดิม
- Worker บันทึก success/failure/stale ให้ตรวจย้อนหลังได้ การ restore ตั้ง DB quarantine และยังมี environment guards เพื่อห้ามส่งอีเมลจากสำเนา/ห้ามใช้ Stripe เมื่อ RESTORE_DRILL เปิด
- เพิ่ม read-only preflight, ตัวตั้งค่า pilot สำหรับฐานข้อมูลใหม่ที่ปฏิเสธข้อมูลลูกค้าเดิม และคง campaign DRAFT/checkout disabled ไม่เปิดรับจริง
- เตรียม Nginx TLS/SSE/forwarding-header/log-redaction config และทดสอบด้วย Nginx Windows official binary 1.30.6 กับ certificate ทดสอบในเครื่อง ไม่ใช่ certificate สาธารณะ
- เพิ่ม backup manifest, checksum ทุกตาราง, SHA-256 ของไฟล์สลิป และคำสั่งซ้อมกู้ PostgreSQL 17 ไปอีก directory/port พร้อมตรวจ entitlements/capacity และ outbound quarantine โดยไม่ทับต้นฉบับ
- เตรียม encrypted pg_dump wrapper และ authenticated backup decrypt; ทดสอบ crypto round-trip/tamper/wrong-key/no-overwrite แล้ว ส่วน container pg_dump/pg_restore และการสำรองไฟล์สลิปเข้ารหัสใน production ยังไม่ทดสอบ
- เพิ่ม `/privacy`, `/terms`, `/support` พร้อมลิงก์หน้าแรก/สมัคร ใช้ข้อมูลที่ทราบจริงและแสดงข้อมูล production ที่ยังต้องยืนยัน ตั้ง readiness gate ให้ตรวจรายละเอียดผู้ให้บริการก่อนเปิดจริง
- ข้อผิดพลาด API/Auth.js ไม่พิมพ์ raw payload/provider message/SQL/URL token ใช้ correlation ID และรหัสที่อนุญาตแทน
- พบข้อความ offline receipt เดิมแสดง “บันทึกการขายสำเร็จ” จึงเปลี่ยนเป็น “บันทึกในเครื่อง · รอซิงก์” พร้อมข้อความ “ใบรับเงินชั่วคราว · รอซิงก์” ในใบรับเงิน และไม่แสดง queue #000 เป็นหมายเลขคิวจริง

## ผลทดสอบ

| การตรวจ | ผลและขอบเขต |
|---|---|
| Build / typecheck / migration | ผ่านในเครื่อง Windows/Node/PostgreSQL นี้ |
| ชุดทดสอบรวม | **110/110**, ไม่ข้าม; เพิ่ม D 10 กรณี ครอบคลุม config/init/health/security/worker/queue/quarantine/crypto/workload |
| Restore | กู้ PostgreSQL แยกที่ port 55433 เปรียบเทียบ **150 ตาราง** จาก public และ 2 fixture schemas พร้อมไฟล์สลิปทดสอบ 1 ไฟล์ ตรง manifest ทุกตัว สิทธิ์ active 3 / read-only 1 / reserved 1 ยังถูกต้อง คนที่ 6 ถูกปฏิเสธ และส่งอีเมลออก 0 แม้เปิด delivery environment |
| TLS/proxy | HTTPS local certificate chain ตรวจผ่าน, HTTP redirect 308, upstream 200/502, overwrite X-Forwarded-* ได้ ไม่พบ canary token ใน access/error logs; ยังไม่ทดสอบ Linux vhost/CDN/certificate สาธารณะ |
| Compose | `docker compose ... config --quiet` ผ่าน แต่ Engine ไม่ทำงาน จึงยังไม่ยืนยัน image build/startup/health/restart ใน container |
| Worker scripts | รัน process จริงแบบ --once ใน fixture: pilot OK, email DISABLED, monitor แจ้งเตือน delivery disabled/quarantine ถูกต้อง ไม่มีการส่งภายนอก |
| Workload | 5 ร้าน × 2 สาขา × 2 terminals; 80 HTTP requests พร้อมกันรวม retries → 40 บิลที่ไม่ซ้ำ ยอด 2,000 บาท และลดสต็อกเพียง 40 ครั้ง ทุกสาขาจาก 100 เหลือ 96; เวลาเป็น local smoke ไม่ใช่ SLA/capacity production ดูค่าจริงใน workload.json |
| Onboarding burst | 5 reservations × 20 คำขอพร้อมกัน = 100 requests → 5 ร้านว่าง วันสิ้นสุด 30 วันเท่าเดิม ไม่มีร้าน/เวลาซ้ำ |
| Browser offline | Service worker + IndexedDB จริงใน headless Chromium: บิลพักอยู่หลัง offline reload และไม่ข้ามสาขา, เงินสด offline อยู่ในคิวหลัง reload, ต่อเน็ตแล้วมีเพียง 1 บิล/ลดสต็อก 1 ครั้ง, หมดสิทธิ์ก่อน sync แล้วเก็บรายการ conflict/เนื้อหาเดิมไว้ ไม่เพิ่มยอด/ไม่ลดสต็อกเพิ่ม |
| Responsive | หน้าแรก/สมัคร/3 หน้าข้อมูล × 8 viewport = **40 กรณี** ไม่ล้นแนวนอนและไม่มี page errors; ตรวจภาพหน้าจอจริงที่ 390/768 px รวมใบรับเงินออฟไลน์ด้วย ยังไม่ใช่อุปกรณ์/เครื่องพิมพ์จริง |

**ข้อสังเกตที่ยังต้องติดตาม:** ชุดรวมรอบแรกเกิด HTTP 500 หนึ่งคำขอในเคสตั้งร้านพร้อมกันของ A (107/108 ผ่าน, request ID `9e96f20d-9672-4b9b-9fcb-87b25245c78c`) ก่อนเพิ่มรหัส DB diagnostic ยังไม่ทราบสาเหตุ จึงไม่อ้างว่าแก้ root cause แล้ว ทดสอบ A แยก 11/11 และรอบรวมซ้ำผ่าน รวมทั้งเพิ่ม onboarding burst 100 requests ผ่าน เก็บ diagnostic แบบไม่เปิดความลับและกำหนดตรวจซ้ำใน staging ก่อน go/no-go

## ข้อมูลเดิมและการเปิดใช้

Snapshot ก่อน/หลังของ User/Tenant/Product/Order/Payment/campaign/invitation/enrollment/release ตรงกัน: 18 users, 17 tenants, 151 products, 28 orders, ยอดเดิม 2,485 บาท, stock 7,504, SaaS payments 0 คง `LEGACY/PUBLIC`, `founders-5=DRAFT`, คำเชิญ/ผู้เข้าร่วมจริง 0

Physical backup ก่อน migration: `data/backups/pre-pilot-d-2026-11-12T13-46-02-991Z` และ backup+manifest สำหรับ restore drill รอบล่าสุดบันทึกใต้ `data/backups/pre-pilot-d-*` ไม่เข้ารหัสและมีข้อมูลจริง จึงไม่อยู่ใน image/git และไม่ควรส่งออกเป็น evidence สาธารณะ สำเนา restore หยุดแล้วหลังตรวจ ไม่ใช่ production instance

เว็บหลักคงไว้ที่ `http://localhost:3100` ไม่มี deployment, DNS change, การเปิด campaign, คำเชิญจริง หรือการส่งอีเมลลูกค้าจากการทดสอบนี้

หลักฐาน: `output/pilot-d/{build.log,typecheck.log,tests.log,restore.json,proxy-check.json,worker-check.json,workload.json,onboarding-burst.json,public-responsive.json,offline-*.log,offline-*.json,receipt-check.log,before.json,after.json}` และ [pilot-d-local.json](evidence/pilot-d-local.json)

## ก่อนถือว่า D จบและเริ่ม E

ยังต้องยืนยัน hosting/domain, รัน Linux containers และซ้อม worker crash/restart จริง, HTTPS/SMTP/guest จากภายนอก, ส่ง alert ถึงผู้รับจริง, offsite/encrypted DB+slip backup/retention/restore และ rollback บนสภาพแวดล้อมจริง, ตรวจรายละเอียด privacy/contact และทดสอบมือถือ/แท็บเล็ต/Safari/สแกนเนอร์/เครื่องพิมพ์จริง รวมติดตาม onboarding failure ข้างต้น

คู่มือพร้อมคำสั่งและขั้น rollback: [pilot-deployment.md](../operations/pilot-deployment.md)
