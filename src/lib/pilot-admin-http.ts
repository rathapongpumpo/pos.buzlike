import { auth } from "@/auth";
import { db } from "./db";
import { assert } from "./errors";
import { rateLimit, sameOrigin } from "./security";
export async function requirePilotAdmin(req: Request, write = false) {
  if (write) {
    assert(req.headers.get("origin"), "Origin ไม่ถูกต้อง", 403);
    sameOrigin(req);
  }
  const session = await auth();
  assert(session?.user?.id, "กรุณาเข้าสู่ระบบ", 401);
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  assert(
    user?.systemRole === "SUPER_ADMIN" && !session.user.needsVerification,
    "ไม่มีสิทธิ์ผู้ดูแลแพลตฟอร์ม",
    403,
  );
  if (write) await rateLimit(`pilot-admin:${user.id}`, 30, 60000);
  return user;
}
