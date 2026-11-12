import { createHash, randomBytes } from "node:crypto";
import type { AccountTokenKind, Prisma } from "@prisma/client";
import { queueAccountMail, appLink } from "./email-outbox";
import { assert } from "./errors";

export const newToken = () => randomBytes(32).toString("hex");
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const needsVerification = (user: {
  emailVerificationRequired: boolean;
  emailVerifiedAt: Date | null;
}) => user.emailVerificationRequired && !user.emailVerifiedAt;
import { safeNext } from "./account-links";
export async function issueAccountToken(
  tx: Prisma.TransactionClient,
  user: { id: string; email: string },
  kind: AccountTokenKind,
  next?: string,
) {
  const token = newToken(),
    expiresAt = new Date(
      Date.now() + (kind === "VERIFY_EMAIL" ? 86400000 : 1800000),
    );
  const old = await tx.accountToken.findMany({
    where: { userId: user.id, kind, usedAt: null },
    select: { id: true },
  });
  await tx.accountToken.updateMany({
    where: { userId: user.id, kind, usedAt: null },
    data: { usedAt: new Date() },
  });
  await tx.emailOutbox.updateMany({
    where: {
      dedupeKey: { in: old.map((t) => `account:${t.id}`) },
      sentAt: null,
    },
    data: { expiresAt: new Date() },
  });
  const record = await tx.accountToken.create({
    data: { userId: user.id, kind, tokenHash: tokenHash(token), expiresAt },
  });
  const path = kind === "VERIFY_EMAIL" ? "/verify-email" : "/reset-password";
  const url = appLink(
    `${path}?token=${token}${kind === "VERIFY_EMAIL" ? `&next=${encodeURIComponent(safeNext(next))}` : ""}`,
  );
  await queueAccountMail(tx, {
    userId: user.id,
    to: user.email,
    subject:
      kind === "VERIFY_EMAIL"
        ? "ยืนยันอีเมล BUZLIKE POS"
        : "ตั้งรหัสผ่านใหม่ BUZLIKE POS",
    text: `${kind === "VERIFY_EMAIL" ? "กดยืนยันอีเมลเพื่อเริ่มตั้งร้าน ลิงก์ใช้ได้ 24 ชั่วโมง" : "ตั้งรหัสผ่านใหม่ ลิงก์ใช้ได้ 30 นาที เมื่อเปลี่ยนแล้วทุกเครื่องต้องเข้าสู่ระบบใหม่"}\n${url}\nหากไม่ได้ทำรายการนี้ ให้ละเว้นอีเมลนี้`,
    dedupeKey: `account:${record.id}`,
    expiresAt,
  });
}
export async function consumeAccountToken(
  tx: Prisma.TransactionClient,
  token: string,
  kind: AccountTokenKind,
) {
  const row = await tx.accountToken.findUnique({
    where: { tokenHash: tokenHash(token) },
  });
  assert(
    row && row.kind === kind && !row.usedAt && row.expiresAt > new Date(),
    "ลิงก์ไม่ถูกต้อง หมดอายุ หรือใช้แล้ว กรุณาขอลิงก์ใหม่",
    400,
  );
  const used = await tx.accountToken.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  assert(used.count === 1, "ลิงก์นี้ใช้แล้ว กรุณาขอลิงก์ใหม่", 400);
  return row;
}
