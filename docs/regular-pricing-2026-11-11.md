# ราคาปกติและการสมัครด้วย Google — 11 พฤศจิกายน 2026

ราคาต่อไปนี้เป็นราคาปกติสำหรับผู้สมัครทุกคน ไม่จำกัดจำนวนผู้ใช้หรือเฉพาะ 5 คนแรก ราคาเดิมยังปรากฏได้ในเอกสารย้อนหลังและใบแจ้งหนี้เก่า:

| แพ็กเกจ | รายเดือน | รายปี |
|---|---:|---:|
| Starter | 199 บาท | 1,990 บาท |
| Pro | 499 บาท | 4,990 บาท |

ราคายังไม่รวม VAT 7% ตามนโยบายเดิม ยอดรวม Starter รายเดือน 212.93 บาท/รายปี 2,129.30 บาท และ Pro รายเดือน 533.93 บาท/รายปี 5,339.30 บาท รายปีประหยัดเทียบจ่ายรายเดือนครบ 12 เดือน 398/998 บาทตามลำดับ

Lifetime 12,900 บาทและขอบเขตฟีเจอร์ Starter/Pro คงเดิม สิทธิ์นำร่องแยกจากราคา: 5 ธุรกิจแรกที่ได้รับสิทธิ์ใช้ฟรี 30 วันตามกติกา Pilot เดิม ไม่มีการเปลี่ยน release policy หรือเปิด campaign ที่ยัง DRAFT โดยการเปลี่ยนราคานี้

เปลี่ยน catalog ใน PostgreSQL ด้วย migration `20261111103000_regular_plan_prices` และ fallback/seed ที่ `src/lib/plan-pricing.ts` หน้าแรกอ่านราคาเริ่มต้นจาก catalog เดียวกับ pricing/checkout ไม่ฝังตัวเลขซ้ำ การคิด VAT, คูปอง, การยืนยันยอดใหม่เมื่อราคาเปลี่ยน และใบแจ้งหนี้เดิมยังทำงานตามเดิม

Google เพิ่ม identity/challenge ด้วย migration `20261111103500_google_identity` วิธีเปิดใช้งานและข้อจำกัดการทดสอบอยู่ที่ [google-sign-in.md](./google-sign-in.md)

สำรองฐานข้อมูลก่อนเปลี่ยนไว้ที่ `data/backups/pre-phase3-2026-11-11T09-27-00-097Z` และเก็บ checksum ของ User/Tenant/Product/Order/SaasPayment/Pilot/ReleaseSettings ใน `output/pricing-google/before.json` สำหรับเทียบหลังทดสอบ

## ผลทดสอบ

- Production build และ TypeScript ผ่าน ใช้งาน local production server ที่ `http://localhost:3100`
- ชุดทดสอบทั้งหมด 75/75 ผ่าน รวม 9 กรณี Google: สร้างบัญชีซ้ำพร้อมกัน, profile ไม่ถูกต้อง, ยืนยันอีเมลภายนอก, เชื่อมบัญชีเดิม, subject คงเดิมแม้อีเมลเปลี่ยน, challenge ผิดอีเมล/หมดอายุ/ใช้ซ้ำ/ถูกยกเลิกด้วยการเปลี่ยนรหัสผ่าน, identity conflict และ HTTP origin/provider unavailable
- หลังขยาย quote test เป็น 4 แพ็กเกจ รันทดสอบราคาและ checkout ที่เกี่ยวข้อง 16/16 ผ่าน รวม VAT และการปฏิเสธยอดยืนยันเก่าก่อนปรับราคา
- Browser Chromium ตรวจ 45 กรณี: หน้าแรก/pricing รายเดือนและรายปี, login/register, Google linking/error ที่ความกว้าง 320/375/768/1024/1440 px รวม tablet แนวตั้ง/แนวนอน ไม่พบ document/control overflow หรือ page error ปุ่ม Google สูง 48 px และปิดไว้เมื่อไม่มี credentials ตรวจภาพจริงทั้ง mobile และ tablet แล้ว
- เปรียบเทียบ checksum หลังล้างข้อมูลทดสอบ: User 18, Tenant 17, Product 151, Order 28 และทุกแถวเดิมใน SaasPayment/Pilot/ReleaseSettings ตรงก่อนเปลี่ยน ข้อมูลร้านเดิมและสิทธิ์นำร่องไม่ได้เปลี่ยน
- หลักฐาน: `output/pricing-google/tests.log`, `pricing-checkout-tests.log`, `responsive.json`, `before.json`, `after.json`, `build.log` และภาพ PNG ในโฟลเดอร์เดียวกัน

ยังไม่ได้ทดสอบ consent/callback กับ Google จริงเพราะไม่มี OAuth credentials ตามที่ผู้ใช้แจ้ง การทดสอบ identity ด้านบนใช้ profile จำลองที่ส่งเข้าบริการหลังชั้นตรวจ OIDC ไม่ใช่หลักฐานการยืนยัน ID token จริง รวมทั้งยังไม่ได้ตรวจบนอุปกรณ์จริง/Safari
