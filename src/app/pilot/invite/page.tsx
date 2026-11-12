import Link from "next/link";
import { PilotLayout } from "@/components/pilot-layout";
import { PilotAction } from "@/components/pilot-actions";
import { invitationFromToken } from "@/lib/pilot-admission";
export const dynamic = "force-dynamic";
export const metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  let valid = false;
  try {
    if (token) {
      await invitationFromToken(token);
      valid = true;
    }
  } catch {
    /* Invalid links have a safe public exit. */
  }
  return (
    <PilotLayout>
      <span className="pilot-eyebrow">BUZLIKE POS · โครงการนำร่อง</span>
      <h1>{valid ? "คุณได้รับคำเชิญ" : "คำเชิญนี้ใช้ไม่ได้แล้ว"}</h1>
      <p>
        {valid
          ? "Pro ฟรี 30 วัน สำหรับ 5 ธุรกิจแรก เริ่มนับเมื่อเปิดใช้งานร้านสำเร็จ"
          : "ลิงก์อาจหมดอายุหรือถูกยกเลิก ขอคำเชิญใหม่จากทีม หรือลงทะเบียนรอเปิดบริการได้"}
      </p>
      {valid && (
        <>
          <ul className="pilot-benefits">
            <li>ตั้งร้านและเพิ่มสินค้าของคุณเอง</li>
            <li>ใช้ระบบขาย โต๊ะ ครัว และวัตถุดิบ</li>
            <li>ไม่มีการตัดเงินอัตโนมัติ</li>
          </ul>
          <PilotAction
            endpoint="/api/pilot/context"
            body={{ token }}
            label="ดำเนินการต่อจากคำเชิญ"
          />
        </>
      )}
      <Link className="pilot-text-link" href="/pilot/waitlist">
        ลงทะเบียนรอเปิดบริการ
      </Link>
    </PilotLayout>
  );
}
