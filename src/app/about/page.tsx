import Link from "next/link";
import { PublicInfo } from "@/components/public-info";
import { publicMetadata, supportEmail } from "@/lib/public-site";
export const metadata = publicMetadata(
  "/about",
  "เกี่ยวกับเรา",
  "รู้จัก BUZLIKE POS ระบบขายหน้าร้านจาก BUZLIKE SYSTEMS สำหรับคาเฟ่ ร้านอาหาร และร้านค้าปลีก",
);
export default function Page() {
  return (
    <PublicInfo title="รู้จัก BUZLIKE POS">
      <p>
        BUZLIKE POS เป็นระบบขายหน้าร้านจาก{" "}
        <a href="https://buzlike.com/">BUZLIKE SYSTEMS</a> สำหรับคาเฟ่ ร้านอาหาร
        และร้านค้าปลีก ใช้งานผ่านเว็บเบราว์เซอร์บนมือถือ แท็บเล็ต และคอมพิวเตอร์
      </p>
      <h2>ตั้งร้านในแบบของคุณ</h2>
      <p>
        ร้านเริ่มจากข้อมูลเปล่า เจ้าของร้านตั้งชื่อ เพิ่มสินค้า
        กำหนดราคาและส่วนลดได้เอง พร้อมจัดการยอดขาย สต็อก พนักงาน
        และสิทธิ์เข้าถึงตามสาขา
      </p>
      <h2>เลือกฟีเจอร์ให้เหมาะกับงาน</h2>
      <p>
        Starter เน้นขายที่เคาน์เตอร์และจัดการร้าน ส่วน Pro เพิ่ม QR สั่งอาหาร
        จอครัว ผังโต๊ะ และตัดวัตถุดิบตามสูตร
        ดูรายละเอียดและเงื่อนไขปัจจุบันได้ที่{" "}
        <Link href="/pricing">หน้าแพ็กเกจและราคา</Link>
      </p>
      <h2>ติดต่อทีม</h2>
      <p>
        สอบถามการใช้งาน หรือหารือความต้องการของธุรกิจหลายสาขาได้ที่{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a> และ{" "}
        <Link href="/support">หน้าช่วยเหลือ</Link>
      </p>
    </PublicInfo>
  );
}
