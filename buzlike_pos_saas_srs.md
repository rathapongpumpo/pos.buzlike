# Software Requirements Specification (SRS) & AI Agent Implementation Blueprint
# โปรเจกต์: BUZLIKE POS SaaS (`pos.buzlike.com`)

> ปรับปรุง UX 6 พ.ย. 2026: [แผนสมัครและตั้งร้าน](docs/signup-onboarding-ux-plan.md) กำหนดให้สมัครด้วย email/password/confirmation เท่านั้น ตั้งร้าน 2 ขั้นตอน ระบบสร้างลิงก์ร้านให้อัตโนมัติ ข้อความฉบับใหม่มีผลแทน flow เดิมที่ขัดกัน

> ข้อกำหนดปรับปรุง 5 พ.ย. 2026: อ่าน [แบบระบบ v2](docs/architecture/pos-saas-v2.md) และ [แบบฐานข้อมูล](docs/architecture/pos-saas-v2.sql) ร่วมด้วย ข้อกำหนดล่าสุดให้ลูกค้าสมัคร/ชำระเงิน/เปิดสิทธิ์เอง ร้านเริ่มจากข้อมูลเปล่า และรองรับองค์กรที่มีหลายสาขาพร้อมสิทธิ์รายสาขา แบบ v2 มีผลแทนข้อความเดิมที่ขัดกัน; แบบ DB ยังไม่ใช่ migration ของแอปปัจจุบัน

**ชื่อระบบ:** BUZLIKE SmartPOS Cloud & Lifetime Suite  
**โดเมนเป้าหมาย:** `https://pos.buzlike.com` (เชื่อมโยงจากเว็บหลัก `https://buzlike.com`)  
**รูปแบบระบบ:** Multi-Tenant Cloud POS SaaS (รองรับสมาชิกรายเดือน, รายปี และแพ็กเกจซื้อขาด Lifetime / Self-Hosted)  
**กลุ่มเป้าหมาย:** ร้านกาแฟ คาเฟ่ ร้านอาหาร ร้านเบเกอรี่ และร้านค้าปลีกในประเทศไทย  
**วัตถุประสงค์ของเอกสารนี้:** เอกสารข้อกำหนดความต้องการทางธุรกิจ (Business Requirements) และข้อกำหนดทางเทคนิคฉบับสมบูรณ์ (Software Requirements Specification - SRS) ออกแบบมาเพื่อให้ **AI Coding Agent** (เช่น Cursor, Windsurf, Claude Code, Devin) หรือทีมนักพัฒนาใช้สร้างระบบตั้งแต่เริ่มต้นจนขึ้น Production ได้ทันทีโดยไม่ต้องถามข้อมูลพื้นฐานซ้ำ

## 1. ภาพรวมสถาปัตยกรรมและโมเดลธุรกิจ (Product Vision & Business Model)

### 1.1 แนวคิดหลักของระบบ (Core Concept)
เปลี่ยนระบบเดโม SmartPOS บนเว็บพอร์ตโฟลิโอให้เป็นผลิตภัณฑ์จริงแบบ **Self-Service SaaS** ที่ลูกค้าทั่วไปสามารถเข้ามาที่ `pos.buzlike.com` แล้วทำตามขั้นตอนต่อไปนี้ได้ด้วยตัวเอง 100% ตลอด 24 ชั่วโมง:
1. **กดสมัครสมาชิก (Sign Up) และเลือกประเภทธุรกิจ** (เช่น คาเฟ่, ร้านอาหาร, ร้านค้าปลีก)
2. **ระบบสร้างร้านเปล่า (Empty Store Provisioning)** พร้อมสาขาหลักและสิทธิ์เจ้าของ ให้ลูกค้าเพิ่มสินค้า ตั้งราคา และเลือกเปิดโมดูลเอง มี Free Trial 14 วันเป็นทางเลือก
3. **เลือกแพ็กเกจและชำระเงินออนไลน์** (รายเดือน / รายปี / ซื้อขาด) ผ่าน PromptPay QR อัตโนมัติ หรือบัตรเครดิต/เดบิต
4. **ระบบปลดล็อกสิทธิ์การใช้งาน (Entitlement Activation) อัตโนมัติ** พร้อมออกใบเสร็จรับเงิน/ใบกำกับภาษีอิเล็กทรอนิกส์ทันที

### 1.2 ตารางแพ็กเกจ สิทธิ์การใช้งาน และโมเดลราคา (Pricing & Entitlement Matrix)

| คุณสมบัติ / โควตา (Feature & Quota) | **Free Trial (ทดลองฟรี 14 วัน)** | **Starter (รายเดือน / รายปี)** | **Pro Restaurant (รายเดือน / รายปี)** | **Lifetime Buyout (ซื้อขาดตลอดชีพ)** |
| :--- | :--- | :--- | :--- | :--- |
| **ราคาปกติสำหรับทุกคน (ปรับ 11 พ.ย. 2026; ยังไม่รวม VAT)** | 0 บาท (14 วัน; สิทธิ์นำร่อง 5 ธุรกิจแยกใช้ฟรี 30 วัน) | 199 บาท/เดือน (หรือ 1,990 บาท/ปี) | 499 บาท/เดือน (หรือ 4,990 บาท/ปี) | 12,900 บาท (จ่ายครั้งเดียวจบ) |
| **จำนวนสาขาสูงสุด (`max_branches`)** | 1 สาขา | 1 สาขา | สูงสุด 3 สาขา (เพิ่มสาขาละ 390/ด.) | 1 สาขาหลัก (ซื้อเพิ่มต่อสาขาได้) |
| **จำนวนจุดขาย POS (`max_terminals`)** | 1 เครื่อง | 1 เครื่อง | ไม่จำกัดเครื่อง | ไม่จำกัดเครื่อง |
| **จำนวนรายการสินค้า (`max_products`)** | สูงสุด 50 รายการ | สูงสุด 300 รายการ | ไม่จำกัดรายการ | ไม่จำกัดรายการ |
| **จำนวนบัญชีพนักงาน (`max_staff`)** | 3 บัญชี | 5 บัญชี | ไม่จำกัดบัญชี | ไม่จำกัดบัญชี |
| **ระบบหน้าจอครัว KDS (`enable_kds`)** | เปิดให้ลองใช้ | ไม่รวม | เปิดใช้งานเต็มรูปแบบ | เปิดใช้งานเต็มรูปแบบ |
| **ระบบผังโต๊ะ & สแกน QR สั่งอาหาร (`enable_qr_order`)** | เปิดให้ลองใช้ | ไม่รวม (ขายหน้าร้านอย่างเดียว) | เปิดใช้งานเต็มรูปแบบ | เปิดใช้งานเต็มรูปแบบ |
| **ระบบตัดสต็อกวัตถุดิบตามสูตร (`enable_recipe_bom`)** | เปิดให้ลองใช้ | ตัดสต็อกรายชิ้นพื้นฐาน | ตัดสต็อกตามสูตร BOM (กรัม/มล.) | ตัดสต็อกตามสูตร BOM (กรัม/มล.) |
| **การส่งออกรายงาน CSV/Excel (`enable_export`)** | ปิดไว้ | เปิดใช้งาน | เปิดใช้งาน | เปิดใช้งาน |
| **สิทธิ์การดาวน์โหลดข้อมูล / Self-Host Option** | ไม่รวม | ไม่รวม | ไม่รวม | ใช้บน Cloud ฟรี 1 ปีแรก (ปีถัดไปค่ารักษาเซิร์ฟเวอร์ 1,500 บ./ปี หรือเลือก Export ติดตั้งเองได้) |

### 1.3 สถานะของบัญชีร้านค้า (Tenant Subscription State Machine)
AI Agent ต้องเขียน Middleware ตรวจสอบสถานะของ `Tenant.subscriptionStatus` ตามกฎต่อไปนี้:
* **`TRIALING`**: อยู่ในช่วงทดลองใช้ฟรี 14 วัน เปิดให้ใช้ฟีเจอร์เทียบเท่าแพ็กเกจ Pro เพื่อสร้างความประทับใจ แต่จำกัดสินค้า 50 รายการ และแสดงแถบนับถอยหลังด้านบนจอ (`"ทดลองใช้ฟรีเหลืออีก X วัน — อัปเกรดแพ็กเกจ"`)
* **`ACTIVE`**: ชำระเงินรายเดือนหรือรายปีเรียบร้อยแล้ว เปิด/ปิดฟีเจอร์ตาม `PlanTier` (`STARTER` หรือ `PRO`)
* **`LIFETIME_ACTIVE`**: ซื้อขาดเรียบร้อยแล้ว เปิดฟีเจอร์ทั้งหมดตามสิทธิ์ Lifetime โดยไม่มีวันหมดอายุของซอฟต์แวร์
* **`PAST_DUE` (Grace Period 3 วัน)**: เมื่อครบรอบบิลแล้วยังไม่ได้ชำระเงิน ให้ระบบยังเปิดขายหน้าร้านได้ต่ออีก 3 วัน เพื่อไม่ให้ร้านค้าสะดุดระหว่างมีลูกค้าหน้าร้าน แต่แสดงแบนเนอร์สีส้มเตือนให้ต่ออายุทันที
* **`READ_ONLY` (หมดอายุเกินกำหนด)**: เมื่อหมดช่วงทดลองใช้หรือเกิน Grace Period 3 วัน ให้ **บล็อกการสร้างออเดอร์ใหม่ (`POST /api/orders`)** และพาไปหน้า `/billing` แต่ **ยังอนุญาตให้เจ้าของร้านเข้าดูและดาวน์โหลดรายงานยอดขายย้อนหลังได้** (ห้ามล็อกจนลูกค้าเข้าดูข้อมูลตัวเองไม่ได้)
* **`SUSPENDED`**: บัญชีถูกระงับโดย Super Admin เนื่องจากผิดเงื่อนไขการใช้งาน

## 2. สถาปัตยกรรมทางเทคนิคและโครงสร้างโปรเจกต์ (Tech Stack & Folder Structure)

### 2.1 เทคโนโลยีที่กำหนดให้ใช้ (Mandatory Tech Stack)
* **Framework:** `Next.js 15` (App Router, Server Actions, Route Handlers) + `TypeScript 5+` (Strict Mode)
* **Styling & UI Components:** `Tailwind CSS` + `shadcn/ui` + `Lucide Icons`
* **Typography (ป้องกันบั๊กสี่เหลี่ยม `□□□` ถาวร):** บังคับโหลด `IBM Plex Sans Thai`, `Sarabun` และ `JetBrains Mono` ผ่าน `next/font/google` และตั้งค่าให้คลาส `font-mono` และหน้าใบเสร็จทั้งหมดมี `Sarabun` และ `IBM Plex Sans Thai` เป็น Fallback เสมอ
* **Database & ORM:** `PostgreSQL` (รองรับ Supabase หรือ Neon) + `Prisma ORM` พร้อมบังคับใช้ `tenantId` ในทุกตารางข้อมูลร้านค้า
* **Authentication & Session:** `Auth.js (NextAuth v5)` สำหรับการล็อกอินระดับบัญชีเจ้าของร้าน (Email/Password + Google OAuth) **ควบคู่กับระบบ `POS PIN Switch`** (รหัสตัวเลข 4–6 หลัก) สำหรับให้แคชเชียร์สลับชื่อผู้ขายหน้าเครื่อง POS ได้รวดเร็วภายใน 1 วินาที
* **Real-time Synchronization (POS ↔ KDS ↔ QR Ordering):** ใช้ `Supabase Realtime` หรือ `Server-Sent Events (SSE) + Redis/Upstash PubSub` เพื่อให้เมื่อแคชเชียร์กดรับออเดอร์ หรือลูกค้าสแกน QR สั่งอาหาร รายการจะเด้งขึ้นจอครัว KDS ทันทีโดยไม่ต้องรีเฟรชหน้าเว็บ
* **Offline-First POS Queue:** ใช้ `Zustand` + `Dexie.js (IndexedDB)` เก็บแคตตาล็อกสินค้าและคิวออเดอร์ไว้ในเบราว์เซอร์เครื่องแคชเชียร์ หากอินเทอร์เน็ตที่ร้านหลุดชั่วคราว แคชเชียร์ยังกดคิดเงินและพิมพ์ใบเสร็จได้ตามปกติ แล้วระบบจะ Sync ขึ้นฐานข้อมูลอัตโนมัติเมื่ออินเทอร์เน็ตกลับมา
* **Thai PromptPay QR Generation:** ใช้ไลบรารี `promptpay-qr` + `qrcode.react` สร้าง EMVCo Payload มาตรฐานธนาคารแห่งประเทศไทยตามเบอร์พร้อมเพย์/เลขผู้เสียภาษีของร้านค้า พร้อมฝังยอดเงิน (`amount`) รายออเดอร์อัตโนมัติ
* **Payment Gateway (สำหรับเก็บค่าสมาชิก SaaS):** รองรับทั้ง **Stripe (PromptPay + บัตรเครดิต Auto-recurring)** และ **ระบบโอนเงินสแกน QR พร้อมเพย์แนบสลิป (ตรวจสลิปอัตโนมัติผ่าน Slip Verification API หรืออนุมัติผ่านหน้า Super Admin)**

### 2.2 โครงสร้างโฟลเดอร์มาตรฐาน (Directory Layout)
```text
buzlike-pos-saas/
├── prisma/
│   ├── schema.prisma              # โครงสร้างฐานข้อมูลทั้งหมด
│   └── seed.ts                    # สคริปต์สร้างแพ็กเกจเริ่มต้น, Super Admin และเทมเพลตธุรกิจ 3 ประเภท
├── src/
│   ├── app/
│   │   ├── (marketing)/           # หน้าเว็บขายระบบ pos.buzlike.com
│   │   │   ├── page.tsx           # Landing Page, ตารางราคา, ปุ่มสมัครทดลองฟรี
│   │   │   └── pricing/page.tsx   # หน้าเปรียบเทียบรายเดือน / รายปี / ซื้อขาด
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx     # เข้าสู่ระบบเจ้าของร้าน / พนักงาน
│   │   │   ├── register/page.tsx  # สมัครสมาชิกใหม่
│   │   │   └── onboarding/page.tsx# Wizard ตั้งร้านเปล่า + เลือกประเภทธุรกิจ + ตั้ง PIN เอง
│   │   ├── (app)/[storeSlug]/     # ระบบหลังบ้านของแต่ละร้านค้า (Multi-tenant Route)
│   │   │   ├── dashboard/         # ภาพรวมยอดขายรายวัน, สินค้าขายดี, แจ้งเตือนสต็อกต่ำ
│   │   │   ├── pos/               # หน้าจอขายหน้าร้าน (POS Cashier Terminal)
│   │   │   ├── cfd/               # หน้าจอแสดงผลฝั่งลูกค้า (Customer Facing Display แสดงยอดและ QR)
│   │   │   ├── kds/               # หน้าจอครัว (Kitchen Display System)
│   │   │   ├── tables/            # จัดการผังโต๊ะ, เปิดโต๊ะ, รวมบิล, พิมพ์ QR ประจำโต๊ะ
│   │   │   ├── products/          # จัดการสินค้า, หมวดหมู่, ตัวเลือกเสริม (Modifiers)
│   │   │   ├── inventory/         # คลังวัตถุดิบ, สูตรอาหาร (Recipe BOM), รับเข้า/ปรับสต็อก
│   │   │   ├── orders/            # ประวัติบิล, ค้นหาบิล, ยกเลิกบิล (Void), คืนเงิน (Refund), พิมพ์ซ้ำ
│   │   │   ├── shifts/            # ประวัติการเปิด-ปิดกะแคชเชียร์ และใบสรุปยอด Z-Report
│   │   │   ├── staff/             # จัดการพนักงาน, กำหนดสิทธิ์ (RBAC) และตั้งรหัส PIN 4-6 หลัก
│   │   │   ├── settings/          # ตั้งค่าชื่อร้าน, โลโก้ใบเสร็จ, เลขพร้อมเพย์, VAT 7%, เครื่องพิมพ์
│   │   │   └── billing/           # จัดการแพ็กเกจ, ชำระเงินต่ออายุ, อัปเกรดเป็นซื้อขาด, ดาวน์โหลดใบกำกับภาษี
│   │   ├── m/[tableToken]/        # หน้าเว็บสำหรับลูกค้าสแกน QR สั่งอาหารที่โต๊ะ (ไม่ต้องล็อกอิน)
│   │   ├── superadmin/            # หน้าจัดการระบบสำหรับเจ้าของแพลตฟอร์ม BUZLIKE SYSTEMS
│   │   │   ├── tenants/           # ดูร้านค้าทั้งหมด, ขยายเวลาทดลองใช้, เปลี่ยนแพ็กเกจ
│   │   │   ├── payments/          # ตรวจสอบรายการชำระค่าสมาชิก, อนุมัติสลิป, ออกใบกำกับภาษี
│   │   │   ├── plans/             # แก้ไขราคาแพ็กเกจและสร้างโค้ดส่วนลด (Coupon)
│   │   │   └── analytics/         # รายงานรายได้แพลตฟอร์ม (MRR, ARR, Lifetime Sales, Churn Rate)
│   │   └── api/
│   │       ├── webhooks/stripe/   # รับแจ้งเตือนชำระเงินสำเร็จและต่ออายุอัตโนมัติ
│   │       ├── webhooks/slip/     # รับผลตรวจสลิปโอนเงินค่าแพ็กเกจ
│   │       ├── realtime/          # SSE / Realtime endpoint สำหรับซิงก์ออเดอร์เข้าครัว
│   │       └── v1/[storeSlug]/    # REST API สำหรับ POS Terminal & Offline Sync
│   ├── components/
│   │   ├── pos/                   # คอมโพเนนต์หน้าขาย (ProductGrid, CartPanel, PaymentModal, ThermalReceipt)
│   │   ├── kds/                   # คอมโพเนนต์จอครัว (OrderTicketCard, StationFilter, SLAHeader)
│   │   └── billing/               # คอมโพเนนต์เลือกแพ็กเกจและชำระเงิน
│   └── lib/
│       ├── license-guard.ts       # ฟังก์ชันตรวจสิทธิ์แพ็กเกจและโควตา (Quota Enforcement)
│       ├── promptpay.ts           # ฟังก์ชันสร้างรหัส EMVCo QR PromptPay ตามยอดบิล
│       ├── stock-deduction.ts     # ฟังก์ชันตัดสต็อกวัตถุดิบตามสูตร BOM แบบ Database Transaction
│       └── offline-queue.ts       # ระบบจัดการคิวออเดอร์ใน IndexedDB เมื่อเน็ตหลุด
```

## 3. โครงสร้างฐานข้อมูลฉบับสมบูรณ์ (Complete Prisma Schema)

AI Agent ต้องสร้างไฟล์ `prisma/schema.prisma` ตามโครงสร้างด้านล่างนี้ เพื่อให้รองรับทั้งระบบสมาชิก SaaS, ระบบหลายสาขา, ผังโต๊ะ, สูตรอาหาร BOM และการปิดกะแคชเชียร์:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ==========================================
// 1. SAAS PLATFORM, TENANT & BILLING MODELS
// ==========================================

enum SystemRole {
  USER
  SUPER_ADMIN
}

enum SubscriptionStatus {
  TRIALING
  ACTIVE
  LIFETIME_ACTIVE
  PAST_DUE
  READ_ONLY
  SUSPENDED
}

enum PlanCode {
  FREE_TRIAL
  STARTER_MONTHLY
  STARTER_YEARLY
  PRO_MONTHLY
  PRO_YEARLY
  LIFETIME_BUYOUT
}

enum BusinessType {
  CAFE_BEVERAGE
  RESTAURANT
  RETAIL_SHOP
}

model User {
  id            String       @id @default(cuid())
  email         String       @unique
  passwordHash  String?
  fullName      String
  phone         String?
  systemRole    SystemRole   @default(USER)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  memberships   StaffMember[]
  ownedTenants  Tenant[]     @relation("TenantOwner")
}

model Tenant {
  id                  String             @id @default(cuid())
  name                String
  slug                String             @unique // ใช้ใน URL เช่น pos.buzlike.com/my-cafe
  businessType        BusinessType       @default(CAFE_BEVERAGE)
  ownerId             String
  owner               User               @relation("TenantOwner", fields: [ownerId], references: [id])
  
  // Subscription & Entitlements
  planCode            PlanCode           @default(FREE_TRIAL)
  subscriptionStatus  SubscriptionStatus @default(TRIALING)
  trialEndsAt         DateTime
  currentPeriodEndsAt DateTime?
  isLifetime          Boolean            @default(false)
  stripeCustomerId    String?            @unique
  stripeSubId         String?            @unique
  
  // Quota Limits (Override ได้รายร้านจากหน้า Super Admin)
  maxBranches         Int                @default(1)
  maxTerminals        Int                @default(1)
  maxProducts         Int                @default(50)
  maxStaff            Int                @default(3)
  enableKds           Boolean            @default(true)
  enableQrOrder       Boolean            @default(true)
  enableRecipeBom     Boolean            @default(true)
  enableExport        Boolean            @default(false)

  // Tax & Billing Info ของร้านค้า (สำหรับออกใบกำกับภาษีค่าสมาชิก)
  companyName         String?
  taxId               String?
  billingAddress      String?
  
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt

  branches            StoreBranch[]
  staffMembers        StaffMember[]
  categories          Category[]
  products            Product[]
  modifierGroups      ModifierGroup[]
  ingredients         Ingredient[]
  subscriptions       SaasPayment[]
  auditLogs           AuditLog[]
}

model SaasPayment {
  id                  String   @id @default(cuid())
  tenantId            String
  tenant              Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  invoiceNumber       String   @unique // เช่น INV-202611-0001
  planCode            PlanCode
  amount              Decimal  @db.Decimal(10, 2)
  vatAmount           Decimal  @db.Decimal(10, 2)
  totalAmount         Decimal  @db.Decimal(10, 2)
  paymentMethod       String   // STRIPE_CARD, STRIPE_PROMPTPAY, BANK_SLIP
  status              String   // PENDING, PAID, FAILED, REFUNDED
  slipImageUrl        String?
  paidAt              DateTime?
  createdAt           DateTime @default(now())
}

// ==========================================
// 2. STORE BRANCH, STAFF & SHIFT MANAGEMENT
// ==========================================

enum StaffRole {
  OWNER
  MANAGER
  CASHIER
  KITCHEN
  WAITER
}

model StoreBranch {
  id                  String         @id @default(cuid())
  tenantId            String
  tenant              Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name                String         // เช่น "สาขาสยาม (สำนักงานใหญ่)"
  address             String?
  phone               String?
  taxId               String?        // เลขผู้เสียภาษีสำหรับพิมพ์หัวใบเสร็จ
  receiptHeader       String?        // ข้อความต้อนรับบนหัวใบเสร็จ
  receiptFooter       String?        @default("ขอบคุณที่ใช้บริการ / Thank you!")
  promptPayId         String?        // เบอร์โทร 10 หลัก หรือเลขผู้เสียภาษี 13 หลัก สำหรับสร้าง QR รับเงินหน้าร้าน
  promptPayName       String?        // ชื่อบัญชีพร้อมเพย์ที่แสดงให้ลูกค้าตรวจ
  vatRate             Decimal        @default(7.00) @db.Decimal(5, 2)
  vatInclusive        Boolean        @default(true) // true = ราคาสินค้ารวม VAT แล้ว, false = บวก VAT เพิ่มท้ายบิล
  serviceChargeRate   Decimal        @default(0.00) @db.Decimal(5, 2)
  isActive            Boolean        @default(true)
  
  diningZones         DiningZone[]
  shifts              CashierShift[]
  orders              Order[]
  stockLevels         BranchIngredientStock[]
  stockMovements      StockMovement[]

  @@index([tenantId])
}

model StaffMember {
  id                  String      @id @default(cuid())
  tenantId            String
  tenant              Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  userId              String?
  user                User?       @relation(fields: [userId], references: [id])
  displayName         String
  role                StaffRole   @default(CASHIER)
  pinCodeHash         String      // รหัส PIN 4-6 หลักสำหรับกดสลับพนักงานหน้าเครื่อง POS
  isActive            Boolean     @default(true)
  createdAt           DateTime    @default(now())
  shifts              CashierShift[]
  ordersCreated       Order[]

  @@index([tenantId])
}

model CashierShift {
  id                  String      @id @default(cuid())
  tenantId            String
  branchId            String
  branch              StoreBranch @relation(fields: [branchId], references: [id], onDelete: Cascade)
  staffId             String
  staff               StaffMember @relation(fields: [staffId], references: [id])
  openedAt            DateTime    @default(now())
  closedAt            DateTime?
  startingCash        Decimal     @db.Decimal(10, 2) // เงินทอนตั้งต้นในลิ้นชัก
  expectedCash        Decimal?    @db.Decimal(10, 2) // เงินสดที่ระบบคำนวณได้ (เงินตั้งต้น + ยอดขายเงินสด - เงินสดนำออก)
  actualCash          Decimal?    @db.Decimal(10, 2) // เงินสดที่นับได้จริงตอนปิดกะ
  cashDifference      Decimal?    @db.Decimal(10, 2) // ส่วนต่าง (ขาด/เกิน)
  closingNote         String?
  status              String      @default("OPEN")   // OPEN, CLOSED
  orders              Order[]

  @@index([tenantId, branchId])
}

// ==========================================
// 3. CATALOG, MODIFIERS & RECIPE BOM (INVENTORY)
// ==========================================

model Category {
  id                  String    @id @default(cuid())
  tenantId            String
  tenant              Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name                String
  sortOrder           Int       @default(0)
  kitchenStation      String    @default("MAIN") // MAIN, BAR, BAKERY (ใช้แยกจอ KDS)
  isActive            Boolean   @default(true)
  products            Product[]

  @@index([tenantId])
}

model Product {
  id                  String                  @id @default(cuid())
  tenantId            String
  tenant              Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  categoryId          String
  category            Category                @relation(fields: [categoryId], references: [id])
  sku                 String
  barcode             String?
  name                String
  description         String?
  imageUrl            String?
  price               Decimal                 @db.Decimal(10, 2)
  costPrice           Decimal                 @default(0.00) @db.Decimal(10, 2)
  trackStockType      String                  @default("RECIPE") // NONE, DIRECT_UNIT, RECIPE
  directStockQty      Int                     @default(0)        // ใช้กรณีขายสินค้าสำเร็จรูปเป็นชิ้น
  lowStockThreshold   Int                     @default(5)
  isAvailable         Boolean                 @default(true)
  sortOrder           Int                     @default(0)
  modifierGroups      ProductModifierGroup[]
  recipeItems         RecipeBomItem[]
  orderItems          OrderItem[]

  @@unique([tenantId, sku])
  @@index([tenantId, categoryId])
}

model ModifierGroup {
  id                  String                 @id @default(cuid())
  tenantId            String
  tenant              Tenant                 @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name                String                 // เช่น "ระดับความหวาน", "เลือกชนิดนม", "เพิ่มท็อปปิ้ง"
  isRequired          Boolean                @default(false)
  minSelect           Int                    @default(0)
  maxSelect           Int                    @default(1)
  options             ModifierOption[]
  products            ProductModifierGroup[]

  @@index([tenantId])
}

model ModifierOption {
  id                  String        @id @default(cuid())
  modifierGroupId     String
  modifierGroup       ModifierGroup @relation(fields: [modifierGroupId], references: [id], onDelete: Cascade)
  name                String        // เช่น "หวานน้อย (50%)", "นมโอ๊ต (+20฿)", "เพิ่มช็อตกาแฟ (+15฿)"
  priceDelta          Decimal       @default(0.00) @db.Decimal(10, 2)
  isDefault           Boolean       @default(false)
  sortOrder           Int           @default(0)
}

model ProductModifierGroup {
  productId           String
  product             Product       @relation(fields: [productId], references: [id], onDelete: Cascade)
  modifierGroupId     String
  modifierGroup       ModifierGroup @relation(fields: [modifierGroupId], references: [id], onDelete: Cascade)
  sortOrder           Int           @default(0)

  @@id([productId, modifierGroupId])
}

model Ingredient {
  id                  String                  @id @default(cuid())
  tenantId            String
  tenant              Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  sku                 String
  name                String                  // เช่น "เมล็ดกาแฟคั่วกลาง", "นมสดพาสเจอร์ไรส์", "แก้วพลาสติก 16 oz"
  unit                String                  // เช่น "g", "ml", "ชิ้น"
  costPerUnit         Decimal                 @default(0.0000) @db.Decimal(10, 4)
  lowStockThreshold   Decimal                 @default(500) @db.Decimal(10, 2)
  recipeItems         RecipeBomItem[]
  branchStocks        BranchIngredientStock[]
  movements           StockMovement[]

  @@index([tenantId])
}

model RecipeBomItem {
  id                  String     @id @default(cuid())
  productId           String
  product             Product    @relation(fields: [productId], references: [id], onDelete: Cascade)
  ingredientId        String
  ingredient          Ingredient @relation(fields: [ingredientId], references: [id], onDelete: Cascade)
  quantityUsed        Decimal    @db.Decimal(10, 2) // เช่น ใช้เมล็ดกาแฟ 18 g ต่อ 1 แก้ว

  @@unique([productId, ingredientId])
}

model BranchIngredientStock {
  id                  String      @id @default(cuid())
  branchId            String
  branch              StoreBranch @relation(fields: [branchId], references: [id], onDelete: Cascade)
  ingredientId        String
  ingredient          Ingredient  @relation(fields: [ingredientId], references: [id], onDelete: Cascade)
  currentQty          Decimal     @default(0.00) @db.Decimal(12, 2)
  updatedAt           DateTime    @updatedAt

  @@unique([branchId, ingredientId])
}

model StockMovement {
  id                  String      @id @default(cuid())
  tenantId            String
  branchId            String
  branch              StoreBranch @relation(fields: [branchId], references: [id], onDelete: Cascade)
  ingredientId        String
  ingredient          Ingredient  @relation(fields: [ingredientId], references: [id], onDelete: Cascade)
  type                String      // INBOUND (รับเข้า), SALE_DEDUCTION (ตัดตามบิลขาย), WASTE (ของเสีย), ADJUST (ปรับยอด)
  quantityChange      Decimal     @db.Decimal(12, 2) // ค่าบวกหรือลบ
  balanceAfter        Decimal     @db.Decimal(12, 2)
  referenceOrderId    String?
  note                String?
  createdAt           DateTime    @default(now())

  @@index([tenantId, branchId, createdAt])
}

// ==========================================
// 4. TABLES, ORDERS, KDS & PAYMENTS
// ==========================================

model DiningZone {
  id                  String        @id @default(cuid())
  branchId            String
  branch              StoreBranch   @relation(fields: [branchId], references: [id], onDelete: Cascade)
  name                String        // เช่น "โซนห้องแอร์ (Indoor)", "โซนสวน (Outdoor)"
  sortOrder           Int           @default(0)
  tables              DiningTable[]
}

model DiningTable {
  id                  String      @id @default(cuid())
  zoneId              String
  zone                DiningZone  @relation(fields: [zoneId], references: [id], onDelete: Cascade)
  name                String      // เช่น "T-01", "T-02"
  seats               Int         @default(4)
  status              String      @default("AVAILABLE") // AVAILABLE, OCCUPIED, BILL_REQUESTED
  activeQrToken       String?     @unique               // Token แบบสุ่มที่สร้างใหม่ทุกครั้งที่เปิดโต๊ะ
  currentOrderId      String?
  orders              Order[]
}

enum OrderType {
  DINE_IN
  TAKEAWAY
  DELIVERY
}

enum OrderStatus {
  OPEN
  PAID
  VOIDED
  REFUNDED
}

enum KitchenStatus {
  QUEUED
  PREPARING
  READY
  SERVED
}

model Order {
  id                  String         @id @default(cuid())
  tenantId            String
  branchId            String
  branch              StoreBranch    @relation(fields: [branchId], references: [id], onDelete: Cascade)
  shiftId             String?
  shift               CashierShift?  @relation(fields: [shiftId], references: [id])
  staffId             String?
  staff               StaffMember?   @relation(fields: [staffId], references: [id])
  tableId             String?
  table               DiningTable?   @relation(fields: [tableId], references: [id])
  
  orderNumber         String         // เช่น "ORD-20261105-0042"
  queueNumber         Int            // เลขคิวรายวัน เช่น 42
  orderType           OrderType      @default(DINE_IN)
  status              OrderStatus    @default(OPEN)
  kitchenStatus       KitchenStatus  @default(QUEUED)
  
  subtotal            Decimal        @db.Decimal(10, 2)
  discountAmount      Decimal        @default(0.00) @db.Decimal(10, 2)
  discountReason      String?
  serviceChargeAmount Decimal        @default(0.00) @db.Decimal(10, 2)
  vatAmount           Decimal        @default(0.00) @db.Decimal(10, 2)
  grandTotal          Decimal        @db.Decimal(10, 2)
  
  customerNote        String?
  voidReason          String?
  createdAt           DateTime       @default(now())
  paidAt              DateTime?
  
  items               OrderItem[]
  payments            OrderPayment[]

  @@unique([tenantId, orderNumber])
  @@index([tenantId, branchId, createdAt])
}

model OrderItem {
  id                  String              @id @default(cuid())
  orderId             String
  order               Order               @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId           String
  product             Product             @relation(fields: [productId], references: [id])
  productNameSnapshot String              // เก็บชื่อสินค้า ณ เวลาขาย
  unitPriceSnapshot   Decimal             @db.Decimal(10, 2)
  quantity            Int
  modifiersTotal      Decimal             @default(0.00) @db.Decimal(10, 2)
  lineTotal           Decimal             @db.Decimal(10, 2)
  kitchenStation      String              @default("MAIN")
  kitchenStatus       KitchenStatus       @default(QUEUED)
  note                String?
  modifiers           OrderItemModifier[]
}

model OrderItemModifier {
  id                  String    @id @default(cuid())
  orderItemId         String
  orderItem           OrderItem @relation(fields: [orderItemId], references: [id], onDelete: Cascade)
  modifierName        String
  optionName          String
  priceDelta          Decimal   @db.Decimal(10, 2)
}

model OrderPayment {
  id                  String   @id @default(cuid())
  orderId             String
  order               Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  method              String   // CASH, PROMPTPAY_QR, CREDIT_CARD, TRANSFER
  amount              Decimal  @db.Decimal(10, 2)
  cashReceived        Decimal? @db.Decimal(10, 2) // เงินสดที่รับมาจากลูกค้า
  changeGiven         Decimal? @db.Decimal(10, 2) // เงินทอน
  referenceNo         String?
  createdAt           DateTime @default(now())
}

model AuditLog {
  id                  String   @id @default(cuid())
  tenantId            String
  tenant              Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  actorName           String
  action              String   // เช่น "VOID_ORDER", "OPEN_SHIFT", "CHANGE_PRICE"
  details             String
  createdAt           DateTime @default(now())

  @@index([tenantId, createdAt])
}
```

## 4. ข้อกำหนดฟังก์ชันการทำงานเชิงลึก (Detailed Functional Requirements)

### Module 1: ระบบสมัครสมาชิกและสร้างร้านเปล่า (Self-Service Onboarding)
1. **หน้า Landing Page (`pos.buzlike.com`):**
   - แสดงปุ่ม **"ทดลองใช้งานฟรี 14 วัน (ไม่ต้องใช้บัตรเครดิต)"** และตารางเปรียบเทียบแพ็กเกจ (Starter รายเดือน 390฿ / Pro รายเดือน 790฿ / ซื้อขาด Lifetime 12,900฿) พร้อมสวิตช์สลับดูราคารายเดือน vs รายปี (ส่วนลดตามแพ็กเกจเมื่อจ่ายรายปี)
2. **หน้าสมัครและตั้งค่าร้านใหม่ (`/register` → `/onboarding`):**
   - ผู้ใช้กรอก: อีเมล, รหัสผ่าน, ยืนยันรหัสผ่าน ไม่ขอชื่อบุคคลหรือเบอร์โทรศัพท์ มีแสดง/ซ่อนรหัสผ่านและปุ่มกลับหน้าแรก
   - เข้าสู่หน้า Onboarding 2 ขั้นตอน:
     - **Step 1:** ตั้งชื่อร้านค้าและเลือกประเภทธุรกิจ ระบบสร้างลิงก์ร้านให้เอง ไม่ต้องตั้งรหัสร้านหรือ slug
     - **Step 2:** ตั้งและกดยืนยัน PIN ตัวเลข 4–6 หลักด้วยแป้น 0–9 พร้อมปุ่มลบ/ล้าง แยกจากรหัสผ่าน login; UI และ API ตรวจ PIN สองครั้งตรงกัน ย้อนกลับไปแก้ข้อมูลร้านได้ รองรับ mobile/tablet/desktop ตามแผน UX
   - พร้อมเพย์และภาษีตั้งภายหลังในหน้าตั้งค่า ค่าเริ่มต้นไม่คิด VAT และยังไม่ระบุบัญชีรับเงิน เจ้าของแก้ชื่อร้านได้โดยลิงก์เดิมยังใช้ได้
3. **ระบบสร้างร้านเปล่า (Empty Store Provisioning):**
   - สร้างเฉพาะ `Tenant`, `StoreBranch`, `StaffMember (OWNER)` ไม่เติมสินค้า หมวดหมู่ ตัวเลือก โต๊ะ วัตถุดิบ สต็อก หรือยอดขายตัวอย่าง พาไปหน้าเพิ่มสินค้าให้เจ้าของตั้งเอง ข้อมูล demo ใช้เฉพาะร้านสาธิต/test ที่แยกจากร้านจริง

### Module 2: ระบบชำระเงินค่าแพ็กเกจและจัดการสิทธิ์ (`/billing`)
1. **การเลือกแพ็กเกจและรูปแบบการชำระเงิน:**
   - ลูกค้าเลือกได้ 3 รูปแบบ: **รายเดือน (Monthly)**, **รายปี (Yearly)** หรือ **ซื้อขาดตลอดชีพ (Lifetime Buyout)**
   - รองรับการกรอกรหัสคูปองส่วนลด (Promo Code) และช่องติ๊ก **"ต้องการใบกำกับภาษีในนามบริษัท/นิติบุคคล"** (กรอกชื่อบริษัท, เลขประจำตัวผู้เสียภาษี 13 หลัก, ที่อยู่)
2. **ช่องทางชำระเงินค่าแพ็กเกจ:**
   - **เส้นทางหลักอัตโนมัติ:** Stripe หรือ gateway ที่มี signed webhook; บัตรต่ออายุอัตโนมัติได้ ส่วน PromptPay ให้ลูกค้าสแกนจ่ายแต่ละงวด เปิดสิทธิ์เมื่อ server ยืนยันสถานะ paid และยอด/currency/invoice ตรงกันเท่านั้น ไม่เปิดจาก success URL และไม่ต้องแอดมินอนุมัติ
   - **ช่องทางเดิมแนบสลิป:** ไม่เป็นเส้นทางหลักของการสมัครใหม่ หากเปิดไว้สำหรับกรณีพิเศษต้องระบุว่ารออนุมัติ การมีภาพสลิปหรือ QR ที่สร้างเองไม่พิสูจน์การรับเงิน ดูวงจรบัญชี/ชำระเงินอัตโนมัติฉบับเต็มในแบบ v2
3. **การบังคับใช้โควตา (`lib/license-guard.ts`):**
   - สร้างฟังก์ชัน `assertTenantQuota(tenantId, feature)` เรียกใช้ก่อนสร้างสาขาใหม่, เพิ่มสินค้าเกินโควตา, เพิ่มพนักงานเกินโควตา หรือเปิดหน้า `/kds` และ `/tables` หากแพ็กเกจปัจจุบันไม่รองรับ ให้แสดง Modal เปรียบเทียบแพ็กเกจพร้อมปุ่มกดอัปเกรดทันที

### Module 3: หน้าจอขายหน้าร้าน (POS Cashier Terminal — `/[storeSlug]/pos`)
1. **ระบบเปิด-ปิดกะแคชเชียร์ (Cashier Shift Management):**
   - ก่อนเริ่มขายออเดอร์แรกของวัน ระบบบังคับให้แคชเชียร์กด **"เปิดกะ (Open Shift)"** โดยระบุจำนวนเงินสดทอนตั้งต้นในลิ้นชัก (เช่น `1,000.00 บาท`)
   - มีปุ่ม **"นำเงินเข้า/ออกลิ้นชัก (Cash In / Cash Out)"** สำหรับบันทึกค่าใช้จ่ายจิปาถะหน้าร้าน (เช่น ซื้อน้ำแข็ง, จ่ายค่าขนส่ง) พร้อมระบุเหตุผล
   - ตอนเลิกงาน กด **"ปิดกะ (Close Shift & Z-Report)"** ให้แคชเชียร์กรอกจำนวนเงินสดที่นับได้จริงในลิ้นชัก ระบบคำนวณส่วนต่าง (`เงินสดขาด / เกิน`) และสั่งพิมพ์ใบสรุปยอดกะขนาด 80 มม.
2. **การเลือกสินค้าและตัวเลือกเสริม (Product Grid & Modifiers):**
   - แยกแท็บตามหมวดหมู่ ค้นหาชื่อสินค้า หรือยิงบาร์โค้ดผ่านเครื่องสแกน USB/Bluetooth (ดักจับ `keydown` ความเร็วสูงที่ลงท้ายด้วย `Enter` เพื่อหยิบสินค้าลงตะกร้าทันทีโดยไม่ต้องคลิกช่องค้นหา)
   - เมื่อคลิกสินค้าที่มี `ModifierGroup` (เช่น ลาเต้เย็น) ให้เปิด Modal เลือกระดับความหวาน (0%, 25%, 50%, 100%) และท็อปปิ้งเพิ่มเติม พร้อมคำนวณราคาบวกเพิ่มต่อแก้วอัตโนมัติ
3. **การจัดการตะกร้าและประเภทออเดอร์:**
   - เลือกประเภทออเดอร์ได้ 3 แบบ: **`ทานที่ร้าน (Dine-in)`** (ผูกกับหมายเลขโต๊ะ), **`กลับบ้าน (Takeaway)`**, และ **`เดลิเวอรี่ (Delivery)`**
   - มีปุ่ม **`พักบิล (Hold Bill)`** สำหรับพักรายการลูกค้าที่ยังเลือกไม่เสร็จ แล้วดึงกลับมาคิดเงินต่อได้
   - รองรับการใส่ส่วนลดท้ายบิล (ลดเป็น `%` หรือลดเป็น `บาท`) และการแยกบิลจ่าย (Split Bill ตามรายการอาหาร หรือหารเท่ากันตามจำนวนคน)
4. **การรับชำระเงินและสร้าง Dynamic PromptPay QR:**
   - **ชำระด้วยเงินสด (Cash):** มีปุ่มทางลัดธนบัตรไทย (`พอดี`, `฿20`, `฿50`, `฿100`, `฿500`, `฿1,000`) คำนวณเงินทอนตัวเลขขนาดใหญ่ชัดเจน
   - **ชำระด้วยสแกน QR พร้อมเพย์ (PromptPay QR):** ระบบสร้าง QR Code มาตรฐาน EMVCo จาก `branch.promptPayId` และยอด `grandTotal` ของบิลนั้นทันที พร้อมส่งข้อมูลขึ้นหน้าจอที่สองสำหรับลูกค้า (`/[storeSlug]/cfd` Customer Facing Display) ให้ลูกค้าสแกนได้ทันที
5. **การพิมพ์ใบเสร็จความร้อน 80 มม. / 58 มม. (Thermal Receipt):**
   - ออกแบบคอมโพเนนต์ `<ThermalReceipt />` ที่ใช้ฟอนต์ `'Sarabun', 'IBM Plex Sans Thai', monospace` (ห้ามเกิดตัวอักษรสี่เหลี่ยม `□□□` เด็ดขาด)
   - แสดงชื่อร้าน, สาขา, เลขผู้เสียภาษี (ถ้ามี), เลขคิวขนาดใหญ่ด้านบนสุด, เลขที่บิล, โต๊ะ, วันที่-เวลา, รายการสินค้าพร้อมตัวเลือกย่อย, ยอดก่อนภาษี, VAT 7%, ยอดสุทธิ, เงินที่รับ/เงินทอน และข้อความท้ายใบเสร็จ

### Module 4: ระบบหน้าจอครัว (Kitchen Display System — `/[storeSlug]/kds`)
1. **การรับออเดอร์แบบเรียลไทม์:**
   - เมื่อแคชเชียร์กดส่งเข้าครัว หรือลูกค้ากดสั่งผ่าน QR ที่โต๊ะ การ์ดออเดอร์จะปรากฏบนหน้า `/kds` ทันทีพร้อมเสียงเตือน (`Web Audio API` เสียงกริ่งครัว)
   - แยกแท็บกรองตามจุดเตรียมอาหาร (`ทั้งหมด`, `บาร์น้ำ (BAR)`, `ครัวร้อน (MAIN)`, `เบเกอรี่ (BAKERY)`)
2. **การจับเวลา SLA และเปลี่ยนสถานะ:**
   - การ์ดออเดอร์แสดงเวลานับเดินหน้าตั้งแต่สั่ง พร้อมเปลี่ยนสีขอบการ์ดอัตโนมัติ: **สีเขียว (< 5 นาที)**, **สีเหลือง (5–10 นาที)**, **สีแดงกระพริบ (> 10 นาที)**
   - พ่อครัวสามารถกดติ๊กขีดฆ่าทีละเมนูที่ทำเสร็จ หรือกดปุ่มใหญ่ด้านล่างการ์ดเพื่อเปลี่ยนสถานะ: **`เริ่มทำ (Preparing)`** → **`พร้อมเสิร์ฟ (Ready)`** → **`เสิร์ฟครบแล้ว (Bump)`**

### Module 5: ระบบผังโต๊ะและสแกน QR สั่งอาหารด้วยตัวเอง (`/[storeSlug]/tables` & `/m/[tableToken]`)
1. **การจัดการโต๊ะอาหาร:**
   - แสดงผังโต๊ะแยกตามโซน พร้อมสีสถานะ (`ว่าง`, `มีลูกค้ากำลังทาน`, `เรียกเช็กบิล`)
   - เมื่อแคชเชียร์หรือพนักงานเสิร์ฟกด **"เปิดโต๊ะ"** ระบบจะสุ่ม `activeQrToken` ใหม่สำหรับรอบลูกค้านั้น และสามารถกดพิมพ์ใบ QR Code ประจำโต๊ะให้ลูกค้าสแกนสั่งอาหารได้ทันที
   - รองรับปุ่ม **`ย้ายโต๊ะ (Move Table)`** และ **`รวมโต๊ะ (Merge Tables)`**
2. **หน้าเว็บลูกค้าสแกนสั่งอาหาร (`/m/[tableToken]`):**
   - เปิดใช้งานบนมือถือลูกค้าได้ทันทีโดยไม่ต้องโหลดแอปและไม่ต้องล็อกอิน
   - ลูกค้าเลือกเมนู เลือกความหวาน/ท็อปปิ้ง และกด **"ส่งออเดอร์เข้าครัว"** รายการจะวิ่งเข้าหน้าจอ `/kds` และอัปเดตยอดรวมในบิลของโต๊ะนั้นบนหน้าเครื่อง `/pos` ทันที
   - มีปุ่ม **"เรียกพนักงาน / ขอเช็กบิล"** ที่เมื่อกดแล้วจะส่งแจ้งเตือนขึ้นหน้าเครื่อง POS ของแคชเชียร์
   - เมื่อแคชเชียร์กดปิดบิลและเคลียร์โต๊ะ `activeQrToken` เดิมจะหมดอายุทันที เพื่อป้องกันคนนำรูป QR เก่าไปกดสั่งแกล้งร้านจากที่บ้าน

### Module 6: ระบบคลังวัตถุดิบและตัดสต็อกตามสูตร BOM (`/[storeSlug]/inventory`)
1. **การผูกสูตรอาหาร (Recipe Bill of Materials):**
   - เจ้าของร้านสามารถกำหนดได้ว่า สินค้า 1 เมนู (เช่น `ลาเต้เย็น 1 แก้ว`) ต้องใช้วัตถุดิบอะไรบ้างในปริมาณเท่าไร (เช่น `เมล็ดกาแฟ 18 กรัม`, `นมสด 150 มล.`, `แก้ว 16oz 1 ใบ`)
2. **การตัดสต็อกอัตโนมัติ (Transactional Stock Deduction):**
   - ทุกครั้งที่ออเดอร์เปลี่ยนสถานะเป็นชำระเงินสำเร็จ (`PAID`) ให้ระบบรัน Prisma `$transaction` เพื่อคำนวณและหักยอดคงเหลือใน `BranchIngredientStock` พร้อมบันทึกประวัติลง `StockMovement` (`type: "SALE_DEDUCTION"`) อัตโนมัติ
   - หากมีการกดยกเลิกบิล (`VOIDED`) ให้ระบบคืนยอดสต็อกกลับเข้าคลังพร้อมบันทึกประวัติ (`type: "VOID_RETURN"`)
3. **การแจ้งเตือนและการส่งออกรายงาน:**
   - แสดงรายการวัตถุดิบที่ต่ำกว่าจุดสั่งซื้อ (`currentQty <= lowStockThreshold`) บนหน้า Dashboard
   - ปุ่ม **`ส่งออกรายงานสต็อก (Export CSV)`** ต้องใส่รหัส `\uFEFF` (UTF-8 BOM) นำหน้าไฟล์เสมอ เพื่อให้เปิดในโปรแกรม Microsoft Excel ภาษาไทยได้โดยตัวอักษรไม่เพี้ยน

### Module 7: หน้าจัดการแพลตฟอร์มสำหรับเจ้าของระบบ (`/superadmin`)
1. **สิทธิ์การเข้าถึง:** เฉพาะผู้ใช้ที่มี `User.systemRole === "SUPER_ADMIN"` เท่านั้น
2. **ฟีเจอร์ในหน้า Super Admin:**
   - ดูสถิติธุรกิจ SaaS: จำนวนร้านค้าทั้งหมด, ร้านที่กำลังทดลองใช้, ร้านที่จ่ายรายเดือน/รายปี, ยอดขายแพ็กเกจซื้อขาด และรายได้รวมประจำเดือน (MRR)
   - ตารางรายชื่อร้านค้า (`Tenants`): สามารถกดค้นหาร้าน, กดขยายวันทดลองใช้ฟรี (+7 วัน / +30 วัน), กดเปลี่ยนแพ็กเกจให้ลูกค้าด้วยมือ หรือกดระงับร้านค้าได้
   - หน้าตรวจสอบการชำระเงิน (`Payments`): ดูรายการโอนเงินแนบสลิป กดปุ่ม **"อนุมัติและเปิดใช้งานแพ็กเกจ"** เพื่อเปลี่ยนสถานะร้านเป็น `ACTIVE` หรือ `LIFETIME_ACTIVE` พร้อมส่งอีเมลใบเสร็จให้ลูกค้าอัตโนมัติ

## 5. ข้อกำหนด API และความปลอดภัย (API Specification & Non-Functional Requirements)

### 5.1 ตาราง API Endpoints และ Server Actions หลัก

| Method & Endpoint | สิทธิ์ขั้นต่ำ | หน้าที่และการทำงานหลัก |
| :--- | :--- | :--- |
| `POST /api/auth/register` | Public | สร้างบัญชีผู้ใช้ใหม่, สร้าง `Tenant` (สถานะ `TRIALING` 14 วัน) และรัน `seedStoreTemplate()` |
| `POST /api/billing/checkout` | `OWNER` | สร้างลิงก์ชำระเงิน Stripe Checkout (รายเดือน/รายปี/ซื้อขาด) หรือสร้างใบแจ้งหนี้สำหรับโอนผ่าน QR |
| `POST /api/webhooks/stripe` | Stripe Signature | รับ Event ชำระเงินสำเร็จ อัปเดต `Tenant.subscriptionStatus`, `planCode`, โควตา และสร้าง `SaasPayment` |
| `POST /api/v1/[storeSlug]/shifts/open` | `CASHIER` | เปิดกะแคชเชียร์ใหม่ บันทึกเงินทอนตั้งต้น (`startingCash`) |
| `POST /api/v1/[storeSlug]/shifts/close` | `CASHIER` | ปิดกะแคชเชียร์ คำนวณยอดขายเงินสดเทียบกับเงินนับจริง (`actualCash`) และสร้างข้อมูล Z-Report |
| `POST /api/v1/[storeSlug]/orders` | `CASHIER` / QR Token | สร้างออเดอร์ใหม่ คำนวณภาษี/ส่วนลด ตัดสต็อกตามสูตร BOM และส่ง Event เข้าจอครัว `/kds` (รองรับ `Idempotency-Key` ป้องกันบิลซ้ำ) |
| `PATCH /api/v1/[storeSlug]/orders/[id]/kds` | `KITCHEN` | อัปเดตสถานะอาหารบนจอครัว (`PREPARING`, `READY`, `SERVED`) |
| `POST /api/v1/[storeSlug]/orders/[id]/void` | `MANAGER` / `OWNER` | ยกเลิกบิล (ต้องใส่รหัส PIN ของผู้จัดการและระบุเหตุผล) คืนสต็อกวัตถุดิบ และบันทึก `AuditLog` |
| `GET /api/v1/[storeSlug]/reports/export` | `OWNER` / `MANAGER` | ตรวจสิทธิ์ `enableExport` แล้วส่งออกไฟล์ CSV ยอดขายหรือสต็อกพร้อม UTF-8 BOM |

### 5.2 มาตรฐานความปลอดภัยและประสิทธิภาพ (Non-Functional Requirements)
1. **การแยกข้อมูลระหว่างร้านค้า (Strict Multi-Tenant Isolation):**
   - ทุก Query และ Mutation ในฐานข้อมูลต้องมีเงื่อนไข `where: { tenantId: session.currentTenantId }` เสมอ ห้ามดึงข้อมูลโดยใช้เพียง `id` เดี่ยวๆ เพื่อป้องกันการเข้าถึงข้อมูลข้ามร้านค้า (IDOR Vulnerability)
2. **การป้องกันบิลซ้ำ (Idempotency):**
   - การกดรับชำระเงินหน้าร้าน (`POST /api/v1/[storeSlug]/orders`) ต้องแนบ `clientOrderId` (UUID ที่สร้างจากฝั่ง Client) เสมอ หากอินเทอร์เน็ตกระตุกแล้วเครื่องส่งซ้ำ ระบบต้องคืนค่าออเดอร์เดิมโดยไม่ตัดสต็อกหรือสร้างบิลซ้ำ
3. **ความเร็วในการตอบสนองหน้า POS (Performance Budget):**
   - การกดเลือกสินค้าลงตะกร้า การเปลี่ยนหมวดหมู่ และการกดปุ่มตัวเลขรับเงินสด ต้องทำงานในฝั่ง Client State (`Zustand`) ทันทีภายใน `< 16ms` (60fps) โดยไม่ต้องรอโหลดจากเซิร์ฟเวอร์

## 6. ลำดับขั้นตอนการพัฒนาสำหรับ AI Coding Agent (Step-by-Step Execution Plan)

ให้ AI Coding Agent ดำเนินการพัฒนาตามลำดับ 6 เฟสต่อไปนี้ทีละขั้นจนเสร็จสมบูรณ์:

* **Phase 1: Project Initialization & Database Setup**
  1. สร้างโปรเจกต์ Next.js 15 (`App Router`, `TypeScript`, `Tailwind CSS`, `shadcn/ui`) และตั้งค่าฟอนต์ `IBM Plex Sans Thai`, `Sarabun`, `JetBrains Mono` ใน Root Layout
  2. นำโค้ด Prisma Schema ในหมวดที่ 3 ไปใส่ใน `prisma/schema.prisma` แล้วรัน `npx prisma migrate dev --name init_buzlike_pos`
  3. เขียนไฟล์ `prisma/seed.ts` เพื่อสร้างบัญชี Super Admin เริ่มต้น และฟังก์ชัน `seedTenantTemplate(tenantId, businessType)` สำหรับสร้างเมนูและโต๊ะตัวอย่าง 3 ประเภทธุรกิจ
* **Phase 2: Authentication, Multi-Tenant Routing & Onboarding Wizard**
  1. สร้างระบบสมัครสมาชิก (`/register`), ล็อกอิน (`/login`) และหน้าตั้งค่าร้าน 2 ขั้นตอน (`/onboarding`)
  2. สร้าง Middleware ตรวจสอบสิทธิ์การเข้าถึง `/[storeSlug]/*` และสร้าง `lib/license-guard.ts` สำหรับตรวจสถานะแพ็กเกจ (`TRIALING`, `ACTIVE`, `LIFETIME_ACTIVE`, `PAST_DUE`, `READ_ONLY`)
* **Phase 3: Core Catalog, Recipe BOM & Table Management**
  1. สร้างหน้าจัดการหมวดหมู่ สินค้า และตัวเลือกเสริม (`/[storeSlug]/products`)
  2. สร้างหน้าคลังวัตถุดิบและการผูกสูตรอาหาร BOM (`/[storeSlug]/inventory`)
  3. สร้างหน้าจัดการผังโต๊ะ โซนที่นั่ง และการสร้างคิวอาร์โค้ดประจำโต๊ะ (`/[storeSlug]/tables`)
* **Phase 4: POS Cashier Terminal, PromptPay QR & Thermal Printing**
  1. สร้างระบบเปิด-ปิดกะแคชเชียร์และหน้าสลับพนักงานด้วยรหัส PIN 4 หลัก
  2. สร้างหน้าขายหน้าร้าน (`/[storeSlug]/pos`) พร้อมระบบรองรับเครื่องยิงบาร์โค้ด, การเลือกความหวาน/ท็อปปิ้ง, การพักบิล, ส่วนลด และการคิดเงินสด/พร้อมเพย์ QR (`lib/promptpay.ts`)
  3. สร้างหน้าจอแสดงผลฝั่งลูกค้า (`/[storeSlug]/cfd`) และคอมโพเนนต์ใบเสร็จความร้อน 80 มม. (`<ThermalReceipt />`) ที่แสดงภาษาไทยครบถ้วนสมบูรณ์
  4. เชื่อมต่อระบบตัดสต็อกตามสูตร BOM อัตโนมัติ (`lib/stock-deduction.ts`) และระบบคิวออฟไลน์ (`Dexie.js`)
* **Phase 5: Real-Time KDS & Customer QR Self-Ordering**
  1. สร้างหน้าจอครัว (`/[storeSlug]/kds`) พร้อมระบบอัปเดตออเดอร์แบบเรียลไทม์, แถบสีจับเวลา SLA และเสียงแจ้งเตือนเมื่อมีออเดอร์ใหม่
  2. สร้างหน้าเว็บสำหรับลูกค้าสแกนสั่งอาหารที่โต๊ะ (`/m/[tableToken]`) ที่เชื่อมเข้าจอครัวและบิลโต๊ะเดียวกันทันที
* **Phase 6: SaaS Billing, Super Admin & Production Readiness**
  1. สร้างหน้า `/[storeSlug]/billing` รองรับการเลือกแพ็กเกจรายเดือน รายปี และซื้อขาด (Lifetime Buyout) เชื่อมต่อ Stripe Checkout และระบบอัปโหลดสลิปพร้อมเพย์
  2. สร้างหน้า `/superadmin` สำหรับดูภาพรวมร้านค้าทั้งหมด อนุมัติสลิป ขยายเวลาทดลองใช้ และจัดการแพ็กเกจ
  3. สร้างหน้า Landing Page (`pos.buzlike.com`) ที่เชื่อมลิงก์กลับไปยังเว็บหลัก `https://buzlike.com` และทดสอบ Flow ตั้งแต่สมัครสมาชิก → ทดลองขาย → ปิดกะ → อัปเกรดแพ็กเกจจนครบสมบูรณ์

