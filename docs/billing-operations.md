# การตั้งค่าและตรวจสอบระบบสมาชิก

## การเตรียม Stripe Sandbox

ยังไม่ได้เชื่อมบัญชี Stripe ในเครื่องนี้ ขั้นตอนต่อไปนี้เป็น runbook สำหรับเมื่อมีบัญชีแล้ว ไม่ใช่ผลทดสอบที่เกิดขึ้นแล้ว

1. ใช้ Sandbox/Test ก่อน ใส่ `STRIPE_SECRET_KEY=sk_test_...` และ `STRIPE_WEBHOOK_SECRET=whsec_...` ใน `.env` โดยตรง ห้ามเก็บ keys ใน source, ภาพหลักฐานหรือแชต ตั้ง `NEXT_PUBLIC_APP_URL` ให้ตรงกับ origin ที่ใช้งาน
2. SDK ปัจจุบันคือ Stripe 18.5 และ API ที่ระบุใน `stripe-client.ts` คือ `2025-08-27.basil` ใช้ snapshot events; endpoint ใช้เฉพาะรหัส event/object แล้วเรียกอ่านสถานะปัจจุบัน จึงไม่ใช้ payload เก่าทับสถานะใหม่
3. ตั้ง webhook `/api/webhooks/stripe` และส่ง event กลุ่ม checkout completed/expired/async success/async failure, invoice paid/payment_failed, customer.subscription created/updated/deleted/paused/resumed และ charge.refunded
4. Local ใช้ Stripe CLI forward webhook ไป port 3100 และใช้ signing secret ของ listener นั้น Staging ใช้ public HTTPS URL และ secret ของ endpoint staging
5. เปิด PromptPay ใน Sandbox และตั้ง Billing customer portal ให้รองรับการเปลี่ยนวิธีชำระเงิน หน้าระบบใช้ portal flow เฉพาะ `payment_method_update` ไม่ใช้ portal เปลี่ยนราคา/แพ็กเกจกลางรอบ
6. รัน app, `npm run billing:worker` และ `npm run email:worker` เป็นคนละ process ตรวจและแยก fixture/outbox ก่อนเปิด SMTP จริง

## การตรวจรับก่อนเปิดช่องทาง

- ใช้บัญชีเจ้าของร้านใหม่: เลือกแพ็กเกจ → สมัคร → ยืนยันอีเมล → ตั้งร้านเปล่า → ยืนยันยอดรวม VAT → Checkout → กลับมาบัญชีเดิมและมีสิทธิ์ตามแพ็กเกจ ไม่สร้างบัญชีลูกค้าใหม่จาก webhook
- จ่ายบัตรทดสอบและ PromptPay ทดสอบตามวิธีของ Stripe ต้องเห็น receipt, period และสิทธิ์ตรงกับ Dashboard ห้ามถือว่าการกลับมาหน้า success คือรับเงินจริง
- ส่ง event เดิมซ้ำ/สลับลำดับ ดูว่าหนึ่ง Stripe invoice มี SaasPayment เดียวและ EmailOutbox เดียว ปิด worker/ตัด webhook แล้วตรวจว่ากู้กลับมาได้
- ใช้ Test Clock ตรวจต่ออายุและบัตรตัดไม่ผ่าน ตรวจ grace 3 วันและรายงานย้อนหลังยังดูได้ ยกเลิกก่อนจบรอบตรวจว่าไม่มีรอบตัดบัตรใหม่ และเปิดต่ออายุอีกครั้งได้ก่อนสมาชิกสิ้นสุด
- ทดสอบ partial/full refund บน Dashboard ตรวจยอดคืนและสิทธิ์ของรอบอื่น ต้องไม่เปิดรอบที่คืนเงินแล้วกลับมาเมื่อ replay invoice.paid
- ทดสอบ hosted portal เปลี่ยนบัตร การปิดหน้าชำระก่อนจ่าย และกรณี async payment ไม่สำเร็จ

## Worker และการกู้สถานะ

`npm run billing:worker` ทำงานเป็นรอบทุกประมาณ 30 วินาที รับงานที่พร้อมและทิ้ง lease ให้กู้ได้หลัง 5 นาที หาก provider ล่มจะลองใหม่แบบ backoff และไม่เก็บ payload/credentials ใน error

`npm run billing:worker -- --once` ทำหนึ่งรอบ; `npm run billing:reconcile` ตรวจขยายทุกธุรกิจและ event ที่อ่านได้ย้อนหลัง 29 วัน ใช้เพื่อกู้การหยุดทำงานนาน ต้องมี Test keys สำหรับทดสอบในเครื่องนี้

ตรวจตาราง `WebhookEvent`: status `PENDING/PROCESSING/RETRY/PROCESSED`, attempts, availableAt, processedAt และ lastError ไม่มี payload ดิบ ข้อมูล secret หรือรายละเอียดบัตร เกณฑ์ alert เมื่อ RETRY เพิ่มต่อเนื่องหรืองานพร้อมเกิน 5 นาทีอยู่ในงาน deployment เฟส 4

ตรวจ `SaasPayment`: checkoutKey/checkoutHash กันคำขอซ้ำ, providerRef อ้าง Checkout session หรือ renewal invoice, stripeInvoiceId กัน invoice ซ้ำ, stripePaymentIntentId เชื่อม refund, providerCheckedAt กันตรวจรายการชุดเดิมจนรายการอื่นไม่ได้ทำงาน, periodStart/periodEnd เป็นช่วงสิทธิ์, receipt เป็น snapshot, refundedAmount เป็นยอดคืนสะสม

กรณีไม่แน่ใจว่า Stripe สร้าง Checkout แล้วหรือไม่ ห้ามลบแถว PENDING เพื่อให้กดจ่ายใหม่ ใช้ปุ่ม **ชำระรายการเดิม**, ตรวจสถานะ หรือ worker กู้ session จาก metadata เดิม ระบบไม่สร้างด้วย idempotency key เก่าเมื่อพ้นช่วงปลอดภัย 23 ชั่วโมง ถ้าค้น provider ครบแล้วไม่พบ session หลัง 24 ชั่วโมงจึงปล่อยรายการเป็น EXPIRED

การเปลี่ยนราคาที่ Stripe Dashboard, invoice แบบ prorate/credit, หรือการใช้ subscription ของระบบอื่นมาผูก metadata เดิมจะถูกปฏิเสธการเปิดสิทธิ์อัตโนมัติ ต้องตรวจแก้ต้นเหตุ ไม่กดอนุมัติสลิปแทนรายการบัตร

## เอกสารอ้างอิงที่ตรวจประกอบงาน

Stripe ระบุว่าต้องรองรับ event ซ้ำและลำดับการส่งที่ไม่แน่นอน จึงใช้ inbox + invoice identity + canonical provider reads: [Stripe webhooks](https://docs.stripe.com/webhooks)

วงจรสมาชิกใช้ invoice และ subscription events โดยแยกการรับเงินออกจากการมี subscription object: [Subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
