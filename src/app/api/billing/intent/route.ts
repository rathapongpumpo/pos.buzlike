import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { paidPlans } from "@/lib/billing";
import { respond } from "@/lib/http";
import { sameOrigin } from "@/lib/security";
import { assert } from "@/lib/errors";
import { releasePolicy } from "@/lib/release-policy";
export async function PUT(req: NextRequest) {
  return respond(async () => {
    sameOrigin(req);
    const session = await auth();
    assert(session?.user?.id, "กรุณาเข้าสู่ระบบ", 401);
    assert(!session.user.needsVerification, "กรุณายืนยันอีเมลก่อน", 403);
    const policy = await releasePolicy();
    assert(
      policy.releaseMode !== "PRIVATE_PILOT" &&
        policy.checkoutMode === "PUBLIC",
      "ยังไม่เปิดให้เลือกซื้อแพ็กเกจ กรุณาดูสิทธิ์นำร่อง",
      403,
    );
    const { plan } = z
      .object({ plan: z.enum(paidPlans).nullable() })
      .parse(await req.json());
    await db.user.update({
      where: { id: session.user.id },
      data: { selectedPlan: plan },
    });
    return { ok: true };
  });
}
