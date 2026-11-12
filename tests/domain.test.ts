import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { seedTenantTemplate } from "../src/lib/provision";
import { createOrder, orderInput } from "../src/lib/orders";
import { returnStock } from "../src/lib/stock-deduction";
import { totals } from "../src/lib/money";
import { subscriptionState } from "../src/lib/license-guard";
import { staffCookie, verifyStaffCookie } from "../src/lib/staff-session";
import { promptpay } from "../src/lib/promptpay";
test("money: included/excluded VAT, service charge and capped discount", () => {
  assert.deepEqual(totals(107, 0, 7, true, 0), {
    subtotal: 107,
    discountAmount: 0,
    serviceChargeAmount: 0,
    vatAmount: 7,
    grandTotal: 107,
  });
  assert.equal(totals(100, 10, 7, false, 10).grandTotal, 105.93);
  assert.equal(totals(10, 100, 7, true, 0).grandTotal, 0);
});
test("subscription: trial expiry, exact grace boundary, lifetime and suspension", () => {
  const t = {
    subscriptionStatus: "TRIALING" as const,
    trialEndsAt: new Date(100),
    currentPeriodEndsAt: null,
  };
  assert.equal(subscriptionState(t, 101), "READ_ONLY");
  const active = {
    ...t,
    subscriptionStatus: "ACTIVE" as const,
    currentPeriodEndsAt: new Date(100),
  };
  assert.equal(subscriptionState(active, 100 + 3 * 86400000), "PAST_DUE");
  assert.equal(subscriptionState(active, 101 + 3 * 86400000), "READ_ONLY");
  assert.equal(
    subscriptionState({ ...t, subscriptionStatus: "LIFETIME_ACTIVE" }, 1e12),
    "LIFETIME_ACTIVE",
  );
  assert.equal(
    subscriptionState({ ...t, subscriptionStatus: "SUSPENDED" }, 0),
    "SUSPENDED",
  );
});
test("signed PIN session cannot cross users/tenants or accept tampering", () => {
  const cookie = staffCookie("staff", "owner", "tenant");
  assert.equal(verifyStaffCookie(cookie, "owner", "tenant"), "staff");
  assert.equal(verifyStaffCookie(cookie, "other", "tenant"), null);
  assert.equal(verifyStaffCookie(cookie, "owner", "other"), null);
  assert.equal(verifyStaffCookie(cookie + "x", "owner", "tenant"), null);
});
test("PromptPay validates receiver and encodes exact amount", () => {
  assert.throws(() => promptpay("", 100));
  assert.throws(() => promptpay("abc", 100));
  const qr = promptpay("0000000000", 123.45);
  assert.ok(qr.includes("5406123.45"));
  assert.ok(qr.endsWith(qr.slice(-4)));
  assert.match(qr, /6304[0-9A-F]{4}$/);
});
test("PostgreSQL transaction: seeding, modifiers, server prices, idempotency, stock, rollback, tenant isolation, stock restoration", async () => {
  const rollback = new Error("ROLLBACK_TEST");
  let assertions = 0;
  try {
    await db.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            email: `test-${randomUUID()}@example.test`,
            fullName: "Transactional QA",
          },
        });
        const tenant = await tx.tenant.create({
          data: {
            ownerId: user.id,
            name: "Transactional QA",
            slug: `test-${randomUUID()}`,
            trialEndsAt: new Date(Date.now() + 86400000),
          },
        });
        const branch = await seedTenantTemplate(
          tx,
          tenant.id,
          "CAFE_BEVERAGE",
          "1234",
          user.id,
          "QA",
          undefined,
          "INCLUSIVE",
        );
        assert.equal(
          await tx.product.count({ where: { tenantId: tenant.id } }),
          10,
        );
        assert.equal(
          await tx.diningTable.count({ where: { tenantId: tenant.id } }),
          6,
        );
        assertions += 2;
        const staff = await tx.staffMember.findFirstOrThrow({
          where: { tenantId: tenant.id },
        });
        await tx.cashierShift.create({
          data: {
            tenantId: tenant.id,
            branchId: branch.id,
            staffId: staff.id,
            startingCash: 1000,
          },
        });
        const product = await tx.product.findFirstOrThrow({
          where: { tenantId: tenant.id, sku: "SKU-002" },
          include: {
            modifierGroups: {
              include: { modifierGroup: { include: { options: true } } },
            },
          },
        });
        const sugar = product.modifierGroups.find(
          (g) => g.modifierGroup.isRequired,
        )!.modifierGroup.options[0];
        const input = orderInput.parse({
          clientOrderId: randomUUID(),
          items: [
            { productId: product.id, quantity: 2, optionIds: [sugar.id] },
          ],
          method: "CASH",
          cashReceived: 200,
        });
        const before = await tx.branchIngredientStock.findMany({
          where: { tenantId: tenant.id, branchId: branch.id },
          orderBy: { ingredientId: "asc" },
        });
        const order = await createOrder(
          tx,
          tenant.id,
          branch.id,
          staff.id,
          input,
        );
        assert.equal(Number(order.grandTotal), 150);
        assert.equal(Number(order.payments[0].changeGiven), 50);
        assertions += 2;
        const after = await tx.branchIngredientStock.findMany({
          where: { tenantId: tenant.id, branchId: branch.id },
          orderBy: { ingredientId: "asc" },
        });
        assert.ok(
          after.every(
            (s, i) => Number(s.currentQty) < Number(before[i].currentQty),
          ),
        );
        assertions++;
        const again = await createOrder(
          tx,
          tenant.id,
          branch.id,
          staff.id,
          input,
        );
        assert.equal(again.id, order.id);
        assert.equal(
          await tx.order.count({ where: { tenantId: tenant.id } }),
          1,
        );
        assertions += 2;
        await assert.rejects(
          () =>
            createOrder(tx, tenant.id, branch.id, staff.id, {
              ...input,
              items: [{ ...input.items[0], quantity: 3 }],
            }),
          /รหัสออเดอร์ซ้ำ/,
        );
        assertions++;
        await assert.rejects(() =>
          createOrder(tx, "other-tenant", branch.id, staff.id, {
            ...input,
            clientOrderId: randomUUID(),
          }),
        );
        assertions++;
        const movementCount = await tx.stockMovement.count({
          where: { tenantId: tenant.id },
        });
        assert.equal(movementCount, 3);
        assertions++;
        await returnStock(tx, tenant.id, branch.id, order.id);
        const restored = await tx.branchIngredientStock.findMany({
          where: { tenantId: tenant.id, branchId: branch.id },
          orderBy: { ingredientId: "asc" },
        });
        assert.deepEqual(
          restored.map((s) => String(s.currentQty)),
          before.map((s) => String(s.currentQty)),
        );
        assertions++;
        const bad = orderInput.safeParse({
          clientOrderId: randomUUID(),
          items: [{ productId: product.id, quantity: -1 }],
        });
        assert.equal(bad.success, false);
        assertions++;
        throw rollback;
      },
      { timeout: 30000 },
    );
  } catch (e) {
    if (e !== rollback) throw e;
  }
  assert.equal(assertions, 12);
});
test.after(async () => db.$disconnect());
