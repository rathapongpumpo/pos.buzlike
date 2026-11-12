import { z } from "zod";
import { auth } from "@/auth";
import { serial } from "@/lib/db";
import { respond } from "@/lib/http";
import { assert } from "@/lib/errors";
import { sameOrigin, rateLimit } from "@/lib/security";
import { activatePilot } from "@/lib/pilot";
export async function POST(req: Request) {
  return respond(async () => {
    assert(req.headers.get("origin"), "Origin ไม่ถูกต้อง", 403);
    sameOrigin(req);
    const session = await auth();
    assert(session?.user?.id, "กรุณาเข้าสู่ระบบ", 401);
    await rateLimit(`pilot-activate:${session.user.id}`, 10, 60000);
    const input = z
      .object({
        enrollmentId: z.string().max(128),
        tenantId: z.string().max(128),
      })
      .parse(await req.json());
    return serial(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: session.user.id },
      });
      assert(user.emailVerifiedAt, "กรุณายืนยันอีเมล", 403);
      const tenant = await tx.tenant.findUnique({
        where: { id: input.tenantId },
      });
      assert(tenant && tenant.ownerId === user.id, "ไม่พบธุรกิจของคุณ", 404);
      await activatePilot(tx, user.id, input.enrollmentId, tenant.id);
      return { next: `/${tenant.slug}/products` };
    });
  });
}
