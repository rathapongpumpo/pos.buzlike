import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { PilotLayout } from "@/components/pilot-layout";
import { PilotAction } from "@/components/pilot-actions";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";
export default async function Page() {
  const session = await auth();
  const user = session?.user?.id
    ? await db.user.findUnique({
        where: { id: session.user.id },
        include: { pilotWaitlist: true },
      })
    : null;
  const waiting = user?.pilotWaitlist?.status === "WAITING";
  return (
    <PilotLayout userId={user?.id}>
      <span className="pilot-eyebrow">BUZLIKE POS</span>
      <h1>{waiting ? "คุณลงทะเบียนรอแล้ว" : "ลงทะเบียนรอเปิดบริการ"}</h1>
      <p>
        ช่วงแรกเปิด Pro ฟรี 30 วันให้ 5 ธุรกิจตามคำเชิญ หากยังไม่มีสิทธิ์
        ลงทะเบียนรอเปิดบริการได้ที่นี่
      </p>
      {!user ? (
        <>
          <Button asChild className="full">
            <Link href="/register?next=%2Fpilot%2Fwaitlist">
              สร้างบัญชีเพื่อลงทะเบียนรอ
            </Link>
          </Button>
          <Link
            className="pilot-text-link"
            href="/login?next=%2Fpilot%2Fwaitlist"
          >
            มีบัญชีแล้ว เข้าสู่ระบบ
          </Link>
        </>
      ) : !user.emailVerifiedAt ? (
        <>
          <p className="notice">กรุณายืนยันอีเมลก่อนลงทะเบียนรอ</p>
          <Button asChild className="full">
            <Link href="/verify-email?next=%2Fpilot%2Fwaitlist">
              ไปยืนยันอีเมล
            </Link>
          </Button>
        </>
      ) : (
        <>
          <p className="pilot-email">{user.email}</p>
          <p className="notice">
            {waiting
              ? "ตรวจสอบสถานะจากหน้านี้ได้ การลงทะเบียนรอยังไม่เริ่มสิทธิ์ทดลองและไม่มีค่าใช้จ่าย"
              : "การลงทะเบียนรอไม่สร้างร้านหรือเริ่มสิทธิ์ทดลอง คุณถอนจากรายการได้ทุกเมื่อ"}
          </p>
          <PilotAction
            endpoint="/api/pilot/waitlist"
            body={{ action: waiting ? "withdraw" : "join" }}
            label={waiting ? "ถอนการลงทะเบียนรอ" : "ยืนยันลงทะเบียนรอ"}
            secondary={waiting}
          />
        </>
      )}
      <Link className="pilot-text-link" href="/pilot">
        มีคำเชิญหรือรับสิทธิ์ไว้แล้ว?
      </Link>
    </PilotLayout>
  );
}
