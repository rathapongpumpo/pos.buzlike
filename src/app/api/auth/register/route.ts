import { z } from "zod";
import { hash } from "bcryptjs";
import { serial } from "@/lib/db";
import { issueAccountToken } from "@/lib/account-tokens";
import { newPassword } from "@/lib/password-policy";
import { sameOrigin, rateLimit } from "@/lib/security";
import { respond } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { Prisma } from "@prisma/client";
import { planFromNext } from "@/lib/account-links";
import { releasePolicy } from "@/lib/release-policy";
import { readPilotContext, bindPilotContext } from "@/lib/pilot-admission";
export async function POST(req: Request) {
  return respond(async () => {
    sameOrigin(req);
    const b = z
      .object({
        email: z
          .string()
          .trim()
          .toLowerCase()
          .email("กรุณากรอกอีเมลให้ถูกต้อง")
          .max(254),
        password: newPassword,
        confirmPassword: z.string().min(1, "กรุณายืนยันรหัสผ่าน").max(128),
        next: z.string().max(200).optional(),
      })
      .refine((b) => b.password === b.confirmPassword, {
        path: ["confirmPassword"],
        message: "รหัสผ่านทั้งสองช่องไม่ตรงกัน",
      })
      .parse(await req.json());
    await rateLimit(
      `register:${req.headers.get("x-forwarded-for") ?? "local"}`,
      5,
      3600000,
    );
    const passwordHash = await hash(b.password, 12);
    const context = b.next === "/pilot" ? await readPilotContext() : null;
    const user = await serial(async (tx) => {
      const policy = await releasePolicy(tx);
      const created = await tx.user.create({
        data: {
          email: b.email,
          fullName: "เจ้าของร้าน",
          passwordHash,
          emailVerificationRequired: true,
          selectedPlan:
            policy.releaseMode === "PRIVATE_PILOT"
              ? null
              : planFromNext(b.next),
        },
      });
      await bindPilotContext(tx, created, context, true);
      await issueAccountToken(
        tx,
        created,
        "VERIFY_EMAIL",
        policy.releaseMode === "PRIVATE_PILOT" && b.next !== "/pilot"
          ? "/pilot/waitlist"
          : b.next,
      );
      return created;
    }).catch((error: unknown) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new AppError(409, "อีเมลนี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบ");
      throw error;
    });
    return { id: user.id };
  }, 201);
}
