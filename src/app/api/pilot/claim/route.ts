import { auth } from "@/auth";
import { db } from "@/lib/db";
import { respond } from "@/lib/http";
import { assert } from "@/lib/errors";
import { sameOrigin, rateLimit } from "@/lib/security";
import { accountPilotContext } from "@/lib/pilot-admission";
import { reservePilotContext } from "@/lib/pilot";
export async function POST(req: Request) {
  return respond(async () => {
    assert(req.headers.get("origin"), "Origin ไม่ถูกต้อง", 403);
    sameOrigin(req);
    const session = await auth();
    assert(session?.user?.id, "กรุณาเข้าสู่ระบบ", 401);
    const user = await db.user.findUniqueOrThrow({
      where: { id: session.user.id },
    });
    assert(user.emailVerifiedAt, "กรุณายืนยันอีเมลก่อนรับสิทธิ์", 403);
    assert(
      user.systemRole !== "SUPER_ADMIN",
      "บัญชีผู้ดูแลใช้สำหรับจัดการโครงการ",
      403,
    );
    await rateLimit(`pilot-claim:${user.id}`, 15, 60000);
    const context = await accountPilotContext(user.id);
    assert(context, "ไม่พบคำเชิญ กรุณาเปิดจากลิงก์คำเชิญหรือลงทะเบียนรอ", 403);
    const grant = await reservePilotContext(user.id, context);
    const tenant = grant.tenantId
      ? await db.tenant.findUnique({
          where: { id: grant.tenantId },
          select: { slug: true },
        })
      : null;
    return {
      enrollmentId: grant.id,
      reservedUntil: grant.reservedUntil,
      next: tenant ? `/${tenant.slug}/products` : "/pilot",
    };
  });
}
