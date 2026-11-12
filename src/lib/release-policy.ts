import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "./db";
import { assert } from "./errors";
type Client = Prisma.TransactionClient | PrismaClient;
export async function releasePolicy(client: Client = db) {
  // The migration inserts the singleton. Missing/corrupt settings must fail closed.
  const settings = await client.releaseSettings.findUnique({
    where: { id: "platform" },
  });
  assert(
    settings &&
      ["LEGACY", "PRIVATE_PILOT", "COMMERCIAL"].includes(
        settings.releaseMode,
      ) &&
      ["DISABLED", "EXISTING_ONLY", "PUBLIC"].includes(settings.checkoutMode),
    "ยังไม่พร้อมเปิดรับสมาชิกใหม่",
    503,
  );
  return settings;
}
export async function assertNewCheckoutAllowed(client: Client = db) {
  const p = await releasePolicy(client);
  assert(
    p.releaseMode !== "PRIVATE_PILOT" && p.checkoutMode === "PUBLIC",
    "ขณะนี้เปิดรับเฉพาะโครงการนำร่อง ยังไม่เปิดรับชำระสมาชิกใหม่",
    403,
  );
}
