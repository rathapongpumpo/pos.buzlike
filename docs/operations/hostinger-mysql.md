# Hostinger MySQL / MariaDB

เป้าหมาย production ตามที่ผู้ใช้ยืนยัน: ใช้ฐานข้อมูล MySQL ที่รวมอยู่ใน Hostinger ไม่เพิ่มผู้ให้บริการฐานข้อมูลภายนอก ตรวจ SSH พบ MariaDB **11.8.9**; ทดสอบในเครื่องด้วยรุ่นเดียวกัน บันทึกวันที่ 13 พฤศจิกายน 2026

## สร้างฐานข้อมูลใน hPanel

1. เลือกเว็บไซต์ `pos.buzlike.com` → **ฐานข้อมูล → การจัดการ** → สร้างฐานข้อมูล MySQL และผู้ใช้ใหม่เฉพาะ POS เช่น suffix `pos` อย่าใช้ฐานข้อมูลของเว็บไซต์อื่น
2. จด **ชื่อเต็ม** ของฐานข้อมูลและผู้ใช้ที่มี prefix เช่น `u196912583_pos` ตั้งรหัสผ่านใหม่เฉพาะฐานข้อมูล เก็บใน password manager/ไฟล์ส่วนตัว ไม่ส่งในแชต
3. ใช้ host `127.0.0.1`, port `3306` สำหรับแอปที่รันใน Hostinger เดียวกัน ไม่ต้องเปิด remote MySQL สาธารณะ SSH tunnel ใช้สำหรับ migration จากเครื่องผู้ดูแลได้
4. ตั้ง environment จาก `.env.mysql.example` ในหน้า **ตัวแปรสภาพแวดล้อม** โดยใช้ค่าจริง:

   ```dotenv
   DATABASE_PROVIDER=mysql
   DATABASE_URL=mysql://FULL_DB_USER:URL_ENCODED_PASSWORD@127.0.0.1:3306/FULL_DATABASE_NAME?connection_limit=5&connect_timeout=10&pool_timeout=20
   TOKIO_WORKER_THREADS=2
   SEED_DEMO=false
   ```

   `DATABASE_URL` เป็นค่าลับ รหัสผ่านที่มี `@`, `:`, `/`, `#`, `%` ต้อง percent-encode เฉพาะส่วนรหัสผ่าน ใช้ `DATABASE_PROVIDER=mysql` ทั้ง build และ runtime ห้ามคัดลอก URL PostgreSQL ในเครื่องมาใช้

5. อัปโหลด ZIP ฉบับที่รองรับ MySQL แล้วเลือก **Next.js / Node 22.x / npm / build `npm run build` / output `.next`** การสร้างตารางไม่ถูกรวมใน build โดยอัตโนมัติ ต้องทำงาน release ด้านล่างก่อนเปิดใช้งานจริง

## Schema และการ release

- `prisma/schema.prisma` และ `prisma/migrations/`: PostgreSQL เดิม เก็บเพื่อไม่ทำลายฐานข้อมูล/ประวัติ local ที่มีอยู่
- `prisma/mysql/schema.prisma` และ migrations ภายใต้โฟลเดอร์นั้น: MySQL/MariaDB แยกประวัติกัน มี baseline และข้อกำหนดข้อมูล/trigger สำหรับ MariaDB
- `postinstall`, `db:generate`, `db:migrate` เลือก schema จาก `DATABASE_PROVIDER` หรือ URL `mysql://`; ถ้าค่าขัดกันจะหยุด ไม่มีการแปลงข้อมูล PostgreSQL ไป MySQL ให้อัตโนมัติ

บน source checkout ส่วนตัวที่มี dependency สำหรับ release ครบ และโหลด environment ของ production อย่างถูกต้อง:

```sh
npm ci --include=dev
npm run db:migrate
npm run db:seed
```

กำหนด `SEED_DEMO=false` และบัญชี `SEED_ADMIN_*` ของ production ก่อน seed เมื่อสร้าง admin แล้วถอดรหัส seed ออกจาก environment การ seed ซ้ำไม่เปลี่ยนรหัสบัญชีเดิม ฐานข้อมูล MySQL ใหม่เริ่ม `PRIVATE_PILOT / checkout DISABLED` โดยไม่มีการเปิด campaign/เรียกเก็บเงิน หลังตรวจ config ให้ใช้ `ops:init-pilot -- --empty-database` ตามคู่มือ pilot เพื่อสร้าง campaign DRAFT; initializer จะปฏิเสธถ้ามีข้อมูลลูกค้า

รัน migration ผ่าน **source release ส่วนตัว** ไม่ใช่ artifact `hbuilds/current/nodejs` ของ Next.js: ตรวจจริงแล้ว artifact เดิมไม่มี Prisma CLI, tsx หรือไฟล์ migrations การติดตั้ง dependency/build ไม่ถือว่า migration สำเร็จ ใช้ `db:migrate` แทน `npx prisma migrate deploy` เพื่อเลือกประวัติ MySQL ให้ถูก

คง `OUTBOUND_EMAIL_ENABLED=false`, Stripe/Google ยังไม่ตั้งค่าระหว่างเตรียม ให้ `/api/health` ตอบ 200 หลังเชื่อมต่อและสร้างตารางแล้ว จากนั้นตรวจ `ops:preflight`, `/api/ops`, บัญชี admin, private pilot, SMTP, backup/restore และ cron ก่อนเปิดรับร้านจริง การผ่าน health เพียงอย่างเดียวไม่ได้พิสูจน์ว่าตาราง/worker พร้อม

## Transaction และข้อกำหนดข้อมูล

- InnoDB row ใน `DatabaseMutex` ใช้แทน transaction advisory lock ล็อกถูกปล่อยเมื่อ commit/rollback ไม่ใช้ `GET_LOCK` ที่ผูกกับ pooled session
- Serializable transaction retry เฉพาะ conflict/deadlock/lock timeout และ MariaDB error **1020**; ไม่ retry ข้อผิดพลาดธุรกิจโดยอัตโนมัติ
- คิวอีเมล claim ผ่าน `FOR UPDATE SKIP LOCKED` ใน transaction เดียว ไม่พึ่ง PostgreSQL `UPDATE RETURNING` เวลาและ defaults เป็น UTC
- เงินยังใช้ Decimal/จำนวนสตางค์ unique บิลเดิมยังอยู่ สต็อกติดลบ/อ้างอิงข้าม tenant/สาขา/refund เกินยอดยังถูกปฏิเสธ
- ข้อกำหนด capacity, อายุ 30 วัน, verified invitation, frozen terms, version และ grant ที่เริ่มใช้แล้วมีทั้ง application checks และ DB triggers/checks สำหรับ MariaDB
- `activeTenantId` เป็น generated column ที่ migration จัดการเองเพื่อแทน partial unique index ไม่ใช่ field ให้แอปเขียน
- คอลัมน์ข้อความยาวรองรับอีเมลเข้ารหัส/ภาษาไทย/emoji; collation `utf8mb4_bin` รักษาการเทียบ identifier แบบตรงตัว โค้ดยัง normalize email/slug ตามกติกาเดิม
- MySQL ตรวจ foreign keys ระหว่าง cascade ทันที หากต้องลบ tenant ที่มีข้อมูลให้ลบลูกตามลำดับใน transaction ห้ามปิด foreign key checks หรือเปลี่ยน product-category เป็น cascade เพื่อหลบข้อจำกัด

## งานตามเวลาใน Hostinger

Web/Cloud ไม่รองรับ worker ที่ทำงานตลอดเวลา ใช้ cron ที่เรียกงาน **ครั้งเดียวแล้วจบ** ทุกนาทีสำหรับ pilot และ email และจัดรอบ monitor/backup ให้เหมาะกับแพ็กเกจ ตรวจจำนวน cron ที่แพ็กเกจอนุญาตก่อน

เตรียม source checkout ส่วนตัวที่มี `node_modules` ครบไว้ภายนอก `public_html` และให้ `pos-jobs` ชี้ไป source นั้น ตัวอย่าง command (ตรวจ path Node.js จริงของบัญชีก่อน):

```sh
/opt/alt/alt-nodejs22/root/usr/bin/node --env-file=/home/u196912583/domains/pos.buzlike.com/hbuilds/config/.env /home/u196912583/pos-jobs/scripts/hostinger-job.mjs email
```

เปลี่ยน argument เป็น `pilot` หรือ `monitor` สำหรับ job อื่น `hostinger-job.mjs` เพิ่ม `--once` ให้ worker เดิมและโหลด TS จาก source ส่วนตัว อย่าเรียก worker แบบ loop ผ่าน cron และอย่าส่ง token/password ใน URL งาน cron ไม่ได้รับ environment เว็บอัตโนมัติ จึงต้องมี `--env-file` ที่เป็นไฟล์ส่วนตัว ตรวจว่า command ไม่เกิน 255 ตัวอักษร

สิ่งที่ทดสอบแล้วคือ launcher ทำงานครั้งเดียวและเคารพการปิดส่งอีเมล **ยังไม่ได้สร้าง cron/ทดสอบ delivery บนบัญชี Hostinger จริง** Cron ถี่ทุกนาทีเป็นแนวทางสำหรับ pilot ต้องวัด queue lag และ throughput ใหม่ก่อนเพิ่มจำนวนร้าน ไม่ใช่การรับประกันรองรับผู้ใช้จำนวนมาก

## Backup และ rollback

`npm run ops:backup:mysql` ใช้ `mariadb-dump` พร้อม single transaction, routines, triggers แล้ว stream เข้า AES-256-GCM ไม่สร้าง SQL plaintext ระหว่าง backup ใช้ `BACKUP_ENCRYPTION_KEY`/`BACKUP_KEY_ID` บน backup host เก็บ key แยกจาก archive หาก binary ไม่อยู่ใน PATH ระบุ `MYSQL_DUMP_BINARY`

ตัว decrypt เดิม `ops:decrypt-backup` รองรับ `.sql.enc` และคืนไฟล์ `.sql` ในพื้นที่ส่วนตัว กู้เฉพาะฐานข้อมูล MySQL แยก จากนั้นตั้ง `OperationalControl.outboundQuarantinedAt`, ปิด SMTP/Stripe และตรวจจำนวน/hash ตารางก่อนใช้งาน ตัว backup/physical restore เดิมของ PostgreSQLใช้แทน MySQL ไม่ได้ สำรองไฟล์สลิปส่วนตัวแยกชุดเวลาเดียวกัน และจัด schedule/offsite/retention พร้อมซ้อมกู้บน production จริงก่อน go-live

ผล local: dump ที่เข้ารหัส → decrypt → กู้เข้า DB แยก ตรวจข้อมูลตรงกัน **51 ตาราง** แล้ว quarantine สำเนา ไม่มีการส่งอีเมลจริง ผลนี้ไม่ครอบคลุมสิทธิ์ TRIGGER/dump/restore ของผู้ใช้ hPanel, retention/offsite หรือ SLA ของ hosting

ก่อนเปลี่ยน release เก็บ archive เวอร์ชันเดิมและ backup ของ DB/slips ที่ใช้งานจริง ห้ามใช้ `migrate reset`, `db push`, `down -v` หรือนำฐานข้อมูล demo ขึ้น production การ rollback แอปต้องคงข้อมูลบิลหลัง backup และตรวจ schema compatibility

อ้างอิงตรวจ 13 พฤศจิกายน 2026: [MySQL connection](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/), [MariaDB ของ Hostinger](https://www.hostinger.com/support/1583226-which-database-management-system-is-used-at-hostinger/), [Node.js cron](https://www.hostinger.com/support/how-to-run-cron-jobs-for-node-js-websites-at-hostinger/), [MariaDB 1020](https://mariadb.com/docs/server/reference/error-codes/mariadb-error-codes-1000-to-1099/e1020)
