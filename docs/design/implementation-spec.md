# BUZLIKE POS design specification

Primary reference: `pos-concept.png` (1536 × 1024), generated with the built-in image generation tool. The SRS governs all behavior, tax calculations, labels required for additional workflows, and permissions.

Tokens: navy `#142c47`, teal `#009f88`, cool gray canvas `#f5f7fa`, white surfaces, ink `#10253b`, border `#dce3ed`; 8–15 px radii. IBM Plex Sans Thai application type; Sarabun receipt type; JetBrains Mono with both Thai fonts as fallback.

Primary composition: 252 px navy navigation rail, 72 px white header, searchable category catalog with three columns, white fixed-width cart and teal checkout. Lucide outline icons, stroke 1.8–2, 17–25 px. Flat surfaces, thin borders, modest shadows only on dialogs and hover. At mobile width navigation becomes a horizontally scrollable bottom rail and cart follows the catalog.

Allowed primary copy: BUZLIKE POS, shop/branch/operator names, ภาพรวม, ขายหน้าร้าน, รายการขาย, สินค้า, คลังวัตถุดิบ, ผังโต๊ะ, จอครัว, เปิด–ปิดกะ, พนักงาน, ตั้งค่า, แพ็กเกจ, ค้นหาสินค้าหรือสแกนบาร์โค้ด, ทั้งหมด, กาแฟ, ชาและนม, เบเกอรี่, รายการขาย, ทานที่ร้าน, กลับบ้าน, โต๊ะ, ยอดรวมสินค้า, ส่วนลด, ภาษีมูลค่าเพิ่ม, รวมสุทธิ, ชำระเงิน, seeded product names and prices.

Functional additions required by SRS: trial countdown, connection indicator, delivery type, open-shift control, customer display link, hold/restore/clear bill controls, item counts, empty cart, per-role navigation, cashier switch, payment/reference/receipt dialogs, reporting and CRUD states.

Intentional deviations: 10 catalog items as SRS specifies; initial cart is empty; included VAT is extracted from total rather than the illustrative concept's added VAT; actual store/operator names come from persisted data. Production café photos in `public/cafe-products.png` were generated separately with the same neutral studio treatment, so latte and cocoa correctly match their menu names. The originally copied sprite is retained locally for the salad image. Marketing preview is clearly labeled a design reference. Application screens are native interactive components.

Downstream states reuse the same frame, spacing, controls, tables, and Radix dialogs. Kitchen uses status color and elapsed time; table grid uses availability colors; reports use actual aggregates. No fabricated sales metrics.
