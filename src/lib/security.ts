import { db, serial } from "./db";
import { AppError } from "./errors";
export async function rateLimit(key: string, max = 10, windowMs = 60000) {
  const now = new Date();
  const allowed = await serial(async (tx) => {
    const row = await tx.rateLimit.findUnique({ where: { key } });
    if (!row || row.resetAt <= now) {
      await tx.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, resetAt: new Date(+now + windowMs) },
        update: { count: 1, resetAt: new Date(+now + windowMs) },
      });
      return true;
    }
    if (row.count >= max) return false;
    await tx.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return true;
  });
  if (!allowed)
    throw new AppError(429, "ลองใหม่อีกครั้งภายหลัง มีการใช้งานถี่เกินไป");
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const configured = new URL(process.env.NEXT_PUBLIC_APP_URL ?? req.url);
  if (origin && ["localhost", "127.0.0.1"].includes(configured.hostname)) {
    const candidate = new URL(origin);
    if (
      ["localhost", "127.0.0.1"].includes(candidate.hostname) &&
      candidate.port === configured.port &&
      candidate.protocol === configured.protocol
    )
      return;
  }
  if (
    origin &&
    origin !== new URL(req.url).origin &&
    origin !== process.env.NEXT_PUBLIC_APP_URL
  )
    throw new AppError(403, "Origin ไม่ถูกต้อง");
}
export const audit = (
  tenantId: string,
  actorName: string,
  action: string,
  details: string,
) => db.auditLog.create({ data: { tenantId, actorName, action, details } });
