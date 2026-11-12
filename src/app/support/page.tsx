import Link from "next/link";
import { PublicInfo } from "@/components/public-info";
export default function Page() {
  return (
    <PublicInfo title="ติดต่อและแจ้งปัญหา">
      <h2>ใช้งานร้านได้ แต่พบปัญหา</h2>
      <p>
        ร้านนำร่องกด <strong>แจ้งปัญหา</strong> ในแบนเนอร์หรือเมนูของร้าน
        เลือกหน้าที่พบปัญหา อธิบายขั้นตอน และติดตามคำตอบจากทีมในเรื่องเดิมได้
      </p>
      <h2>เข้าสู่ระบบไม่ได้</h2>
      <p>
        ส่งอีเมลถึง{" "}
        <a className="info-contact" href="mailto:support@buzlike.com">
          support@buzlike.com
        </a>{" "}
        ระบุอีเมลบัญชี ชื่อร้าน เวลาที่พบปัญหา และรหัสอ้างอิงข้อผิดพลาดถ้ามี
        โปรดอย่าส่งรหัสผ่าน PIN หรือข้อมูลบัตร
      </p>
      <h2>ยอดเงิน บิล หรือสต็อกผิด</h2>
      <p>
        หยุดทำรายการที่เกี่ยวข้องชั่วคราว อย่ากดรับชำระซ้ำโดยยังไม่ตรวจสถานะ
        เก็บเลขบิลและยอดเงินจริงเพื่อให้ทีมช่วยตรวจสอบ
      </p>
      <h2>อินเทอร์เน็ตขัดข้อง</h2>
      <p>
        ใช้เครื่องเดิมและอย่าล้างข้อมูลเบราว์เซอร์
        ตรวจรายการรอซิงก์เมื่อกลับมาออนไลน์
        บิลที่ระบบแจ้งให้ตรวจสอบยังเก็บไว้ในเครื่อง
      </p>
      <div className="info-links">
        <Link className="btn outline" href="/forgot-password">
          ลืมรหัสผ่าน
        </Link>
        <Link className="btn primary" href="/start">
          กลับเข้าร้าน
        </Link>
      </div>
    </PublicInfo>
  );
}
