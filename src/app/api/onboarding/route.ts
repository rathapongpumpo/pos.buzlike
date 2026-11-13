import { transactionLock } from "@/lib/database-dialect";
import { z } from "zod";
import { randomUUID, createHmac } from "node:crypto";
import { auth } from "@/auth";
import { serial } from "@/lib/db";
import { assert } from "@/lib/errors";
import { respond } from "@/lib/http";
import { sameOrigin } from "@/lib/security";
import { provisionEmptyTenant } from "@/lib/provision";
import { preparePilotOnboarding, activatePilot } from "@/lib/pilot";
export async function POST(req: Request) {
  return respond(async () => {
    sameOrigin(req);
    const session = await auth();
    assert(session?.user?.id, "กรุณาเข้าสู่ระบบ", 401);
    assert(
      !session.user.needsVerification,
      "กรุณายืนยันอีเมลก่อนตั้งร้าน",
      403,
    );
    const body = z
      .object({
        pilotEnrollmentId: z.string().min(1).max(100).optional(),
        requestKey: z.string().uuid(),
        name: z
          .string()
          .trim()
          .min(2, "กรุณากรอกชื่อร้านอย่างน้อย 2 ตัวอักษร")
          .max(100),
        businessType: z.enum(["CAFE_BEVERAGE", "RESTAURANT", "RETAIL_SHOP"]),
        promptPayId: z
          .string()
          .regex(/^(\d{10}|\d{13})?$/)
          .default(""),
        vatMode: z.enum(["NONE", "INCLUSIVE", "EXCLUSIVE"]).default("NONE"),
        pin: z.string().regex(/^\d{4,6}$/, "PIN ต้องเป็นตัวเลข 4–6 หลัก"),
        confirmPin: z.string().regex(/^\d{4,6}$/, "กรุณากดยืนยัน PIN 4–6 หลัก"),
      })
      .refine((b) => b.pin === b.confirmPin, {
        path: ["confirmPin"],
        message: "PIN ทั้งสองครั้งไม่ตรงกัน",
      })
      .parse(await req.json());
    return serial(async (tx) => {
      const requestHash = createHmac("sha256", process.env.AUTH_SECRET!)
        .update(JSON.stringify(body))
        .digest("hex");
      const existing = await tx.onboardingRequest.findUnique({
        where: {
          userId_requestKey: {
            userId: session.user.id,
            requestKey: body.requestKey,
          },
        },
        include: { tenant: true },
      });
      if (existing) {
        assert(
          existing.requestHash === requestHash,
          "คำขอเดิมมีข้อมูลต่างกัน กรุณาเปิดร้านที่สร้างแล้ว",
          409,
        );
        return { slug: existing.tenant.slug };
      }
      const enrollment = await preparePilotOnboarding(
        tx,
        session.user.id,
        body.pilotEnrollmentId,
      );
      await transactionLock(tx, session.user.id);
      assert(
        !enrollment?.activatedAt,
        "สิทธิ์นี้เปิดร้านแล้ว กรุณาใช้งานร้านเดิม",
        409,
      );
      const draft = await tx.onboardingDraft.findUnique({
        where: { userId: session.user.id },
      });
      assert(
        !draft ||
          (draft.requestKey === body.requestKey &&
            !draft.completedSlug &&
            draft.name.trim() === body.name &&
            draft.businessType === body.businessType),
        "ข้อมูลตั้งร้านเปลี่ยนไป กรุณาโหลดข้อมูลล่าสุด",
        409,
      );
      assert(
        (await tx.tenant.count({ where: { ownerId: session.user.id } })) < 5,
        "สร้างร้านได้สูงสุด 5 ร้าน",
      );
      const t = await tx.tenant.create({
        data: {
          name: body.name,
          slug: `shop-${randomUUID().replaceAll("-", "")}`,
          businessType: body.businessType,
          ownerId: session.user.id,
          trialEndsAt: new Date(Date.now() + 14 * 86400000),
        },
      });
      await provisionEmptyTenant(
        tx,
        t.id,
        body.pin,
        session.user.id,
        session.user.name ?? "เจ้าของร้าน",
        body.promptPayId,
        body.vatMode,
      );
      if (enrollment)
        await activatePilot(tx, session.user.id, enrollment.id, t.id);
      await tx.onboardingRequest.create({
        data: {
          userId: session.user.id,
          requestKey: body.requestKey,
          requestHash,
          tenantId: t.id,
        },
      });
      await tx.onboardingDraft.upsert({
        where: { userId: session.user.id },
        create: {
          userId: session.user.id,
          requestKey: body.requestKey,
          name: body.name,
          businessType: body.businessType,
          completedSlug: t.slug,
          version: 1,
        },
        update: { completedSlug: t.slug, version: { increment: 1 } },
      });
      return { slug: t.slug };
    });
  }, 201);
}
