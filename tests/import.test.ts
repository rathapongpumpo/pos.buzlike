import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { db } from "../src/lib/db";
import { seedTenantTemplate } from "../src/lib/provision";
import { createOrder, orderInput } from "../src/lib/orders";
import { returnStock } from "../src/lib/stock-deduction";
import { importStore } from "../src/lib/import-store";
test("self-host export/import restores products, bills, modifiers, stock and owner access into an empty PostgreSQL schema", async () => {
  const schema = "qa_restore_" + randomUUID().replaceAll("-", "");
  assert.match(schema, /^qa_restore_[a-f0-9]+$/);
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schema);
  const target = new PrismaClient({ datasourceUrl: url.toString() });
  const rollback = new Error("ROLLBACK");
  try {
    execFileSync(
      process.execPath,
      [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
      { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" },
    );
    let exported: unknown;
    try {
      await db.$transaction(
        async (tx) => {
          const id = randomUUID();
          const user = await tx.user.create({
            data: {
              email: `restore-${id}@example.test`,
              fullName: "Restore QA",
            },
          });
          const t = await tx.tenant.create({
            data: {
              name: "Restore QA",
              slug: `restore-${id}`,
              ownerId: user.id,
              // Fixture sales must be made while the source store has valid access.
              trialEndsAt: new Date(Date.now() + 86400000),
            },
          });
          const branch = await seedTenantTemplate(
            tx,
            t.id,
            "CAFE_BEVERAGE",
            "1234",
            user.id,
            "Restore QA",
            undefined,
            "INCLUSIVE",
          );
          const tenantId = t.id;
          const staff = await tx.staffMember.findFirstOrThrow({
            where: { tenantId },
          });
          await tx.cashierShift.create({
            data: {
              tenantId,
              branchId: branch.id,
              staffId: staff.id,
              startingCash: 1000,
            },
          });
          const p = await tx.product.findFirstOrThrow({
            where: { tenantId, trackStockType: "DIRECT_UNIT" },
          });
          await createOrder(
            tx,
            tenantId,
            branch.id,
            staff.id,
            orderInput.parse({
              clientOrderId: randomUUID(),
              items: [{ productId: p.id, quantity: 1 }],
              method: "CASH",
              cashReceived: 1000,
            }),
          );
          const second = await tx.storeBranch.create({ data: { tenantId, name: "สาขาที่สอง" } });
          await tx.branchProduct.update({ where: { branchId_productId: { branchId: second.id, productId: p.id } }, data: { quantity: 7, price: 99 } });
          await tx.staffMember.create({ data: { tenantId, displayName: "พนักงานสาขาที่สอง", role: "CASHIER", pinCodeHash: "reset-on-import", branchAccess: { create: { branchId: second.id } } } });
          const [
            branches,
            products,
            categories,
            modifiers,
            ingredients,
            stocks,
            recipes,
            orders,
            shifts,
            movements,
            staffRows,
            tables,
            zones,
          ] = await Promise.all([
            tx.storeBranch.findMany({ where: { tenantId } }),
            tx.product.findMany({ where: { tenantId } }),
            tx.category.findMany({ where: { tenantId } }),
            tx.modifierGroup.findMany({
              where: { tenantId },
              include: { options: true, products: true },
            }),
            tx.ingredient.findMany({ where: { tenantId } }),
            tx.branchIngredientStock.findMany({ where: { tenantId } }),
            tx.recipeBomItem.findMany({ where: { tenantId } }),
            tx.order.findMany({
              where: { tenantId },
              include: {
                items: { include: { modifiers: true } },
                payments: true,
              },
            }),
            tx.cashierShift.findMany({ where: { tenantId } }),
            tx.stockMovement.findMany({ where: { tenantId } }),
            tx.staffMember.findMany({
              where: { tenantId },
              select: {
                id: true,
                tenantId: true,
                displayName: true,
                role: true,
                isActive: true,
              },
            }),
            tx.diningTable.findMany({
              where: { tenantId },
              select: {
                id: true,
                tenantId: true,
                zoneId: true,
                name: true,
                seats: true,
                status: true,
              },
            }),
            tx.diningZone.findMany({ where: { tenantId } }),
          ]);
          exported = JSON.parse(
            JSON.stringify({
              format: "buzlike-export-v1",
              tenant: {
                id: t.id,
                name: t.name,
                slug: t.slug,
                businessType: t.businessType,
              },
              branches,
              products,
              categories,
              modifiers,
              ingredients,
              stocks,
              recipes,
              orders,
              shifts,
              movements,
              staff: staffRows,
              tables,
              zones,
              branchProducts: await tx.branchProduct.findMany({ where: { tenantId } }),
              productMovements: await tx.productStockMovement.findMany({ where: { tenantId } }),
              staffBranchAccess: await tx.staffBranchAccess.findMany({ where: { tenantId } }),
            }),
          );
          throw rollback;
        },
        { timeout: 30000 },
      );
    } catch (e) {
      if (e !== rollback) throw e;
    }
    const restored = await importStore(target, exported, {
      email: "selfhost@example.test",
      password: "Restore-QA-Only-2026!",
      pin: "5678",
    });
    assert.equal(restored.products, 10);
    assert.equal(restored.orders, 1);
    assert.equal(await target.orderPayment.count(), 1);
    assert.equal(await target.recipeBomItem.count(), 21);
    assert.equal(await target.storeBranch.count(), 2);
    const second = await target.storeBranch.findFirstOrThrow({ where: { name: "สาขาที่สอง" } });
    const branchStock = await target.branchProduct.findFirstOrThrow({ where: { branchId: second.id, quantity: 7 } });
    assert.equal(Number(branchStock.price), 99);
    assert.equal((await target.staffBranchAccess.findMany({ where: { branchId: second.id } })).length, 1);
    const importedOrder = await target.order.findFirstOrThrow();
    await target.$transaction((tx) => returnStock(tx, importedOrder.tenantId, importedOrder.branchId, importedOrder.id));
    assert.equal((await target.branchProduct.findUniqueOrThrow({ where: { branchId_productId: { branchId: second.id, productId: branchStock.productId } } })).quantity, 7);
    assert.equal(await target.productStockMovement.count({ where: { kind: "RETURN" } }), 1);
    const owner = await target.user.findUniqueOrThrow({
      where: { email: "selfhost@example.test" },
    });
    assert.ok(
      await (
        await import("bcryptjs")
      ).compare("Restore-QA-Only-2026!", owner.passwordHash!),
    );
    assert.equal(
      (await target.tenant.findFirstOrThrow()).subscriptionStatus,
      "LIFETIME_ACTIVE",
    );
    await assert.rejects(
      () =>
        importStore(target, exported, {
          email: "other@example.test",
          password: "Restore-QA-Only-2026!",
          pin: "1234",
        }),
      /ฐานข้อมูลปลายทาง/,
    );
  } finally {
    await target.$disconnect();
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  }
});
after(() => db.$disconnect());
