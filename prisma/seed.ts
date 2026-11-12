import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { seedTenantTemplate } from "../src/lib/provision";
import { planPrices } from "../src/lib/plan-pricing";
const db = new PrismaClient();
async function main() {
  for (const [
    code,
    name,
    price,
    maxBranches,
    maxTerminals,
    maxProducts,
    maxStaff,
    full,
    exp,
  ] of [
    ["FREE_TRIAL", "ทดลองใช้ฟรี", 0, 1, 1, 50, 3, true, false],
    [
      "STARTER_MONTHLY",
      "Starter รายเดือน",
      planPrices.STARTER_MONTHLY,
      1,
      1,
      300,
      5,
      false,
      true,
    ],
    [
      "STARTER_YEARLY",
      "Starter รายปี",
      planPrices.STARTER_YEARLY,
      1,
      1,
      300,
      5,
      false,
      true,
    ],
    [
      "PRO_MONTHLY",
      "Pro Restaurant รายเดือน",
      planPrices.PRO_MONTHLY,
      3,
      -1,
      -1,
      -1,
      true,
      true,
    ],
    [
      "PRO_YEARLY",
      "Pro Restaurant รายปี",
      planPrices.PRO_YEARLY,
      3,
      -1,
      -1,
      -1,
      true,
      true,
    ],
    ["LIFETIME_BUYOUT", "Lifetime ซื้อขาด", 12900, 1, -1, -1, -1, true, true],
  ] as const)
    await db.plan.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name,
        price,
        maxBranches,
        maxTerminals,
        maxProducts,
        maxStaff,
        enableKds: full,
        enableQrOrder: full,
        enableRecipeBom: full,
        enableExport: exp,
      },
    });
  if (process.env.SEED_ADMIN_PASSWORD)
    await db.user.upsert({
      where: { email: process.env.SEED_ADMIN_EMAIL! },
      update: {},
      create: {
        email: process.env.SEED_ADMIN_EMAIL!,
        fullName: "BUZLIKE Admin",
        systemRole: "SUPER_ADMIN",
        passwordHash: await hash(process.env.SEED_ADMIN_PASSWORD, 12),
      },
    });
  if (
    process.env.SEED_DEMO !== "false" &&
    process.env.SEED_OWNER_PASSWORD &&
    !(await db.user.findUnique({
      where: { email: process.env.SEED_OWNER_EMAIL! },
    }))
  )
    await db.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            email: process.env.SEED_OWNER_EMAIL!,
            fullName: "เจ้าของร้าน",
            passwordHash: await hash(process.env.SEED_OWNER_PASSWORD!, 12),
          },
        });
        const tenant = await tx.tenant.create({
          data: {
            name: "BUZLIKE Café",
            slug: "buzlike-cafe",
            ownerId: user.id,
            trialEndsAt: new Date(Date.now() + 14 * 86400000),
          },
        });
        await seedTenantTemplate(
          tx,
          tenant.id,
          "CAFE_BEVERAGE",
          "1234",
          user.id,
          user.fullName,
          undefined,
          "INCLUSIVE",
        );
      },
      { timeout: 30000 },
    );
  console.log(
    "Seed completed. Accounts are configured in .env; existing data preserved.",
  );
}
main().finally(() => db.$disconnect());
