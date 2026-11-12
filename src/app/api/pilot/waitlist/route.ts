import { z } from "zod";
import { auth } from "@/auth";
import { db, serial } from "@/lib/db";
import { respond } from "@/lib/http";
import { assert } from "@/lib/errors";
import { rateLimit, sameOrigin } from "@/lib/security";
export async function POST(req: Request) {
  return respond(async () => {
    assert(req.headers.get("origin"), "Origin ไม่ถูกต้อง", 403);
    sameOrigin(req);
    const session = await auth();
    assert(session?.user?.id, "กรุณาเข้าสู่ระบบ", 401);
    const input = z
      .object({ action: z.enum(["join", "withdraw"]) })
      .parse(await req.json());
    await rateLimit(`pilot-waitlist:${session.user.id}`, 10, 60000);
    return serial(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: session.user.id },
      });
      assert(user.emailVerifiedAt, "กรุณายืนยันอีเมลก่อนลงทะเบียนรอ", 403);
      if (input.action === "withdraw") {
        await tx.pilotWaitlistEntry.updateMany({
          where: { userId: user.id, status: "WAITING" },
          data: { status: "WITHDRAWN", withdrawnAt: new Date() },
        });
        return { status: "WITHDRAWN" };
      }
      const entry = await tx.pilotWaitlistEntry.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: { status: "WAITING", withdrawnAt: null },
      });
      return { status: entry.status };
    });
  });
}
export async function GET() {
  return respond(async () => {
    const session = await auth();
    assert(session?.user?.id, "กรุณาเข้าสู่ระบบ", 401);
    const entry = await db.pilotWaitlistEntry.findUnique({
      where: { userId: session.user.id },
      select: { status: true, createdAt: true },
    });
    return { entry };
  });
}
