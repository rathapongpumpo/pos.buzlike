import { z } from "zod";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { db, serial } from "@/lib/db";
import { assert } from "@/lib/errors";
import { respond } from "@/lib/http";
import { sameOrigin, rateLimit } from "@/lib/security";
async function account() {
  const session = await auth();
  assert(session?.user?.id, "กรุณาเข้าสู่ระบบ", 401);
  assert(!session.user.needsVerification, "กรุณายืนยันอีเมล", 403);
  return session.user.id;
}
export async function GET() {
  return respond(async () => {
    const userId = await account();
    return {
      draft: await db.onboardingDraft.findUnique({ where: { userId } }),
    };
  });
}
export async function PUT(req: Request) {
  return respond(async () => {
    sameOrigin(req);
    const userId = await account();
    await rateLimit(`draft:${userId}`, 120, 60000);
    const input = z
      .object({
        requestKey: z.string().uuid(),
        version: z.number().int().nonnegative(),
        name: z.string().max(100),
        businessType: z.enum(["CAFE_BEVERAGE", "RESTAURANT", "RETAIL_SHOP"]),
      })
      .parse(await req.json());
    return serial(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const current = await tx.onboardingDraft.findUnique({
        where: { userId },
      });
      assert(
        !current ||
          (current.requestKey === input.requestKey &&
            current.version === input.version &&
            !current.completedSlug),
        "ข้อมูลตั้งร้านเปลี่ยนในอีกหน้า กรุณาโหลดข้อมูลล่าสุดก่อน",
        409,
      );
      const draft = await tx.onboardingDraft.upsert({
        where: { userId },
        create: { userId, ...input, version: 1 },
        update: {
          name: input.name,
          businessType: input.businessType,
          version: { increment: 1 },
        },
      });
      return { draft };
    });
  });
}
export async function POST(req: Request) {
  return respond(async () => {
    sameOrigin(req);
    const userId = await account();
    const { version } = z
      .object({ version: z.number().int().nonnegative() })
      .parse(await req.json());
    return serial(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const current = await tx.onboardingDraft.findUnique({
        where: { userId },
      });
      assert(
        current?.completedSlug && current.version === version,
        "ร้านกำลังตั้งค่าอยู่ กรุณาโหลดข้อมูลล่าสุด",
        409,
      );
      return {
        draft: await tx.onboardingDraft.update({
          where: { userId },
          data: {
            requestKey: randomUUID(),
            name: "",
            businessType: "CAFE_BEVERAGE",
            completedSlug: null,
            version: { increment: 1 },
          },
        }),
      };
    });
  });
}
