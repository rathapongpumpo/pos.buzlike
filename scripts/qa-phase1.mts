// Disposable local fixtures for the Phase 1 in-app browser audit.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { hash } from "bcryptjs";
import { db } from "../src/lib/db";
import { provisionEmptyTenant } from "../src/lib/provision";

const manifestPath = "docs/phases/evidence/phase1-fixture.json";
if (process.argv[2] === "cleanup") {
  const fixture = JSON.parse(await readFile(manifestPath, "utf8"));
  const user = await db.user.findUniqueOrThrow({ where: { id: fixture.userId } });
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: fixture.tenantId } });
  if (user.email !== fixture.email || !user.email.startsWith("browser-phase1-") || !user.email.endsWith("@example.test") || tenant.ownerId !== user.id || tenant.slug !== fixture.slug || !tenant.slug.startsWith("browser-phase1-")) throw new Error("Fixture identity mismatch");
  await db.$transaction(async tx => {
    await tx.order.deleteMany({ where: { tenantId: tenant.id } });
    await tx.cashierShift.deleteMany({ where: { tenantId: tenant.id } });
    await tx.tenant.delete({ where: { id: tenant.id } });
    await tx.user.delete({ where: { id: user.id } });
  });
  await db.rateLimit.deleteMany({ where: { key: `login:${fixture.email}` } });
  await writeFile(manifestPath, JSON.stringify({ ...fixture, cleanedUp: true }, null, 2));
  console.log("Phase 1 browser fixture removed");
} else if (process.argv[2] === "cleanup-http") {
  // Only the two fixtures created in this Phase 1 turn, before test cleanup was added.
  for (const slug of ["http-8859c7c2", "http-dc18689e"]) {
    const tenant = await db.tenant.findUnique({ where: { slug }, include: { owner: true } });
    if (!tenant) continue;
    if (tenant.name !== "HTTP QA" || tenant.owner.fullName !== "HTTP QA" || !tenant.owner.email.endsWith("@example.test")) throw new Error("HTTP fixture identity mismatch");
    await db.$transaction(async tx => {
      await tx.order.deleteMany({ where: { tenantId: tenant.id } });
      await tx.cashierShift.deleteMany({ where: { tenantId: tenant.id } });
      await tx.tenant.delete({ where: { id: tenant.id } });
      await tx.user.delete({ where: { id: tenant.ownerId } });
    });
  }
  console.log("Two Phase 1 HTTP fixtures removed");
} else {
  const user = await db.user.create({ data: {
    email: `browser-phase1-${randomUUID()}@example.test`,
    fullName: "เจ้าของร้านทดสอบสาขา",
    passwordHash: await hash("Browser-QA-2026-Only!", 12),
  } });
  const tenant = await db.tenant.create({ data: {
    ownerId: user.id, name: "ร้านทดสอบหลายสาขา", slug: `browser-phase1-${randomUUID()}`,
    trialEndsAt: new Date(Date.now() + 14 * 86400000),
    maxBranches: 5, maxStaff: 20, maxTerminals: -1, enableExport: true,
  } });
  const branchA = await db.$transaction(tx => provisionEmptyTenant(tx, tenant.id, "827146", user.id, user.fullName, "", "NONE"), { timeout: 30000 });
  const branchB = await db.storeBranch.create({ data: { tenantId: tenant.id, name: "สาขาริมสวน", vatRate: 0 } });
  const category = await db.category.create({ data: { tenantId: tenant.id, name: "เครื่องดื่ม" } });
  const product = await db.product.create({ data: {
    tenantId: tenant.id, categoryId: category.id, sku: "PHASE1-001", name: "น้ำส้มคั้นสด",
    price: 45, directStockQty: 10, trackStockType: "DIRECT_UNIT",
  } });
  await db.branchProduct.update({ where: { branchId_productId: { branchId: branchB.id, productId: product.id } }, data: { price: 65, quantity: 6 } });
  await db.staffMember.create({ data: {
    tenantId: tenant.id, displayName: "พนักงานสาขาหลัก", role: "CASHIER", pinCodeHash: await hash("741852", 10),
    branchAccess: { create: { branchId: branchA.id } },
  } });
  const fixture = { userId: user.id, email: user.email, tenantId: tenant.id, slug: tenant.slug, branchA: branchA.id, branchB: branchB.id };
  await mkdir("docs/phases/evidence", { recursive: true });
  await writeFile(manifestPath, JSON.stringify(fixture, null, 2));
  console.log(JSON.stringify(fixture));
}
await db.$disconnect();
