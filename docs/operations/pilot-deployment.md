# เตรียมเปิดนำร่อง BUZLIKE POS

เอกสารสำหรับการส่งต่อหลังทดสอบ local วันที่ 12 พฤศจิกายน 2026 ไม่มีการ deploy/เปลี่ยน DNS/เปิดรับร้านจริงในรอบนี้ ผู้ใช้ระบุว่ายังไม่มีปลายทางและให้เตรียมในเครื่องก่อน

## ไฟล์ที่ใช้

- `compose.production.yaml`: database, migration แบบ one-shot, app, email/pilot workers และ monitor; worker ใช้ profile `workers` เพื่อไม่เริ่มส่งอีเมลจากคำสั่งเตรียม app ตามปกติ
- `.env.production.example`: สำเนาสำหรับเซิร์ฟเวอร์ใหม่ ห้ามใช้ `.env` หรือฐานข้อมูล demo ในเครื่องนี้เป็น production
- `deploy/nginx-pos.conf`: HTTPS, overwrite forwarding headers, SSE ไม่ buffer, access log เฉพาะเวลา/method/status/duration/request ID ไม่เก็บ URI/query/referer/cookie/header authorization; ปิด request error log ที่อาจมี URL token
- `.env.backup.example`: key สำรองเฉพาะ host ไม่ใส่ key นี้ใน app/worker containers

Docker Engine ในเครื่องทดสอบยังไม่ทำงาน จึงตรวจ Compose configuration ได้ แต่ **ยังไม่ได้ build image/รัน Linux containers หรือซ้อม restart ด้วย Docker** ไม่ควรตีความ config ผ่านว่า deploy ผ่าน

## ขั้นเตรียมเซิร์ฟเวอร์ใหม่

1. กำหนด hosting ที่รัน Node/PostgreSQL/SSE ได้, โดเมน, backup ปลายทางแยกเครื่อง และผู้รับ incident นำข้อมูลผู้ให้บริการ/ที่เก็บ/ระยะเวลาเก็บไปตรวจหน้า `/privacy` และ `/terms` ก่อนเผยแพร่
2. คัดลอก `.env.production.example` เป็น `.env.production` จำกัดสิทธิ์อ่าน `chmod 600` สุ่ม `AUTH_SECRET` และ `OPERATIONS_TOKEN` คนละค่าอย่างน้อย 32 bytes ตั้ง HTTPS origin จริงให้ `AUTH_URL` และ `NEXT_PUBLIC_APP_URL` ตรงกัน ตั้ง `RELEASE_TAG` แบบเปลี่ยนค่าในแต่ละ release และใช้รหัส DB แบบ URL-safe ที่ตรงกับ `DATABASE_URL`
3. ตั้ง SMTP ที่ยืนยัน mailbox จริงบนโดเมน production แล้ว Stripe/PromptPay ค่าสมาชิกยังเว้นว่าง `SEED_DEMO=false` ตั้งบัญชี admin และรหัสสุ่มที่ยาวพอชั่วคราวเฉพาะ bootstrap จากนั้นเอา seed password ออกจาก environment หลังสร้างแล้ว ตรวจ/ยืนยันข้อมูล privacy/support ก่อนตั้ง `LEGAL_CONTACT_APPROVED=true`
4. Build โดยไม่คัดลอก `.env`, data, output, backup, fixture หรือ certificate ทดสอบเข้า image:

   ```sh
   docker compose --env-file .env.production -f compose.production.yaml config --quiet
   docker compose --env-file .env.production -f compose.production.yaml build
   docker compose --env-file .env.production -f compose.production.yaml up -d app
   ```

   `app` รอ migration จบก่อน และผูกเฉพาะ loopback:3100; PostgreSQL ไม่มี host port เปิดสาธารณะ คำสั่งนี้ยังไม่เริ่ม email/pilot workers

5. บน **ฐานข้อมูลใหม่ที่ไม่มีลูกค้า/ร้าน/การชำระเงิน/คำเชิญ** เท่านั้น ให้ seed catalog/admin ด้วย `SEED_DEMO=false` แล้ว initialize โหมดนำร่อง:

   ```sh
   docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps migrate node node_modules/tsx/dist/cli.mjs prisma/seed.ts
   docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps migrate npm run ops:init-pilot -- --empty-database
   docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps migrate npm run ops:preflight
   ```

   initializer ปฏิเสธฐานข้อมูลที่มีลูกค้าหรือข้อมูลธุรกิจ ไม่แปลงร้านเดิม ไม่เปิด campaign และไม่ออกคำเชิญ สถานะสุดท้าย `PRIVATE_PILOT / checkout DISABLED / founders-5 DRAFT` preflight เป็น read-only และรายงานรหัสปัญหา ไม่แสดงค่าความลับ ต้องเปิด `OUTBOUND_EMAIL_ENABLED=true` ในเครื่องหลักที่อนุมัติแล้วก่อนผ่าน readiness; ยังไม่มีการส่งอีเมลจนเริ่ม worker

6. ติดตั้ง Nginx config เฉพาะ vhost ของ POS แทน `POS_DOMAIN` และ certificate paths ตรวจ `nginx -t` ก่อน reload ตรวจ certificate chain/expiry และทางเข้า guest จากภายนอกจริง ไม่เปลี่ยน config เว็บไซต์อื่น ตรวจ access/error log ทั้ง proxy/CDN/APM ให้ไม่เก็บ query token
7. ก่อนเริ่ม workers ตรวจ queue ของฐานข้อมูลปลายทางว่าไม่มีอีเมลจาก backup/demo ทดสอบการส่งจริงไป mailbox ที่กำหนด จากนั้นเริ่ม process:

   ```sh
   docker compose --env-file .env.production -f compose.production.yaml --profile workers up -d
   docker compose --env-file .env.production -f compose.production.yaml ps
   ```

   ต้องตรวจ crash/restart ด้วย engine จริงด้วย `restart: unless-stopped` ใช้กับ process ที่ตาย; healthcheck ที่ unhealthy อย่างเดียวไม่ได้แปลว่า Docker จะ restart ให้เอง
8. กำหนด external uptime/alert collector อ่าน `GET /api/health` และ `GET /api/ops` โดย token อยู่ใน Authorization header เท่านั้น ห้ามใส่ใน URL หรือ shell/log ที่เผยแพร่ ทดสอบ alert และ recovery ถึงผู้รับจริงก่อนเปิด campaign
9. ผ่าน device/backup/restore/rollback checklist แล้วจึงเปิด campaign ในหน้าผู้ดูแลและเชิญทีละร้าน เป็นงานเปิดนำร่อง E แยกจากการเตรียม D

## Health และ incident

- `/api/health`: 200 เมื่อ query DB ได้, 503 เมื่อไม่ได้ ไม่เปิดเผยจำนวนร้าน/การเชื่อมต่อ/รายละเอียดภายใน และไม่ถือว่า workers พร้อม
- `/api/ops`: ไม่ตั้ง token/ไม่ถูกต้อง → 401; ถูกต้อง → 200 หรือ 503 พร้อม worker state, อายุ heartbeat, queue lag และจำนวนงานล้มเหลว ไม่มีผู้รับ/subject/เนื้อหาอีเมล
- Worker ขาด success เกิน 120 วินาที, ERROR/DISABLED, queue ค้างเกิน 300 วินาที, dead letters ที่ยังใช้งานได้ หรือ DB quarantine จะมี alert
- `npm run ops:monitor` เขียน structured event เฉพาะเมื่อสถานะ alert เปลี่ยนหรือ recovery; `--once` คืน exit 1 เมื่อยังไม่พร้อม ต้องต่อ collector/ช่องทางแจ้งเตือนใน hosting จริง ไม่มีการส่ง Slack/อีเมล incident โดยพลการในรอบ local
- ข้อผิดพลาดที่ไม่คาดหมายของ API/Auth.js เก็บ correlation ID, error category และรหัส DB ที่ผ่าน allowlist ไม่เก็บ raw provider message, SQL payload หรือ URL token
- เมื่อยอด/สิทธิ์ผิด หยุดเปิดรับร้านใหม่ เก็บ request ID และช่วงเวลา แยกปัญหาอ่าน/เขียน/queue ตรวจบิลและ stock ledger ก่อนให้ลูกค้าทำซ้ำ

## Backup และซ้อมกู้

Local Windows/PostgreSQL 17:

```powershell
npx tsx scripts/phase1-backup.mts pilot-d
npm run ops:restore-drill -- --backup data/backups/pre-pilot-d-TIMESTAMP
```

ต้องหยุดงานเขียนก่อน backup: helper fingerprint ตารางก่อน clean shutdown และคัดลอก DB กับ `data/slips` พร้อม hash ไฟล์ เก็บ manifest แยกกัน การทดสอบทั้งชุดใช้ `npm run ops:test-restore` สร้าง schema fixture เฉพาะ, ตรวจ capacity/entitlements, กู้ที่ port 55433 และหยุดสำเนาหลังจบ ไม่ทับ data/postgres เดิม ไม่ลบ backup ให้อัตโนมัติ

สำเนาที่กู้ตั้ง `OperationalControl.outboundQuarantinedAt` ในทุก app schema ป้องกัน SMTP แม้คัดลอก config เดิมมา และควรตั้ง `RESTORE_DRILL=true`, `OUTBOUND_EMAIL_ENABLED=false`, เว้น SMTP/Stripe keys พร้อมไม่เริ่ม profile workers ใช้ app version ที่มี restore guard เสมอ การล้าง quarantine ต้องเป็นการตัดสินใจเปิดระบบหลักโดยผู้รับผิดชอบภายหลังการตรวจ ไม่ทำอัตโนมัติเมื่อ restore จบ

Backup local แบบ physical มีข้อมูลจริงและ **ไม่เข้ารหัส** อยู่ใต้ `data/` ที่ไม่เข้า image/git จำกัดสิทธิ์ไฟล์และไม่ส่งต่อ/อัปโหลดเป็น artifact ทั่วไป

เตรียม logical backup เข้ารหัสสำหรับ Docker PostgreSQL ไว้ที่ `npm run ops:backup` โดยใช้ `BACKUP_ENCRYPTION_KEY` เป็น base64 ของ 32 random bytes และ `BACKUP_KEY_ID` บน **backup host** เช่น `node --env-file=.env.backup node_modules/tsx/dist/cli.mjs scripts/ops-backup.mts` มัน stream `pg_dump --format=custom` ผ่าน AES-256-GCM และไม่บันทึก plaintext archive จากนั้นสำรอง slip volume แบบเข้ารหัสแยกต่างหากให้ได้ชุดเวลาเดียวกัน

`npm run ops:decrypt-backup -- data/backups/FILE.pgdump.enc` ตรวจ authentication ก่อนเผยแพร่ plaintext เข้า `data/restore-drills` ไม่ทับไฟล์เดิม ต้องเก็บ key แยกจาก backup/เครื่องแอป และตั้ง retention/offsite copy หลังทราบ hosting

**สิ่งที่พิสูจน์แล้ว:** local physical DB + slip round-trip/checksums/capacity/quarantine และ crypto round-trip/tamper/wrong-key/overwrite tests **สิ่งที่ยังไม่พิสูจน์:** pg_dump/pg_restore ผ่าน production containers, encrypted slip archive, backup schedule/offsite/rotation และเวลาการกู้บนขนาดข้อมูลจริง จึงยังใช้เป็นข้อสรุป production backup พร้อมไม่ได้

## Rollback

1. ปิด admission/หยุดคำเชิญใหม่ และหยุด workers ที่ส่งออกก่อนเปลี่ยน release
2. เก็บ DB/slip backup และรายการบิลที่เข้ามาหลัง backup ก่อน rollback อย่ากู้ทับจนทำให้บิลใหม่หาย
3. Migration D เพิ่มเฉพาะ operational tables ไม่ลบ/เปลี่ยนธุรกรรม สามารถย้อน app image ที่ตรวจ compatibility แล้วโดยเก็บ schema เพิ่มไว้ ห้ามสั่ง `migrate reset`/`down -v`/seed demo บนข้อมูลจริง
4. หากต้องกู้ข้อมูล ให้กู้ข้างระบบเดิมที่แยก DB/port/volume ตรวจ checksum/ledger/entitlements และ quarantine ก่อนสลับ traffic ต้องจัดการส่วนต่างของบิลที่เกิดหลัง backup ก่อนเปิดเขียน
5. ตรวจ guest/login/สิทธิ์/ขายเงินสด/บิล/สต็อก/QR/KDS/กะ/รายงาน พร้อม DB/worker/queue health หลังเปลี่ยน และให้สำเนาเก่าคง read-only จนยืนยันผล

## ก่อนเปิดจริงยังต้องตรวจ

- Linux image/Compose startup, worker crash restart, production TLS/DNS/SMTP และ guest เข้าได้จากอีกเครือข่าย
- ผู้รับ alert จริง, on-call/incident owner, offsite backup/retention และ restore บนสภาพแวดล้อมจริง
- รายละเอียดผู้ให้บริการ/ที่เก็บ/retention ใน privacy และการรับรองข้อมูลติดต่อ
- มือถือ/แท็บเล็ตจริงทั้งแนวตั้ง/แนวนอน, Safari, สแกนเนอร์/เครื่องพิมพ์ 58/80 มม. และ offline network interruption ของอุปกรณ์นั้น
- ติดตามเคส onboarding ที่ล้มเหลวครั้งเดียวในการรันทดสอบรวมครั้งแรก ยังไม่ยืนยันสาเหตุ แม้ทดสอบซ้ำและ burst 100 คำขอผ่านแล้ว เก็บ diagnostic ที่ปลอดภัยไว้และตรวจซ้ำใน staging ก่อน go/no-go

อ้างอิงการเตรียม: [Docker startup order](https://docs.docker.com/compose/how-tos/startup-order/), [PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [Nginx log module](https://nginx.org/en/docs/http/ngx_http_log_module.html), [Nginx official download](https://nginx.org/en/download.html) ตรวจจากแหล่งหลักวันที่ 12 พฤศจิกายน 2026
