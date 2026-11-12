# เชื่อม GitHub กับ Hostinger

Repository: https://github.com/rathapongpumpo/pos.buzlike — branch `main`, root directory `/` (โฟลเดอร์บนสุดของ repository)

รอบนี้ส่งขึ้น GitHub เท่านั้น ยังไม่ได้ deploy, ตั้งโดเมน, เชื่อมฐานข้อมูล production หรือเปิดรับร้านนำร่อง ข้อมูลจริงในเครื่อง, `.env`, backup, สลิป และ generated QA evidence ไม่ถูกส่งขึ้น Git; ลิงก์หลักฐานในรายงานเก่าบางส่วนจึงเปิดได้เฉพาะ checkout ต้นทาง

## ตรวจชนิดแพ็กเกจก่อน

ระบบนี้ใช้ **PostgreSQL** พร้อม transaction/constraints เฉพาะ PostgreSQL ไม่สามารถนำ MySQL ของ hosting มาแทนผ่านการแก้ `DATABASE_URL` อย่างเดียว

- **Hostinger Node.js Web App (Business/Cloud):** เชื่อม GitHub ได้ แต่ PostgreSQL ต้องใช้ผู้ให้บริการภายนอก เช่น Supabase/Neon หรือเซิร์ฟเวอร์แยก ตรวจการเชื่อมต่อและ connection limits ก่อนเปิดจริง
- **Hostinger VPS:** ใช้ `compose.production.yaml` และ Nginx ตาม [คู่มือ production](pilot-deployment.md) จัดการ PostgreSQL, worker และ persistent volumes ในเซิร์ฟเวอร์ได้เอง

สำหรับ managed Node.js ต้องยืนยันกับ Hostinger ว่ารองรับ process ของ `email:worker`, `pilot:worker`, `ops:monitor`, การเก็บ `data/slips` ข้าม redeploy และ SSE ระยะยาว หากรองรับไม่ครบต้องจัดบริการเหล่านี้แยกหรือใช้ VPS การเชื่อม repository สำเร็จยังไม่ยืนยันว่าระบบพร้อมใช้งานจริง

## ตั้งค่า Node.js Web App

1. hPanel → Websites → Create site / Add Website → Node.js Web App → Import Git repository → GitHub แล้วอนุญาตให้เข้าถึง repository นี้
2. เลือก `pos.buzlike`, branch `main`, framework **Next.js**, Node.js **22.x**, output `.next`, build command `npm run build` ระบบมี `package-lock.json` และ `postinstall` สำหรับ Prisma generate อยู่แล้ว ต้องติดตั้ง devDependencies ระหว่าง build ด้วย
3. ใช้ startup ของ Next.js preset ที่ Hostingerจัดให้ หากตั้งคำสั่งเองต้องใช้ `next start` โดยฟัง host/port ตาม platform; `npm start` ในโปรเจ็กต์ตั้งไว้ `127.0.0.1:3100` สำหรับ local จึงไม่ควรคัดลอกโดยไม่ตรวจ port ของ Hostinger ห้ามใช้ static export
4. เพิ่ม environment ใน hPanel จาก `.env.production.example` โดยกรอกค่าจริงเฉพาะใน hosting **ห้ามอัปโหลด `.env` เข้า GitHub** ค่า `DATABASE_URL` ต้องเป็น PostgreSQL ปลายทางจริง, `AUTH_SECRET`/`OPERATIONS_TOKEN` เป็นรหัสสุ่มคนละชุด, `AUTH_URL`/`NEXT_PUBLIC_APP_URL` เป็น HTTPS โดเมนที่จะใช้ตั้งแต่ build
5. ตั้ง `SEED_DEMO=false`, `OUTBOUND_EMAIL_ENABLED=false`, เว้น Stripe keys ไว้ระหว่างเตรียม ตั้ง SMTP/admin ของ production แยกจากเครื่องพัฒนา ก่อนเปิดจริงตรวจข้อมูลนโยบายและ `LEGAL_CONTACT_APPROVED` ตามคู่มือ production
6. รัน `npm run db:migrate` เป็นงาน release แยกที่เชื่อม PostgreSQL ปลายทางได้ ก่อนเริ่ม app รุ่นใหม่ หากแพ็กเกจไม่มี shell/one-shot job ต้องจัด release runner แยก; คำสั่ง build ปัจจุบัน **ไม่ได้ migrate/seed ฐานข้อมูลให้อัตโนมัติ** ห้ามใช้ `migrate reset`, `db push` หรือ seed demo บน production
7. เริ่มต้น catalog/admin และโหมด private pilot เฉพาะฐานข้อมูลใหม่ตาม [คู่มือ production](pilot-deployment.md) ไม่ย้ายฐานข้อมูล demo ในเครื่องขึ้นโฮสต์ จากนั้นทดสอบ `/api/health`, login, migration version, SSE, persistence, workers และ backup/restore ก่อนเปิดรับลูกค้า

การสมัคร/ยืนยันอีเมลต้องมี SMTP และ email worker ทำงานจริง Google login เปิดเมื่อมี OAuth credentials ครบและ callback ของโดเมนจริง Stripe ยังคงปิดในแผน private pilot การ initialize ไม่เปิด campaign หรือเชิญร้านให้อัตโนมัติ

GitHub integration อาจ redeploy ทุกครั้งที่ push เข้า branch ที่เชื่อม ควรตั้ง approval/staging ตามความสามารถของแพ็กเกจ และสำรองฐานข้อมูลก่อน release ที่มี migration

## เอกสารอ้างอิง Hostinger

ตรวจเมื่อ 12 พฤศจิกายน 2026; หน้าตา hPanel/ข้อจำกัดขึ้นกับแพ็กเกจ

- [Deploy Node.js จาก GitHub](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Prisma บน Node.js hosting](https://www.hostinger.com/support/how-to-deploy-prisma-apps-on-hostinger-node-js-hosting/)
- [ข้อจำกัดฐานข้อมูล managed hosting และ external PostgreSQL](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/)
