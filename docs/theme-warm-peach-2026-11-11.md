# Warm Peach theme และ UI/UX Pro Max — 11 พฤศจิกายน 2026

สถานะ: **ติดตั้ง skill และเปลี่ยนธีมแล้ว ตรวจผ่าน local production build** ที่ `http://localhost:3100/`

## สิ่งที่ส่งมอบ

- ติดตั้ง [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) จาก revision `6ae86f61f520d6ca229d2f40e070410638c908c5` ไว้ที่ `C:\Users\rpump\.codex\skills\ui-ux-pro-max` และเรียก search script ตรวจการทำงานแล้ว ระบบค้นพบ skill อัตโนมัติได้ตั้งแต่คำสั่งถัดไป; รอบนี้อ่านและเรียกใช้ผ่าน path โดยตรง
- ใช้สีจาก [ตัวอย่างที่ผู้ใช้เลือก](https://uupm.cc/demo/pet-grooming): ส้มพีช `#FF8C42`, พื้นครีม `#FFF9F5`, ชมพู `#FF6B9D`, มิ้นต์ `#06D6A0`, ตัวอักษร `#2D3436`
- เปลี่ยนหน้าแรก หน้าเข้าระบบ/ตั้งร้าน POS หลังบ้าน แพ็กเกจ และผู้ดูแลผ่าน semantic tokens รวมถึง favicon และ browser theme color
- แยกสีปุ่ม/สีข้อความ/สีสถานะ: ปุ่มส้มใช้ข้อความเข้มที่อ่านชัด สถานะสำเร็จ คำเตือน และข้อผิดพลาดยังมีสีและคำกำกับของตัวเอง
- คงข้อความ ราคา ฟอนต์ไทย ไอคอน และโครงสร้างเดิม ปรับ minimum height ของตะกร้าให้เผื่อแถบเลือกสาขา จึงเห็นปุ่มชำระเงินใน viewport desktop/tablet แนวนอนปกติ
- อัปเดตภาพระบบจริงบนหน้าแรกทั้ง 3 ภาพ (POS/ครัว/คลัง) ด้วยร้านตัวอย่างแยก ขนาดเดิม 1536×1024; ไม่ใส่ข้อมูลตัวอย่างลงร้านผู้ใช้
- เก็บกติกาสีสำหรับงานต่อไปใน [Design System MASTER](../design-system/buzlike-pos/MASTER.md)

## การตรวจสีและภาพ

ตรวจ `view_image` ของ reference และภาพ implementation ล่าสุด เปรียบเทียบ 5 จุด: พื้นครีม, ส้มหลัก, ชมพู/มิ้นต์รอง, ตัวอักษร/สถานะ และขอบการ์ด/ปุ่มสีอุ่น ตรวจหน้าแรก desktop/mobile, POS desktop/mobile/tablet, แพ็กเกจ, ครัว, คลัง และ modal ที่สำคัญแล้ว

การปรับจาก reference ที่ตั้งใจ: ใช้ข้อความเข้มบนปุ่มส้มและเฉดเข้มสำหรับลิงก์เพื่อ contrast; ใช้ชมพูเน้นแพ็กเกจ Pro และมิ้นต์ในจุดเล็ก ๆ ของระบบ POS; คงฟอนต์ไทยและข้อมูลของ POS ไม่คัดลอกเนื้อหา/รูปสัตว์หรือ layout ของเว็บตัวอย่าง

| การตรวจ | ผล |
|---|---|
| Responsive/หน้า/สถานะ/modal รวม | **605 กรณีผ่าน**, ไม่พบ horizontal overflow ที่ยังค้างในกรณีตรวจ |
| ช่วงความกว้าง | 320–1440 px; เพิ่ม 375 px และแนวตั้ง/แนวนอน 768×1024, 1024×768, 844×390 |
| สีที่ render จริง | ตรวจพื้น สีเมนูที่เลือก ข้อความบนปุ่ม และ focus จาก computed style |
| คู่สีหลัก | **12 คู่ผ่าน**: ข้อความปกติ ≥4.5:1; ขอบช่องกรอก ≥3:1 |
| ใบเสร็จ/print CSS | ขาวดำเหมือนเดิม; ความกว้าง 72 มม. = 272.125 CSS px |
| `npm run typecheck` / `npm run build` | ผ่าน |
| `npm test` | **66/66 ผ่าน**, ไม่ข้ามการทดสอบ |
| หลังลบข้อมูล/บัญชี/session ทดสอบ | ธุรกิจ 17, ผู้ใช้ 18, สินค้า 151, บิล 28, ยอดขาย 2,485.00, สต็อก 7,504 ตรง baseline |
| Local runtime | หน้าแรกตอบ HTTP 200; เปิด server port 3100 ค้างไว้ |

หลักฐาน: [ผลรวม](../output/playwright/warm-theme/summary.json), [คู่สี](../output/playwright/warm-theme/contrast.json), [test log](../output/playwright/warm-theme/test.log), [build log](../output/playwright/warm-theme/build.log), [ยอดข้อมูลก่อน/หลัง](phases/evidence/pilot-a-data.json)

ภาพ: [หน้าแรก desktop](../output/playwright/warm-theme/home-desktop.png), [หน้าแรก mobile](../output/playwright/warm-theme/home-mobile.png), [POS desktop](../output/playwright/warm-theme/pos-desktop.png), [POS mobile](../output/playwright/warm-theme/final-pos-375x812.png), [POS tablet](../output/playwright/warm-theme/final-pos-1024x768.png), [แพ็กเกจ tablet](../output/playwright/warm-theme/final-billing-768x1024.png)

สำรอง CSS และภาพเดิมไว้ที่ `data/backups/pre-warm-theme-2026-11-11T0851` ไม่มี migration หรือการเปิด pilot/รับเงินจริงในงานนี้

ขอบเขตหลักฐาน: ทดสอบด้วย Chromium viewport emulation ไม่ใช่เครื่องจริง; ยังไม่ตรวจ Safari/Firefox หรือเครื่องพิมพ์จริง การวัดคู่สีและ selected controls เป็นการตรวจเฉพาะส่วน ไม่ใช่การรับรอง WCAG ทั้งระบบ
