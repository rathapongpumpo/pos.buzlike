import { transactionLock } from "@/lib/database-dialect";
import { z } from "zod";
import { hash } from "bcryptjs";
import { auth } from "@/auth";
import { db, serial } from "@/lib/db";
import { assert } from "@/lib/errors";
import { respond } from "@/lib/http";
import { rateLimit, sameOrigin } from "@/lib/security";
import { newPassword } from "@/lib/password-policy";
import {
  consumeAccountToken,
  issueAccountToken,
  needsVerification,
} from "@/lib/account-tokens";
const tokenInput = z.string().regex(/^[a-f0-9]{64}$/);
export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  return respond(async () => {
    sameOrigin(req);
    const { action } = await params;
    const body = await req.json();
    await rateLimit(
      `account-ip:${action}:${req.headers.get("x-forwarded-for") ?? "local"}`,
      30,
      900000,
    );
    if (action === "resend-verification") {
      const session = await auth();
      assert(session?.user?.id, "กรุณาเข้าสู่ระบบ", 401);
      await rateLimit(`verify:${session.user.id}`, 3, 900000);
      const input = z
        .object({ next: z.string().max(200).optional() })
        .parse(body);
      await serial(async (tx) => {
        await transactionLock(tx, session.user.id);
        const user = await tx.user.findUniqueOrThrow({
          where: { id: session.user.id },
        });
        if (!user.emailVerifiedAt)
          await issueAccountToken(tx, user, "VERIFY_EMAIL", input.next);
      });
      return { message: "ส่งคำขอยืนยันอีเมลแล้ว กรุณาตรวจกล่องจดหมายและสแปม" };
    }
    if (action === "verify-email") {
      const { token } = z.object({ token: tokenInput }).parse(body);
      await serial(async (tx) => {
        const row = await consumeAccountToken(tx, token, "VERIFY_EMAIL");
        await tx.user.update({
          where: { id: row.userId },
          data: { emailVerifiedAt: new Date() },
        });
      });
      return { message: "ยืนยันอีเมลแล้ว" };
    }
    if (action === "forgot-password") {
      const { email } = z
        .object({ email: z.string().trim().toLowerCase().email().max(254) })
        .parse(body);
      await rateLimit(`reset:${email}`, 3, 900000);
      await serial(async (tx) => {
        await transactionLock(tx, email);
        const user = await tx.user.findUnique({ where: { email } });
        if (user?.passwordHash)
          await issueAccountToken(tx, user, "PASSWORD_RESET");
      });
      return {
        message:
          "หากอีเมลนี้มีบัญชี ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ กรุณาตรวจกล่องจดหมายและสแปม",
      };
    }
    if (action === "reset-password") {
      const input = z
        .object({
          token: tokenInput,
          password: newPassword,
          confirmPassword: z.string().max(128),
        })
        .refine((b) => b.password === b.confirmPassword, {
          message: "รหัสผ่านทั้งสองช่องไม่ตรงกัน",
          path: ["confirmPassword"],
        })
        .parse(body);
      const passwordHash = await hash(input.password, 12);
      await serial(async (tx) => {
        const row = await consumeAccountToken(
          tx,
          input.token,
          "PASSWORD_RESET",
        );
        await transactionLock(tx, row.userId);
        await tx.user.update({
          where: { id: row.userId },
          data: { passwordHash, sessionVersion: { increment: 1 } },
        });
        await tx.accountToken.updateMany({
          where: { userId: row.userId, kind: "PASSWORD_RESET", usedAt: null },
          data: { usedAt: new Date() },
        });
        const tokens = await tx.accountToken.findMany({
          where: { userId: row.userId, kind: "PASSWORD_RESET" },
          select: { id: true },
        });
        await tx.emailOutbox.updateMany({
          where: {
            dedupeKey: { in: tokens.map((t) => `account:${t.id}`) },
            sentAt: null,
          },
          data: { expiresAt: new Date() },
        });
        // A notification contains no password or recovery token.
        const user = await tx.user.findUniqueOrThrow({
          where: { id: row.userId },
        });
        await tx.emailOutbox.create({
          data: {
            userId: user.id,
            to: user.email,
            subject: "เปลี่ยนรหัสผ่าน BUZLIKE POS แล้ว",
            text: "รหัสผ่านของคุณเปลี่ยนแล้ว ทุกเครื่องต้องเข้าสู่ระบบใหม่ หากไม่ได้ทำรายการนี้ กรุณากู้รหัสผ่านและติดต่อทีมช่วยเหลือ",
          },
        });
      });
      return { message: "ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบอีกครั้ง" };
    }
    assert(false, "ไม่พบรายการ", 404);
  });
}
export async function GET() {
  return respond(async () => {
    const session = await auth();
    assert(session?.user?.id, "กรุณาเข้าสู่ระบบ", 401);
    const user = await db.user.findUniqueOrThrow({
      where: { id: session.user.id },
    });
    return { email: user.email, needsVerification: needsVerification(user) };
  });
}
