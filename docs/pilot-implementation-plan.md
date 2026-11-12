# แผน implementation — นำร่อง 5 ธุรกิจ ฟรี 30 วัน

วันที่: 10 พฤศจิกายน 2026 · โปรเจ็กต์ `D:\Projects\1.buzlike\pos.buzlike`

สถานะล่าสุด 11 พฤศจิกายน 2026: **A ทำแล้วและตรวจใน local ผ่าน 66/66 tests** — [รายงานเฟส A](phases/pilot-a.md) เพิ่ม schema/runtime แล้ว; campaign ยัง DRAFT และ release ยัง LEGACY ไม่เปิดโครงการจริง เฟส B–F ยังรอดำเนินการ เป็นการปรับลำดับงานต่อจากเฟส 3 ไม่แทนที่รายงานผลเฟสเดิม ไม่แก้โปรเจ็กต์อื่น

## 1. ผลลัพธ์และขอบเขตที่ใช้วางแผน

เปลี่ยนการเปิดรับลูกค้าใหม่เป็น **Private Pilot**: ผู้ได้รับเชิญสมัคร/ยืนยันอีเมล ตั้งร้านเปล่า ตั้ง PIN และเข้าใช้ Pro ฟรีได้เองโดยไม่ชำระเงิน เจ้าของแพลตฟอร์มทำเฉพาะการคัดร้าน/ออกคำเชิญครั้งแรก ติดตามฟีดแบ็กและแก้ปัญหา ไม่ต้องเปิดสิทธิ์แต่ละร้านซ้ำด้วยมือ

ข้อกำหนดตั้งต้นจากแนวทางที่คุยกัน:

| ประเด็น | พฤติกรรมที่จะทำ |
|---|---|
| จำนวน | 5 **ธุรกิจ/Tenant** รวมทั้งโครงการ ไม่ใช่ 5 พนักงานหรือ 5 สาขา และไม่ใช่โควตาเพิ่มแยกต่อบัญชี |
| ผู้เข้าร่วม | ใช้คำเชิญเฉพาะอีเมลของผู้ได้รับเลือก 1 เจ้าของได้ 1 ธุรกิจในโครงการ คนทั่วไปสมัครบัญชี/ลงทะเบียนรอได้ แต่ไม่สร้างร้านทดลองใหม่โดยอ้อม |
| แพ็กเกจ | สิทธิ์ `PILOT_PRO_V1`: ฟีเจอร์ Pro, สูงสุด 3 สาขา และโควตาอื่นตาม Pro snapshot ขณะเริ่ม ไม่รวมสิทธิ์ Lifetime/การติดตั้งเอง |
| ระยะเวลา | 30 × 24 ชั่วโมง เริ่มเมื่อ transaction เปิดร้าน/ผูกธุรกิจสำเร็จ ไม่เริ่มตอนส่งคำเชิญหรือสมัครบัญชี; เก็บ UTC แสดงวันและเวลาไทยชัดเจน |
| การจอง | หลังยืนยันอีเมลและรับคำเชิญ จองได้ 72 ชั่วโมงเพื่อทำ setup ให้เสร็จ; ก่อนยืนยันอีเมลไม่หักโควตา |
| วันหมดคำเชิญ | 7 วันจากการออก/ส่งใหม่ การส่งใหม่หมุน token และทำให้ลิงก์เก่าใช้ไม่ได้ ไม่เริ่มระยะเวลาใช้งานใหม่ |
| การใช้สิทธิ์ | รับคำเชิญสำเร็จกับ setup สำเร็จเป็นคนละสถานะ; การกดซ้ำ/refresh/หลายแท็บต้องได้ grant และร้านเดิม |
| การหมุนสิทธิ์ | การจองหมดอายุก่อนเริ่มคืนที่ว่างได้ แต่ธุรกิจที่เริ่มแล้วนับเป็นสิทธิ์ที่ใช้ไปตลอด แม้หมดเวลา ถอนตัว หรือเปลี่ยนเป็นสมาชิกชำระเงิน ไม่วนแจกเกิน 5 ธุรกิจ |
| หมดเวลา | แจ้งล่วงหน้า 7/3/1 วัน; ครบกำหนดเป็นอ่านอย่างเดียว เก็บข้อมูลเดิม เจ้าของดู/ส่งออกรายงานได้ ไม่ตัดเงินเอง |
| ระบบยังไม่พร้อมขาย | ผู้ดูแลขยายวันสิ้นสุดเป็นช่วงที่ระบุชัดพร้อมเหตุผลและ audit ไม่ต่ออายุฟรีเงียบ ๆ และไม่ลบบิลเพื่อเริ่มรอบใหม่ |
| ผู้ใช้เดิม | migration ไม่เปลี่ยน trial 14 วัน สมาชิกชำระเงิน ข้อมูลสินค้า บิล หรือสต็อกเดิม; ให้สิทธิ์นำร่องเฉพาะผู้ได้รับเชิญและเลือกธุรกิจชัดเจน |
| การเปิดเก็บเงิน | ปิดการสร้าง checkout ใหม่ทุกช่องทาง รวมโอนแนบสลิปและ Lifetime ระหว่างนำร่อง; เก็บระบบ billing เดิมไว้เพื่อใช้เมื่อพร้อม |

การคัด 5 ร้านควรครอบคลุมคาเฟ่/ร้านอาหาร/ค้าปลีก และอย่างน้อย 1 ธุรกิจทดสอบหลายสาขา พร้อมใช้มือถือและ tablet จริง สิ่งนี้เป็นเกณฑ์คัดผู้เข้าร่วม ไม่ใช่โควตาที่ทำให้บางประเภทธุรกิจสมัครบัญชีไม่ได้

## 2. สิ่งที่ตรวจพบจากโค้ดปัจจุบัน

- `/api/onboarding` สร้าง Tenant ทดลอง 14 วัน มี request key/draft และ transaction กันร้านซ้ำแล้ว นำกลับมาใช้ ไม่สร้าง flow ตั้งร้านอีกชุด
- `safeNext` อนุญาตเฉพาะคำเชิญพนักงานและเลือกแพ็กเกจ ยังไม่มีเส้นทางเชิญนำร่องที่อยู่ข้าม signup/verification ได้
- หน้าแรก, `Pricing`, `/subscribe`, `PlanIntent`, `accountNavigation` และหน้าสมาชิกยังพาเข้าสู่การเลือกซื้อแพ็กเกจตาม flow เดิม
- สิทธิ์อ่านจาก `Tenant` ผ่าน `subscriptionState/context/feature` แต่มีผู้เรียกหลายจุด เช่น public QR, คำเชิญทีม, export, bootstrap และสถานะ billing จึงแก้เพียงแบนเนอร์หรือ `trialEndsAt` ไม่พอ
- มี `EmailOutbox` เข้ารหัส/กันซ้ำและ worker สำหรับลิงก์บัญชี ใช้ต่อกับคำเชิญ/การเตือนหมดสิทธิ์ได้ โดยไม่ส่งอีเมลอยู่ใน transaction
- มี superadmin, AuditLog ที่ผูก Tenant และผลรวมข้อมูลสำหรับรายงาน แต่ยังไม่มีโครงการนำร่อง คิวผู้สนใจ ฟีดแบ็ก หรือประวัติการจัดการก่อนมี Tenant
- รายงานเฟส 3 ระบุ 53 tests ผ่านใน local และ Stripe ยังไม่ทดสอบ Sandbox ต้องรักษาชุดตรวจเดิมระหว่างเพิ่มงานนี้ ไม่ตีความผลเดิมเป็น production readiness

## 3. โครงสร้างข้อมูลที่จะเพิ่ม

ทุกตารางใหม่เป็น additive migration สำรองก่อนย้าย ไม่ reset/reseed; รายละเอียด SQL/Prisma อยู่ในผลส่งมอบเฟส A

| Model | ข้อมูลหลัก | ความสัมพันธ์/ข้อจำกัด |
|---|---|---|
| `ReleaseSettings` | singleton, `releaseMode` LEGACY / PRIVATE_PILOT / COMMERCIAL, `checkoutMode` DISABLED / EXISTING_ONLY / PUBLIC, version, updatedBy/At | ใช้ฝั่ง server เป็นนโยบายเดียว ทั้ง UI และ API; เพิ่มเป็น LEGACY ก่อนเพื่อไม่สลับผู้ใช้เดิมระหว่าง migration; การเปิดโหมดนำร่องทำภายหลังตรวจรับ |
| `PilotCampaign` | id, slug unique, status DRAFT/OPEN/PAUSED/CLOSED, capacity=5, durationDays=30, reservationHours=72, entitlementProfile/version, createdAt | จำกัด capacity 1–5 สำหรับโครงการนี้ ไม่เพิ่ม capacity หลังเริ่มแจก; เปลี่ยนค่ากติกาต้องมี audit |
| `PilotInvitation` | id, campaignId, normalizedEmail, tokenHash unique, tokenVersion, expiresAt, revokedAt, claimedByUserId?, claimedAt?, createdByUserId | ไม่เก็บ raw token; claim ได้เฉพาะ verified email ที่ตรงคำเชิญ; เชิญใหม่/หมุน token ต้องไม่รีเซ็ต grant ที่เคยเริ่มแล้ว |
| `PilotEnrollment` | id, campaignId, ownerId, invitationId, tenantId?, status, reservedUntil?, activatedAt?, endsAt?, version, entitlementsSnapshot | UNIQUE(campaignId,ownerId), UNIQUE(campaignId,tenantId) เมื่อมี Tenant, UNIQUE(invitationId); composite FK ยืนยัน invitation อยู่ campaign เดียวกัน; Tenant/owner ต้องตรงตอน activate |
| `PilotWaitlistEntry` | id, userId unique, status WAITING/INVITED/WITHDRAWN, notifyConsentAt?, withdrawnAt?, createdAt, notifiedAt? | ใช้ verified account/email เดิม ไม่ขอชื่อหรือเบอร์โทรเพิ่ม ไม่สร้าง Tenant หรือใช้สิทธิ์จากการลงทะเบียนรอ; การแจ้งเปิดบริการใช้ความยินยอมสำหรับข้อความนี้ ไม่พ่วง newsletter |
| `PilotFeedback` | id, enrollmentId, tenantId, branchId, submittedByUserId, submittedByStaffId, requestKey, category BUG/USABILITY/FEATURE/GENERAL, message, optionalRating, pageKey, deviceClass, severity?, status, createdAt | composite FK (enrollmentId,tenantId), (tenantId,branchId), (tenantId,submittedByStaffId) ป้องกันข้ามร้าน; UNIQUE(tenantId,submittedByStaffId,requestKey), rating 1–5, ความยาวข้อความจำกัด; severity P0–P3 กำหนดโดยผู้ดูแลขณะ triage |
| `PilotFeedbackHistory` | feedbackId, actorUserId, fromStatus/toStatus, note, createdAt | เก็บประวัติรับเรื่อง/กำลังแก้/แก้แล้ว ไม่ทับข้อความเดิมของผู้ใช้; เข้าถึงผ่านสิทธิ์ของ feedback |
| `PilotAuditEvent` | campaignId, enrollmentId?, actorUserId?, action, reason, before/after ที่จำเป็น, createdAt | บันทึกตั้งแต่ออกคำเชิญจนขยายสิทธิ์/หมดอายุ ไม่ต้องสร้าง Tenant ปลอมเพื่อใส่ AuditLog; ไม่เก็บ token หรือข้อมูลบัตร |

เพิ่ม `User.pendingPilotInvitationId?` เพื่อกลับมารับคำเชิญต่อหลังยืนยันอีเมล/เปลี่ยนอุปกรณ์ได้ เป็นเพียงบริบทก่อนรับสิทธิ์ ไม่ใช่ grant และไม่ใช้แทนการตรวจ token/email

เพิ่ม reference ชนิด notification, enrollment/version และวันสิ้นสุดเป้าหมายใน EmailOutbox สำหรับ pilot เพื่อให้ worker ตรวจความสดของข้อความก่อนส่ง ไม่แอบใส่ความสัมพันธ์ไว้ในข้อความอีเมลที่ parse ย้อนกลับไม่ได้

`PilotEnrollment` ใช้สถานะ RESERVED → ACTIVE → EXPIRED / REVOKED / CONVERTED; RESERVED ที่หมดเวลาหรือยกเลิกก่อนเริ่มเป็น RELEASED แถวของเจ้าของเดิมนำกลับมาจองได้เฉพาะเมื่อยังไม่เคย activate และมีคำเชิญที่ถูกต้อง โดยเพิ่ม version/audit

### กติกาความถูกต้องของข้อมูล

1. ความจุที่ใช้ = ทุก enrollment ที่มี `activatedAt` แล้ว ไม่ว่าสถานะปัจจุบันอะไร + reservation ที่ยังไม่ activate และยังไม่หมดเวลา ต้องไม่เกิน 5
2. ทุกคำสั่งจอง/activate/ปล่อยจองล็อก row ของ Campaign ใน transaction แบบ Serializable เดียวกัน เรียง lock Campaign → Invitation → User/Tenant เหมือนกันทุก endpoint
3. อ่านเวลา UTC จากฐานข้อมูลหลังได้ lock ภายใน transaction แล้วตรวจ deadline อีกครั้งก่อน commit ไม่อาศัยเวลาเครื่องลูกค้า worker หรือจำนวนที่แสดงบนหน้าเว็บเป็นตัวตัดสิน
4. `activatedAt`, owner, campaign และ Tenant ของ grant ที่เริ่มแล้วห้ามเปลี่ยนเพื่อแจกซ้ำ; `endsAt` เปลี่ยนได้ผ่านคำสั่งขยายที่มีเหตุผลและ compare-and-swap version เท่านั้น
5. เพิ่ม CHECK สำหรับวันหมดหลังวันเริ่ม/ระยะเวลาบวก และ index `(campaignId,status,reservedUntil)`, `(status,endsAt)`, `(tenantId,createdAt)` ตามงาน query จริง ไม่ใช้ `NOW()` ใน unique-index predicate
6. ไม่ลบ campaign/enrollment ที่เคยเริ่มแล้วแบบ cascade จนเสียประวัติ; การลบบัญชี/ธุรกิจต้องผ่านขั้นตอนเก็บรักษาข้อมูลที่กำหนดก่อน production
7. การจองร้านสุดท้ายพร้อมกันต้องสำเร็จเพียงหนึ่งคำขอ อีกคำขอได้รับสถานะเต็มและทางไป waitlist; retry request เดิมคืน enrollment เดิม ไม่ขยายวัน
8. ไม่สร้าง `SaasPayment` ยอด 0/PAID ปลอม และไม่ตั้ง `isLifetime` เพื่อให้ใช้ฟรี

## 4. การคำนวณสิทธิ์ให้ตรงกันทุกทางเข้า

เพิ่ม service กลาง `resolveEntitlements(tenant, enrollment, now)` คืน source, สถานะ, ชื่อสิทธิ์, วันสิ้นสุด, limits และ feature flags แยกจากการชำระเงินจริง

- SUSPENDED และคำสั่งระงับโดยผู้ดูแลมีลำดับเหนือสิทธิ์นำร่อง
- สมาชิกชำระเงิน/Lifetime เดิมไม่ถูก grant ฟรีทับ การเข้าร่วมนำร่องกับร้านที่มีสมาชิกชำระเงินอยู่แล้วต้องถูกปฏิเสธพร้อมคำอธิบาย
- เมื่อมี grant นำร่องที่ยังใช้ได้ ให้ Pro snapshot ของธุรกิจนั้น แม้วันทดลอง 14 วันใน Tenant จะผ่านไปแล้ว
- เมื่อสิทธิ์นำร่องหมดหรือถูก revoke หลังเคย activate ไม่มี grace การชำระเงิน 3 วันแถมให้อัตโนมัติ และห้าม fallback กลับ trial 14 วันเพื่อใช้งานต่อ; สมาชิกชำระเงินที่ยืนยันแล้วเท่านั้นจึงให้สิทธิ์ต่อได้
- การคำนวณวันหมดทำใน request จึงหยุดคำสั่งเขียนได้แม้ worker หยุด; worker ใช้ส่งแจ้งเตือน/อัปเดตสถานะ ไม่ใช่กลไกบังคับสิทธิ์เพียงตัวเดียว
- ปรับทุกจุดที่อ่าน Tenant โดยตรง: context/feature/quota, bootstrap, public QR, SSE, staff invitation, report export, billing/status และแบนเนอร์ app shell ให้ใช้ผลเดียวกัน; ไม่เปิด self-host export ของ Lifetime ให้ Pro
- อ่านอย่างเดียวยังเข้าดูประวัติและส่งออกรายงานของสาขาที่มีสิทธิ์ได้ การเข้าถึงฟีดแบ็ก/ข้อมูลส่วนตัวคงตรวจ membership ตามเดิม
- Offline queue ต้องไม่ทิ้งบิลค้างเมื่อหมดสิทธิ์ ห้ามสร้างใบใหม่โดยอาศัย cache สิทธิ์เก่า; บิลค้างที่ server ปฏิเสธเก็บให้เจ้าของตรวจ/ส่งออกเพื่อกู้ข้อมูล โดยไม่เชื่อเวลาเครื่องหรือเปิดสิทธิ์ขายต่อโดยอัตโนมัติ

แยกนโยบายการเปิดรับ/รับเงินออกจาก Campaign: ปิดรับสมาชิกชำระเงินใหม่ไม่หยุดประมวลผล webhook, ใบเสร็จ, การยกเลิก และ reconciliation ของรายการเดิมที่มีอยู่

## 5. Flow ของผู้ใช้

### ผู้ได้รับเชิญ

คำเชิญ → อ่านเงื่อนไข 5 ธุรกิจ/ฟรี 30 วัน → สมัครหรือเข้าสู่ระบบ → ยืนยันอีเมล → จองสิทธิ์ → ตั้งชื่อร้าน/ประเภทธุรกิจ/PIN → activate ร้านเปล่าพร้อม Pro → เริ่มเพิ่มสินค้า

- GET หน้า invitation แสดงข้อมูลและตรวจลิงก์ ไม่ใช้สิทธิ์ ไม่สร้างร้าน และไม่เริ่มนับวันจาก Link prefetch
- ใช้ token entropy สูง เก็บ hash, ปิด referrer และ redact query ใน log; แลกบริบทเข้า signed HttpOnly cookie แล้วนำ raw token ออกจาก URL บริบทที่เก็บข้ามอุปกรณ์เป็น invitation ID ของบัญชี ไม่เก็บ raw token ใน draft/localStorage
- ขยาย `safeNext` ด้วยเส้นทางนำร่องที่อนุญาตชัดเจน ไม่เปิด arbitrary redirect และไม่ปะปนกับ `/invite` สำหรับพนักงาน
- สมัครใหม่เก็บ pending invitation ที่ตรวจแล้วพร้อม user ภายใน transaction; บัญชีเดิมที่ยังไม่ verified ต้องบันทึกบริบทที่ตรวจแล้วก่อนส่งไปยืนยัน เพื่อเปิด verification link บนอีกอุปกรณ์แล้วทำต่อได้
- รหัสเชิญต้องตรง verified email จริง รวมบัญชีเดิมที่เคยได้รับยกเว้น email verification ในรุ่นก่อน; ไม่อาศัยเพียง `needsVerification=false` ของ legacy account
- หลังจองแล้วทำ setup เกิน 72 ชั่วโมง ต้องจองใหม่ตามที่ว่าง ห้ามเริ่มสิทธิ์จาก reservation หมดอายุ
- การสร้าง Tenant, branch/owner, onboarding dedupe และ activate enrollment เกิดใน transaction เดียว ถ้าส่วนใดล้มเหลว rollback ทั้งหมด retry ได้ร้านและเวลาเดิม
- ผู้มีธุรกิจทดลองอยู่แล้วเลือกผูกกับร้านเดิมได้เมื่อเป็นเจ้าของและไม่มีสมาชิกชำระเงิน ไม่สร้างร้านซ้ำเงียบ ๆ; บัญชีที่เคย activate แล้วไปสร้างธุรกิจที่สองจะไม่ได้สิทธิ์นำร่องอีก

### ผู้ไม่มีคำเชิญ/โครงการเต็ม

หน้าแรก → “ลงทะเบียนรอเปิดบริการ” → สมัคร/ยืนยันอีเมล → waitlist → ดูสถานะได้ ไม่มีทางลัด `/onboarding`, `/subscribe`, request API หรือ social login ที่สร้าง trial ใหม่ได้

### ผู้เข้าร่วมที่ใช้งานอยู่

- หน้าแรกแสดง “ไปที่ร้านของคุณ” หลังเข้าสู่ระบบ แทนปุ่มสมัครซ้ำ
- แบนเนอร์ “Pro นำร่อง · ใช้ได้ถึง [วัน/เวลา]” พร้อมปุ่มแจ้งปัญหา ไม่แสดงว่าเสียเงินหรือเป็น Lifetime
- หน้าสมาชิกแสดงสิทธิ์นำร่อง/วันสิ้นสุดและราคาในอนาคตที่ระบุว่ายังไม่เปิดรับชำระ ไม่มี CTA จ่ายเงินที่ดูเหมือนพร้อมแล้ว
- ครบกำหนดเป็นหน้าสรุปอ่านอย่างเดียวพร้อมรายงาน/ช่องทางติดต่อ ถ้ายังไม่เปิดเก็บเงิน ไม่ส่งวนไป Checkout ที่ใช้ไม่ได้
- เมื่อเปิดเชิงพาณิชย์ ลูกค้าเลือกซื้อเอง ใช้ Tenant เดิม สินค้า สาขา พนักงาน บิล และสต็อกเดิม ไม่มีการย้ายร้าน; เปลี่ยน enrollment เป็น CONVERTED หลังยืนยันรับเงินจริงเท่านั้น

ใน PRIVATE_PILOT ต้องปรับข้อความสมัครเดิมที่บอก “ทดลองฟรี 14 วัน” ให้ตรงกับ invite/waitlist และละเว้น `selectedPlan` เก่าในการพาไปซื้อ เพื่อไม่ให้ `/start` วนกลับ `/subscribe` ที่ปิดรับเงิน เมื่อเปิดขายให้ลูกค้ายืนยันแพ็กเกจอีกครั้ง ไม่เอาความสนใจเก่ามาเรียกเก็บเงิน

## 6. API และหน้าจอที่จะเพิ่ม/แก้

| งาน | เส้นทาง/ไฟล์หลัก | จุดควบคุม |
|---|---|---|
| Admission และ commerce policy | ใหม่ `src/lib/release-policy.ts`; ปรับ onboarding, checkout/resume/quote, subscribe, auth navigation | server บังคับ PRIVATE_PILOT ทุกคำสั่งสร้างร้าน/การชำระใหม่ บัญชีรอไม่ถูกนับเป็นร้าน |
| คำเชิญ/จอง | ใหม่ `/pilot`, `/pilot/invite`, `/api/pilot/context`, `/api/pilot/claim` | verified email, hash/expiry/revoke, origin, rate limit, global capacity, idempotency |
| ตั้งร้าน | ปรับ `/api/onboarding`, `/onboarding`, draft/account-links | นำ requestKey เดิมกลับมาใช้และ activate ใน transaction; ไม่เก็บ PIN ใน pilot context |
| สิทธิ์ | ใหม่ `src/lib/entitlements.ts`; ปรับ `license-guard`, QR API, invitations API, bootstrap/view-types, export, SSE, offline handling | ใช้สิทธิ์เดียวกันและยังคง tenant/branch isolation |
| คิวผู้สนใจ | ใหม่ `/pilot/waitlist`, `/api/pilot/waitlist` | สมาชิก verified ทำเองได้, กันซ้ำ, ถอนจากรายการได้, ไม่ส่งข่าวการตลาดโดยอัตโนมัติ |
| ฟีดแบ็ก | ใหม่ `/{storeSlug}/feedback`, `/api/v1/{storeSlug}/feedback` | tenant + membership; พนักงานส่ง/ดูเรื่องของตน เจ้าของดูเรื่องในร้าน ผู้ดูแลเห็นทั้งหมด |
| ผู้ดูแล | ใหม่ส่วน Pilot/Feedback ใน superadmin และ `/api/admin/pilot`, `/api/admin/feedback` | SUPER_ADMIN, รายการเชิญ/ร้าน/เวลาคงเหลือ, pause/revoke/extend, optimistic version, เหตุผล+audit |
| งานตามเวลา | ใหม่ `scripts/pilot-worker.mts`; ใช้ EmailOutbox เดิม | ปล่อย reservation ค้าง, expire, แจ้งก่อนหมดสิทธิ์และหมดแล้วแบบไม่ส่งซ้ำ |
| Public UI | หน้าแรก, Pricing, AuthForm, PlanIntent, app shell, Billing | CTA/สถานะตรง server; ปิด Lifetime purchase, ไม่มีตัวเลขเหลือปลอม |

Endpoints ที่เพิ่มเป็นรายการวางแผน ไม่ใช่ API ที่มีอยู่แล้ว ต้องอัปเดต route inventory/test matrix ระหว่าง implementation

## 7. ฟีดแบ็กและตัวชี้วัด

ฟอร์มสั้น: ประเภทเรื่อง + ข้อความ + คะแนนความง่าย 1–5 (ไม่บังคับ) แนบ page key และ device class จาก allowlist ไม่เก็บรหัสผ่าน PIN token cookie เนื้อหาบิล ข้อมูลลูกค้า หรือ screenshot อัตโนมัติ รุ่นแรกไม่ทำอัปโหลดไฟล์

ผู้ดูแลกรองตามธุรกิจ สาขา หมวด ความรุนแรง สถานะ และ mobile/tablet ได้ เพิ่ม note และเปลี่ยนสถานะพร้อมประวัติ ลูกค้าเห็นว่าเรื่องถูกรับแล้ว/กำลังแก้/แก้แล้ว ไม่ต้องส่งผ่าน Slack หรือบริการภายนอก บันทึกทั้งบัญชีผู้เข้าสู่ระบบและพนักงานที่สลับ PIN โดยดึง branch/operator จาก context ฝั่ง server พนักงานดูเรื่องของตนเฉพาะสาขาที่ยังได้รับสิทธิ์ ไม่ใช้ owner session ที่อยู่เบื้องหลัง PIN มาเปิดดูเรื่องของพนักงานทุกคน

ตัวชี้วัดเริ่มจากข้อมูลธุรกรรมเดิมด้วย read-only aggregate ไม่เพิ่ม write analytics ที่ทำให้คิดเงินหน้าร้านล้มเหลว:

- จำนวนรับคำเชิญ/ตั้งร้านสำเร็จ และเวลาจาก activate ถึงบิลแรก
- วันที่ขายจริง บิลที่จ่ายแล้ว การคืนบิล การปิดกะ และความต่างระหว่างยอดรายงานกับรายการจริง
- ฟีดแบ็กและ defect ค้างตามประเภท/ธุรกิจ/อุปกรณ์ เวลารับเรื่องและแก้
- การใช้ Pro: QR/KDS/สูตรสินค้า/หลายสาขาที่ตรวจจากข้อมูลที่มีได้ ไม่ตีความการเปิดหน้าเป็นการใช้ฟีเจอร์สำเร็จ
- สัมภาษณ์สั้นสัปดาห์ละครั้ง: งานที่ติดขัด งานที่ยังต้องทำภายนอก และอยากใช้แพ็กเกจใดต่อในราคาที่แจ้ง เก็บเป็นความตั้งใจ ไม่รายงานเป็นยอดขายจริง

ไม่อ้างวัด “เวลาเฉลี่ยปิดบิล” หรือ retention ที่ยังไม่มี event/วันข้อมูลรองรับ หากต้องการเพิ่ม telemetry ให้กำหนด event, ขอบเขตข้อมูล และวิธีนับก่อน

## 8. เฟสลงมือและเกณฑ์ตรวจรับ

ใช้รหัส A–F ของแผนนำร่องเพื่อไม่สับสนกับเฟส 1–5 เดิม รายงานทีละเฟสตามคำสั่งผู้ใช้

| เฟส | งานที่ส่งมอบ | เกณฑ์ผ่านก่อนเดินต่อ |
|---|---|---|
| **A — ฐานข้อมูลและกติกาสิทธิ์ · local ผ่าน** | backup/baseline; additive schema; campaign draft; release policy; central entitlements; ตรวจ caller ทุกจุด — [ผลตรวจ](phases/pilot-a.md) | ยอดข้อมูลเดิมตรง baseline; 20 คำขอพร้อมกันจองได้ 5; retry ไม่เพิ่มร้าน/วัน; ตรวจอีเมล/ข้าม Tenant/หมดสิทธิ์เมื่อ worker หยุด และ feature/quotas Pro แล้ว; ตรวจอุปกรณ์จริงต่อใน B/D |
| **B — สมัครนำร่องและหน้าเว็บ · local ผ่าน** | invite/context/claim, verified signup/login, onboarding เดิม, waitlist, public/billing copy, guards — [ผลตรวจ](phases/pilot-b.md) | ชุดทดสอบรวม 88/88 และ responsive 184 กรณีผ่าน; ผู้ได้รับเชิญตั้งร้านและเริ่มใช้เองได้; ไม่มี invite/เต็ม/ลิงก์หมด/เปิดหลายแท็บมีทางไปต่อ; GET/prefetch ไม่ consume; bypass API ไม่สร้าง trial/รับเงินใหม่; ทดสอบ mobile/tablet ด้วย Chromium emulation แล้ว อุปกรณ์จริงและเปิดโหมดตรวจต่อ D |
| **C — ฟีดแบ็กและการดูแล · local ผ่าน** | feedback + admin, invite/resend/revoke/extend, reminders/expiry worker, audit/dashboard — [ผลตรวจ](phases/pilot-c.md) | ข้ามร้าน/สาขาไม่ได้; rate limit/ส่งซ้ำ; ขยายและหมดสิทธิ์ชนกันไม่ผิดวัน; reminder enqueue ครั้งเดียวและ worker ไม่ claim งานเดียวพร้อมกัน; สิทธิ์หมดจริงแม้ worker หยุด; ปรับสถานะ feedback ตรวจย้อนหลังได้ |
| **D — เตรียมเปิดให้ 5 ร้านจริง · local ผ่าน / รอ production** | production/staging config, HTTPS, SMTP/worker supervisor, error alerts, privacy/support, backup restore/rollback, deployment checklist — [ผลตรวจ](phases/pilot-d.md) | เปิดทางเข้าแบบ guest จริง; ซ้อมกู้ backup บน DB แยกสำเร็จ; ไม่มี demo/secret; ทดสอบอุปกรณ์และ workload ที่กำหนด; ไม่มี defect ที่ทำเงิน/ข้อมูล/สิทธิ์ผิด; ได้ปลายทางและสิทธิ์ deploy ก่อนเผยแพร่ |
| **E — นำร่อง 30 วัน** | เปิดคำเชิญทีละร้าน, support/feedback, weekly cohort report, regression ก่อนปล่อยแก้, incident log | มีหลักฐานใช้งานจริงครบ flow; ทุกเรื่องรุนแรงมี owner/ผลแก้; ยอดขาย/คืน/สต็อกตรวจตรง; สรุปความต้องการและความตั้งใจจ่ายก่อนตัดสินเปิดขาย |
| **F — Stripe และเปิดขาย** | ปิด dependency เฟส 3: Sandbox checkout/renew/fail/refund; commercial policies; conversion ร้านเดิม; live smoke ที่ได้รับอนุญาต | provider tests ผ่านจริง; ไม่มี auto-charge จาก pilot; ซื้อเองแล้วใช้ร้านเดิม; การลดแพ็กเกจจัดการโควตาที่เกินโดยไม่ลบข้อมูล; เปิด checkout แบบ explicit switch หลัง go/no-go |

A → B → C → D → E เป็นเส้นทางเปิดนำร่อง ส่วนเตรียมบัญชี Stripe และ Sandbox ของ F ทำระหว่าง E ได้ ไม่เอา Stripe เป็นเงื่อนไขขวางการทดลองฟรี แต่ต้องผ่านก่อนเปิดขาย

สำหรับ D และ F ยังต้องใช้ข้อมูลภายนอก เช่น hosting/DNS, production SMTP ที่ตรวจแล้ว, อุปกรณ์ และบัญชี Stripe ไม่อ้างว่าจบจาก unit tests หรือ build และไม่ deploy เพื่อทดลองโดยไม่มีปลายทางที่อนุญาต

รอบ E นับ 30 วันต่อธุรกิจ สรุปรายสัปดาห์จากวันที่เริ่มของแต่ละร้าน และสรุป cohort รอบสุดท้ายหลังร้านสุดท้ายครบระยะเวลา ไม่บีบเหลือไม่กี่วันให้ร้านที่เริ่มช้ากว่า ก่อนเปลี่ยนจาก Pro นำร่องเป็น Starter ใน F ต้องตรวจจำนวนสาขา/พนักงาน/สินค้าที่เกินโควตา ให้เจ้าของเลือกเก็บ/ปิดใช้งานตามกติกาที่ประกาศหรือเลือก Pro ไม่ลบข้อมูลเพื่อลดโควตาเอง

## 9. ชุดตรวจที่ต้องเพิ่ม

- Capacity: 20 concurrent valid claims, คนจองสิทธิ์สุดท้าย, activate ชน release/expiry, สองเครื่องรับคำเชิญเดียว, คนเดิมรับสองคำเชิญ, ถอนตัว/หมดสิทธิ์/เปลี่ยนเป็น paid แล้วห้ามคืนที่ว่าง
- Identity: verified email ไม่ตรง, ใช้ token เก่า/หมด/ถูก revoke, ไม่มี token, legacy account ยังไม่ verified, verification อีกอุปกรณ์, redirect ภายนอก, invitation ของ campaign อื่น
- Onboarding: response หายหลัง commit, draft ค้าง/สองแท็บ, schema-invalid PIN, reservation หมดระหว่าง setup, quota ร้านเดิม, grant ติดเฉพาะร้านที่เจ้าของเลือก, พนักงานกดแทนเจ้าของไม่ได้
- Rights: วันที่ 14 ยังใช้ pilot ได้ถึงวัน 30, ขอบเขตเวลาเริ่ม/หมด, suspension, paid/Lifetime เดิมไม่ถูกทับ, QR/SSE/feature/quota/report/export/offline ใช้กติกาเดียวกัน
- Commerce: PRIVATE_PILOT + มี Stripe keys ก็สร้าง checkout ใหม่ไม่ได้; BANK_SLIP/Lifetime ไม่เป็นทางอ้อม; รายการเดิมยังดู/ยกเลิก/reconcile ได้; เมื่อเปิดขาย grant เปลี่ยนหลัง paid เท่านั้น
- Feedback: ข้าม Tenant/branch/สมาชิกที่ถูกถอด, duplicate request, HTML/XSS แสดงเป็นข้อความ, ขนาดข้อความ/คะแนน/rate limit, สิทธิ์ดู history, ไม่บันทึก token/ข้อมูลบิลโดยอัตโนมัติ
- Operations: reminder 7/3/1 วันสร้างงานเดียวต่อ enrollment/version/วันเตือน, ก่อนส่งตรวจ version/endsAt และยกเลิกงานเก่าเมื่อขยายวัน, worker หยุด/เริ่มใหม่, provider/SMTP ล่ม, queue lag alerts, restore ครบความจุและ entitlement เดิม ไม่เผลอส่ง outbox จากเครื่อง restore
- Responsive/E2E: 360/390/768/1024 px ทั้งแนวตั้งและแนวนอนที่เกี่ยวข้อง, เป้ากดอย่างน้อย 44 px, keyboard/focus, virtual keyboard/PIN pad, ไม่มี horizontal overflow ทั้งหน้า, ถ่ายภาพจริงและทดสอบ tablet/เครื่องพิมพ์จริงก่อนใช้ขาย

รักษาชุดทดสอบเดิมและเพิ่มเฉพาะพฤติกรรมที่ตรวจความเสี่ยงได้จริง แยก unit/DB/HTTP/browser/device/provider evidence ให้ชัด ไม่กำหนดจำนวน tests เป็นเกณฑ์ความพร้อมเพียงอย่างเดียว

ขอบเขตอีเมล: ใช้ stable Message-ID และ outbox dedupe ลดการส่งซ้ำ แต่ไม่อ้าง exactly-once SMTP เมื่อ server รับแล้วแต่ connection/การบันทึกผลขาดหาย ต้องบันทึกกรณีกำกวมและนโยบาย retry; วันสิ้นสุดในแอปเป็นข้อมูลปัจจุบัน และอีเมลระบุเวลาที่อ้างอิง เพราะข้อความที่ส่งออกไปแล้วเรียกคืนไม่ได้

## 10. การย้ายข้อมูล การเปิดโหมด และ rollback

1. สำรองพร้อม baseline ธุรกิจ/ผู้ใช้/บิล/ยอด/สินค้า/ledger ก่อน migration และซ้อม restore บนฐานข้อมูลแยกตามเฟส D
2. Migration เพิ่มตาราง/ดัชนี/constraints และ settings LEGACY เท่านั้น ไม่แจกสิทธิ์ให้ร้านเดิมอัตโนมัติ ไม่แก้ราคา Starter/Pro หรือใบเสร็จเดิม
3. สร้าง campaign แบบ DRAFT, ตรวจ A–C ด้วย fixture ที่ลบได้, แยก outbox ไม่ส่งอีเมลถึงลูกค้าระหว่างทดสอบ
4. ใน staging เปิด PRIVATE_PILOT + checkout DISABLED ทดสอบทุก entry path รวม POST ตรงและ session เก่า; ปิดการสร้าง free-trial ใหม่ที่ไม่อยู่โครงการ แต่ไม่ตัดสิทธิ์ผู้ใช้เดิม
5. หลัง D ผ่านจึงเปิด campaign และออกคำเชิญจริง ไม่ใส่รายชื่อ/email ลูกค้าลง migration หรือ source
6. Rollback รุ่นแอปต้องยังอ่าน grant ที่เริ่มแล้วได้ ห้ามย้อนใช้ binary ก่อนรู้จัก pilot เพราะจะย้อนกลับไปหมดสิทธิ์ที่ trial 14 วัน; คง schema แบบ additive ใช้รุ่นที่รองรับ pilot หรือ maintenance mode แทน
7. แยกปุ่ม “หยุดรับเพิ่ม” ออกจาก “ระงับร้าน” การ pause/close campaign ไม่ยึด 30 วันที่ให้ไปแล้ว การ revoke ร้านต้องระบุเหตุผลและ audit
8. สำรองระหว่างขายจริงก่อนแก้ข้อมูล หากต้อง restore ต้อง reconcile รายการหลังจุดสำรอง/คิว offline ก่อนเปิดขายต่อ ไม่ทิ้งบิลหลัง backup เงียบ ๆ

## 11. เกณฑ์ตัดสินหลังนำร่อง

ใช้ผลจริง ไม่เปิดขายโดยอัตโนมัติเมื่อครบปฏิทิน:

- ไม่มีปัญหาค้างที่ทำยอดเงิน/สต็อกผิด ข้อมูลหาย ข้ามร้าน หรือคิดสิทธิ์ผิด
- ธุรกิจนำร่องทำ flow ที่ใช้จริงได้ครบ โดยไม่ต้องให้ผู้พัฒนาคอยแก้ฐานข้อมูลหน้างาน และตรวจมือถือ/tablet/อุปกรณ์ของร้านแล้ว
- มี feedback ที่เก็บเป็นระบบและผล regression ของประเด็นหลัก; มีข้อมูลใช้งานและคำตอบเรื่องแพ็กเกจ/ความตั้งใจจ่ายเพียงพอจาก cohort นี้ ไม่ใช้ 5 ร้านอ้างรองรับ scale ใหญ่
- ขั้นตอน support, backup/restore และ workers มีผู้ดูแล/alert ที่ใช้งานได้จริง
- Stripe/การเปิดรับเงินจริงผ่านเกณฑ์ F แล้ว ถ้ายังไม่ผ่านเลือกขยาย pilot เป็นช่วงที่ประกาศใหม่ได้ โดยไม่สร้างหนี้ค่าสมาชิกย้อนหลัง

ผลส่งมอบแต่ละเฟส: รายการเปลี่ยน → migration/data diff → ผลตรวจและภาพ → งานรอ/ข้อจำกัด → สถานะเฟส พร้อมเอกสารใน `docs/phases/` ก่อนเริ่มเฟสถัดไป
