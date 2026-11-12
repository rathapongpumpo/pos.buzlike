import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  accountPilotContext,
  readPilotContext,
  validPilotInvitation,
  pilotOverview,
  pilotDate,
} from "@/lib/pilot-admission";
import { PilotLayout } from "@/components/pilot-layout";
import { PilotAction, PilotStoreChoice } from "@/components/pilot-actions";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";
export const metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default async function Page() {
  const session = await auth();
  const user = session?.user?.id
    ? await db.user.findUnique({ where: { id: session.user.id } })
    : null;
  const context = user
    ? await accountPilotContext(user.id)
    : await readPilotContext();
  let invite: Awaited<ReturnType<typeof validPilotInvitation>> | null = null,
    invalid = false;
  if (context) {
    try {
      invite = await validPilotInvitation(context);
    } catch {
      invalid = true;
    }
  }
  const overview = await pilotOverview();
  const grant = user
    ? await db.pilotEnrollment.findFirst({
        where: {
          ownerId: user.id,
          ...(invite ? { campaignId: invite.campaignId } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: { tenant: { select: { slug: true, name: true } } },
      })
    : null;
  const activated = Boolean(grant?.activatedAt && grant.tenant);
  const active =
    activated &&
    grant?.status === "ACTIVE" &&
    Boolean(grant.endsAt && +grant.endsAt > Date.now());
  const reserved = Boolean(
    grant?.status === "RESERVED" &&
    grant.reservedUntil &&
    +grant.reservedUntil > Date.now() &&
    !invalid &&
    invite,
  );
  const wrongEmail = Boolean(
    user && invite && user.email.toLowerCase() !== invite.normalizedEmail,
  );
  const stores =
    reserved && user
      ? await db.tenant.findMany({
          where: {
            ownerId: user.id,
            planCode: "FREE_TRIAL",
            isLifetime: false,
            stripeSubId: null,
            subscriptionStatus: { notIn: ["READ_ONLY", "SUSPENDED"] },
            pilotEnrollments: { none: { activatedAt: { not: null } } },
          },
          select: { id: true, name: true },
        })
      : [];
  const count = user
    ? await db.tenant.count({ where: { ownerId: user.id } })
    : 0;
  return (
    <PilotLayout userId={user?.id}>
      <span className="pilot-eyebrow">BUZLIKE POS · Pro นำร่อง</span>
      <h1>
        {activated
          ? active
            ? "สิทธิ์นำร่องของคุณ"
            : "สิทธิ์นำร่องสิ้นสุดแล้ว"
          : reserved
            ? "สิทธิ์พร้อมสำหรับร้านคุณ"
            : invalid
              ? "คำเชิญใช้ไม่ได้แล้ว"
              : "ร่วมทดลองใช้กับเรา"}
      </h1>
      {activated && grant?.tenant ? (
        <>
          <p className="pilot-store-name">{grant.tenant.name}</p>
          <p>
            {active ? "ใช้ Pro ได้ถึง" : "สิทธิ์สิ้นสุดเมื่อ"}{" "}
            {grant.endsAt ? pilotDate(grant.endsAt) : "—"} น.
          </p>
          <p>
            {active
              ? "ไม่มีการเรียกเก็บเงินหรือต่ออายุอัตโนมัติ"
              : "ข้อมูลร้านยังอยู่ เจ้าของร้านดูและส่งออกรายงานย้อนหลังได้"}
          </p>
          <Button asChild className="full">
            <Link href={`/${grant.tenant.slug}/${active ? "start" : "orders"}`}>
              {active ? "ไปที่ร้านของคุณ" : "ดูรายงานร้านเดิม"}
            </Link>
          </Button>
        </>
      ) : (
        <>
          <p>
            เปิดให้ {overview.capacity} ธุรกิจทดลอง Pro ฟรี{" "}
            {overview.durationDays} วัน
            เพื่อช่วยกันปรับระบบให้ตอบโจทย์การขายจริง
          </p>
          {invalid ? (
            <p className="notice">
              คำเชิญหมดอายุหรือถูกยกเลิก กรุณาขอคำเชิญใหม่ หรือลงทะเบียนรอ
            </p>
          ) : wrongEmail ? (
            <p className="notice">
              บัญชีที่เข้าสู่ระบบไม่ตรงกับอีเมลรับคำเชิญ
              กรุณาออกจากระบบแล้วใช้บัญชีที่ได้รับคำเชิญ
            </p>
          ) : !user ? (
            <>
              <ul className="pilot-benefits">
                <li>เริ่มนับ 30 วันหลังตั้งร้านสำเร็จ</li>
                <li>ร้านใหม่เริ่มจากข้อมูลว่าง ตั้งค่าเองได้</li>
                <li>ครบกำหนดอ่านรายงานได้ ไม่มีการตัดเงินเอง</li>
              </ul>
              <Button asChild className="full">
                <Link
                  href={`/register?next=${encodeURIComponent(invite ? "/pilot" : "/pilot/waitlist")}`}
                >
                  {invite
                    ? "สร้างบัญชีเพื่อรับสิทธิ์"
                    : "สร้างบัญชีเพื่อลงทะเบียนรอ"}
                </Link>
              </Button>
              <Link
                className="pilot-text-link"
                href={`/login?next=${encodeURIComponent(invite ? "/pilot" : "/pilot/waitlist")}`}
              >
                มีบัญชีแล้ว เข้าสู่ระบบ
              </Link>
            </>
          ) : !user.emailVerifiedAt ? (
            <>
              <p className="notice">
                ยืนยันอีเมลของคุณก่อนรับสิทธิ์หรือลงทะเบียนรอ
              </p>
              <Button asChild className="full">
                <Link
                  href={`/verify-email?next=${encodeURIComponent(invite ? "/pilot" : "/pilot/waitlist")}`}
                >
                  ไปยืนยันอีเมล
                </Link>
              </Button>
            </>
          ) : reserved && grant ? (
            <>
              <p className="notice">
                จองสิทธิ์ถึง {pilotDate(grant.reservedUntil!)} น.
                เริ่มตั้งร้านหรือเลือกใช้ร้านเดิมได้เลย
              </p>
              <PilotStoreChoice
                enrollmentId={grant.id}
                stores={stores}
                canCreate={count < 5}
              />
            </>
          ) : invite && invite.campaign.status === "OPEN" ? (
            <>
              <p>
                คำเชิญสำหรับอีเมลของคุณ การรับสิทธิ์จะจองที่ไว้ไม่เกิน 72
                ชั่วโมง ระยะใช้งานเริ่มหลังเปิดร้านสำเร็จ
              </p>
              <PilotAction
                endpoint="/api/pilot/claim"
                label="รับสิทธิ์และเลือกตั้งร้าน"
              />
            </>
          ) : (
            <p className="notice">
              {overview.status === "OPEN"
                ? "การเข้าร่วมใช้คำเชิญจากทีม หากยังไม่มีคำเชิญลงทะเบียนรอได้"
                : "โครงการยังไม่เปิดรับสิทธิ์ในขณะนี้ ลงทะเบียนรอและกลับมาตรวจสอบสถานะได้"}
            </p>
          )}
        </>
      )}
      <Link className="pilot-text-link" href="/pilot/waitlist">
        ดูการลงทะเบียนรอ
      </Link>
      <a className="pilot-text-link" href="mailto:support@buzlike.com">
        ติดต่อทีม BUZLIKE
      </a>
    </PilotLayout>
  );
}
