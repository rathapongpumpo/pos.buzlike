import { planPrices } from "./plan-pricing";
export const pilotPricingNotice =
  "ราคาปกติสำหรับทุกคนเมื่อเปิดบริการ ยังไม่เปิดรับชำระเงิน ช่วงนำร่อง 5 ธุรกิจได้ Pro ฟรี 30 วันตามคำเชิญ";
export function publicPlanCards(yearly: boolean) {
  return [
    {
      name: "Starter",
      code: yearly ? "STARTER_YEARLY" : "STARTER_MONTHLY",
      price: yearly ? planPrices.STARTER_YEARLY : planPrices.STARTER_MONTHLY,
      caption: "ขายหน้าร้านให้คล่อง สำหรับร้านเคาน์เตอร์เดียว",
      features: [
        "คิดเงินสด / พร้อมเพย์ และใบเสร็จภาษาไทย",
        "ตัวเลือกสินค้า ส่วนลด และพักบิล",
        "เปิด–ปิดกะ และสรุปเงินสดขาด–เกิน",
        "ตัดสต็อกสินค้ารายชิ้น และรายงาน CSV",
        "1 สาขา · 1 เครื่อง · สินค้า 300 รายการ",
        "พนักงาน 5 คน พร้อมกำหนดสิทธิ์และ PIN",
      ],
    },
    {
      name: "Pro",
      code: yearly ? "PRO_YEARLY" : "PRO_MONTHLY",
      price: yearly ? planPrices.PRO_YEARLY : planPrices.PRO_MONTHLY,
      caption: "เชื่อมงานหน้าร้าน โต๊ะ ครัว และวัตถุดิบ",
      features: [
        "ทุกฟีเจอร์ของ Starter",
        "จอครัวสด แยกบาร์น้ำ / ครัว / เบเกอรี่",
        "ผังโต๊ะ เปิดโต๊ะ ย้ายโต๊ะ และรวมโต๊ะ",
        "ลูกค้าสแกน QR สั่งอาหารและเรียกพนักงาน",
        "ตัดวัตถุดิบตามสูตร เช่น กาแฟ 18 g / แก้ว",
        "3 สาขา · ไม่จำกัดเครื่อง สินค้า และพนักงาน",
      ],
    },
    {
      name: "Lifetime",
      code: "LIFETIME_BUYOUT",
      price: 12900,
      caption: "ซื้อขาด จ่ายครั้งเดียว",
      features: [
        "1 สาขา · ไม่จำกัดเครื่องขาย",
        "ครบทุกฟีเจอร์ Pro",
        "Cloud ฟรีปีแรก · ปีถัดไป 1,500 บาท/ปี",
        "ส่งออกข้อมูลและติดตั้งเองได้",
      ],
    },
  ];
}
