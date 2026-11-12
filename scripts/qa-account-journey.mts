// Disposable local fixtures for the documented in-app browser account audit.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { db } from "../src/lib/db";
import { provisionEmptyTenant } from "../src/lib/provision";

const manifestPath = "output/playwright/account-journey/fixture.json";
if (process.argv[2] === "cleanup") {
  const fixture = JSON.parse(await readFile(manifestPath, "utf8"));
  const user = await db.user.findUnique({ where: { id: fixture.userId } });
  if (
    user &&
    user.email === fixture.email &&
    user.email.startsWith("browser-journey-") &&
    user.email.endsWith("@example.test")
  ) {
    await db.$transaction(async (tx) => {
      const owned = await tx.tenant.findMany({ where: { id: { in: fixture.tenantIds }, ownerId: user.id }, select: { id: true } });
      const tenantIds = owned.map((tenant) => tenant.id);
      // Remove disposable sale references before deleting their catalog/staff.
      await tx.order.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await tx.cashierShift.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await tx.tenant.deleteMany({ where: { id: { in: tenantIds }, ownerId: user.id } });
      await tx.user.delete({ where: { id: user.id } });
    });
    await db.rateLimit.deleteMany({ where: { key: `login:${fixture.email}` } });
  }
  console.log("Disposable browser fixtures removed");
} else {
  const email = `browser-journey-${randomUUID()}@example.test`;
  // Local test credentials only; never use this account or password in production.
  const { hash } = await import("bcryptjs");
  const user = await db.user.create({
    data: {
      email,
      fullName: "เจ้าของร้านทดสอบ",
      passwordHash: await hash("Browser-QA-2026-Only!", 12),
    },
  });
  const tenants = [];
  for (const name of [
    "ร้านทดสอบเส้นทางใช้งาน",
    "สาขาในอีกธุรกิจสำหรับทดสอบการเลือกร้าน",
  ]) {
    const tenant = await db.tenant.create({
      data: {
        ownerId: user.id,
        name,
        slug: `browser-journey-${randomUUID()}`,
        trialEndsAt: new Date(Date.now() + 14 * 86400000),
      },
    });
    await db.$transaction(
      (tx) =>
        provisionEmptyTenant(
          tx,
          tenant.id,
          "827146",
          user.id,
          user.fullName,
          "",
          "NONE",
        ),
      { timeout: 30000 },
    );
    tenants.push(tenant);
  }
  const fixture = {
    userId: user.id,
    email,
    tenantIds: tenants.map((tenant) => tenant.id),
    slugs: tenants.map((tenant) => tenant.slug),
  };
  await mkdir("output/playwright/account-journey", { recursive: true });
  await writeFile(manifestPath, JSON.stringify(fixture, null, 2));
  console.log(JSON.stringify({ email, slugs: fixture.slugs }));
}
await db.$disconnect();
