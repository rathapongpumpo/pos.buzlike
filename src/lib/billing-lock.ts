import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { assert } from "./errors";
export async function withBillingLock<T>(
  tenantId: string,
  fn: (token: string) => Promise<T>,
) {
  await db.billingLock.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId, token: "", expiresAt: new Date(0) },
  });
  const token = randomUUID();
  const result = await db.billingLock.updateMany({
    where: { tenantId, expiresAt: { lte: new Date() } },
    data: { token, expiresAt: new Date(Date.now() + 300000) },
  });
  assert(result.count, "กำลังตรวจสอบการชำระ กรุณาลองอีกครั้งสักครู่", 409);
  try {
    return await fn(token);
  } finally {
    await db.billingLock.updateMany({
      where: { tenantId, token },
      data: { expiresAt: new Date(0) },
    });
  }
}
export async function assertBillingLock(
  tx: Prisma.TransactionClient,
  tenantId: string,
  token: string,
) {
  const lock = await tx.billingLock.findFirst({
    where: { tenantId, token, expiresAt: { gt: new Date() } },
  });
  assert(lock, "การตรวจสอบหมดเวลา กรุณาลองอีกครั้ง", 409);
}
