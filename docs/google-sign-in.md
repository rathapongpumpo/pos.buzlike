# เปิดใช้ Google Sign-In — BUZLIKE POS

สถานะ 11 พฤศจิกายน 2026: เตรียมโค้ด ฐานข้อมูล ปุ่มสมัคร/เข้าสู่ระบบ และการเชื่อมบัญชีเดิมแล้ว ยังไม่มี Google OAuth Client จึงแสดงปุ่มที่กดไม่ได้พร้อมข้อความว่าเตรียมเปิดใช้งาน ผู้ใช้ยังสมัคร/เข้าสู่ระบบด้วยอีเมลได้ตามปกติ ไม่ถือว่าผ่านการทดสอบกับ Google จริง

## ตั้งค่าบัญชี Google

1. เปิด [Google Auth Platform](https://console.cloud.google.com/auth/overview) เลือกหรือสร้างโครงการสำหรับ BUZLIKE POS
2. ตั้ง Branding: ชื่อแอป BUZLIKE POS, อีเมล support, homepage, privacy policy และ terms ที่เผยแพร่จริงสำหรับ production ยืนยันโดเมนตามที่ Console ร้องขอ
3. ตั้ง Audience เป็น External หากเปิดให้ลูกค้าทั่วไป ระหว่าง Testing ให้เพิ่มอีเมลผู้ทดสอบ รวมผู้เข้าร่วมนำร่องที่ต้องใช้ Google; ก่อนเปิดทั่วไปเปลี่ยนสถานะและทำ verification ตามที่ Google ระบุ
4. สร้าง OAuth Client ชนิด Web application ใช้ client แยกสำหรับ local และ production เพื่อแยก secrets และ redirect URIs
5. Local Authorized JavaScript origin: `http://localhost:3100` และ Authorized redirect URI: `http://localhost:3100/api/auth/callback/google` ต้องตรงกันทุกตัว ห้ามเพิ่ม `/` ท้าย callback
6. Production ใช้ origin HTTPS ของระบบ POS ที่ deploy จริง และ callback `<POS_HTTPS_ORIGIN>/api/auth/callback/google` ไม่ใช้โดเมนเว็บบริษัทแทนโดเมนแอป หากจะใช้ `http://127.0.0.1:3100` ให้เพิ่ม origin/callback ชุดนั้นแยกด้วย
7. ใส่ Client ID และ Client Secret ใน `.env` ของ POS หรือ secret manager ของ deployment โดยตรง ห้ามส่ง secret ในแชตหรือ commit ลง repository:

```dotenv
AUTH_GOOGLE_ID=<Web application Client ID>
AUTH_GOOGLE_SECRET=<Client Secret>
# Local
AUTH_URL=http://localhost:3100
NEXT_PUBLIC_APP_URL=http://localhost:3100
```

Production เปลี่ยน `AUTH_URL` และ `NEXT_PUBLIC_APP_URL` เป็น HTTPS origin จริง คง `AUTH_SECRET` เดิมและตั้งค่า trusted proxy ให้ Host ตรงกับโดเมนแอป จากนั้นรัน `npm run db:migrate`, `npm run build` และ restart application อย่าเปิด public login ด้วยค่า placeholder

## พฤติกรรมและความปลอดภัย

- ขอเฉพาะ `openid email profile` ไม่มีสิทธิ์ Gmail, Drive หรือ Calendar ตรวจ OIDC ผ่าน Auth.js และใช้ PKCE + state
- เก็บ `sub` ของ Google ใน `GoogleIdentity` โดยผูกได้หนึ่ง Google ต่อหนึ่ง User ไม่เก็บ access/refresh tokens ใช้ `sub` ระบุตัวตนถาวร การเปลี่ยนอีเมลที่ Google ไม่ทำให้เข้าสู่ร้านของเจ้าของอีกราย
- บัญชีใหม่จาก Gmail/Google Workspace ที่ Google ยืนยันอีเมลแล้ว เริ่มตั้งร้านว่างผ่าน onboarding ได้ตามกติกาของระบบ สำหรับ Google ที่ใช้อีเมลภายนอกและไม่มี `hd` ต้องยืนยันกล่องจดหมายผ่านระบบอีเมลเดิมก่อนเข้า onboarding/รับสิทธิ์นำร่อง
- หากมีอีเมลนี้อยู่แล้ว ไม่เชื่อมอัตโนมัติ ระบบให้ยืนยันรหัสผ่านเดิม แล้วเลือก Google อีเมลเดียวกัน สร้าง challenge ที่เก็บเฉพาะ hash ใช้ได้ครั้งเดียวภายใน 10 นาที ผ่าน HttpOnly/SameSite cookie; การเปลี่ยนรหัสผ่านทำให้ challenge เดิมใช้ไม่ได้ มีการตรวจ origin และจำกัดความถี่
- รหัสผ่านเดิม ร้าน สาขา สิทธิ์ทีม และแพ็กเกจเดิมยังใช้ User ID เดิม บัญชี Google ใหม่ไม่มีรหัสผ่านที่ระบบสุ่มให้ และไม่ได้รับร้าน/ข้อมูลตัวอย่าง
- Google login ไม่ให้สิทธิ์นำร่องอัตโนมัติ และไม่เปิด checkout ที่ release policy ปิดไว้ สิทธิ์ 5 ธุรกิจ/30 วันใช้กติกา Pilot เดิม
- หน้า error กลับมาหน้าเข้าสู่ระบบพร้อมข้อความไทย ไม่มีการแสดง token/secret และ next destination ใช้ allowlist เดิม รวมการเลือกแพ็กเกจและคำเชิญพนักงาน

## ทดสอบหลังได้รับ credentials จริง

1. ตรวจ `/api/auth/providers` มี `google` และปุ่มสมัคร/เข้าสู่ระบบกดได้
2. ทดสอบยกเลิก consent แล้วกลับมาเข้าสู่ระบบใหม่ได้ รวมผิดพลาดที่ callback ต้องเห็นข้อความไทย
3. ใช้ Gmail ใหม่สมัคร เลือกบัญชี ตั้งร้านว่าง ออกจากระบบและกลับเข้าร้านเดิม จำนวน User/Tenant ต้องไม่เพิ่ม
4. ทดสอบบัญชีอีเมล/รหัสผ่านเดิม: กด Google → ยืนยันรหัสผ่านเดิม → เลือก Google อีเมลเดียวกัน → เข้าร้านเดิม รหัสผ่านยังเข้าสู่ระบบได้
5. ทดสอบเลือก Google คนละอีเมล, challenge หมดอายุ/ใช้ซ้ำ และเปลี่ยนรหัสผ่านระหว่างรอ: ต้องเชื่อมไม่ได้และไม่มีการย้ายร้าน
6. ทดสอบเลือก Starter/Pro รายเดือน/รายปีก่อนสมัคร และการรับคำเชิญทีม: หลังกลับจาก Google ต้องดำเนินการต่อได้
7. ทดสอบอีเมลภายนอกบน Google ที่ไม่มี Workspace: ต้องยืนยันอีเมลด้วยลิงก์จริงก่อนตั้งร้าน/รับสิทธิ์นำร่อง
8. ตรวจ Chrome Android, Safari iOS/iPadOS และ desktop จริง รวมทั้ง Secure cookies และ callback ของ production

เอกสารทางการที่ใช้: [Auth.js Google configuration](https://authjs.dev/getting-started/providers/google), [Google ID token และขอบเขตการยืนยันอีเมล](https://developers.google.com/identity/sign-in/web/backend-auth), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
