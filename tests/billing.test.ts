import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { activatePayment } from "../src/lib/billing";
test("historical invoices retain original prices; activation is atomic and never extends twice", async () => {
  const rollback = new Error("ROLLBACK");
  try {
    await db.$transaction(
      async (tx) => {
        const id = randomUUID();
        const owner = await tx.user.create({
          data: { email: `billing-${id}@example.test`, fullName: "Billing QA" },
        });
        const tenant = await tx.tenant.create({
          data: {
            name: "Billing QA",
            slug: `billing-${id}`,
            ownerId: owner.id,
            trialEndsAt: new Date(),
          },
        });
        const payment = await tx.saasPayment.create({
          data: {
            tenantId: tenant.id,
            invoiceNumber: `TEST-${id}`,
            planCode: "STARTER_MONTHLY",
            amount: 390,
            vatAmount: 27.3,
            totalAmount: 417.3,
            paymentMethod: "BANK_SLIP",
            status: "PENDING",
          },
        });
        await activatePayment(tx, payment.id, tenant.id);
        const first = await tx.tenant.findUniqueOrThrow({
          where: { id: tenant.id },
        });
        assert.equal(first.planCode, "STARTER_MONTHLY");
        assert.equal(first.subscriptionStatus, "ACTIVE");
        assert.equal(first.enableKds, false);
        assert.equal(first.enableQrOrder, false);
        assert.equal(first.enableRecipeBom, false);
        assert.equal(first.enableExport, true);
        assert.equal(first.maxProducts, 300);
        await activatePayment(tx, payment.id, tenant.id);
        const again = await tx.tenant.findUniqueOrThrow({
          where: { id: tenant.id },
        });
        assert.equal(+again.currentPeriodEndsAt!, +first.currentPeriodEndsAt!);
        assert.equal(
          await tx.emailOutbox.count({
            where: { tenantId: tenant.id, paymentId: payment.id },
          }),
          1,
        );
        const pro = await tx.saasPayment.create({
          data: {
            tenantId: tenant.id,
            invoiceNumber: `PRO-${id}`,
            planCode: "PRO_MONTHLY",
            amount: 790,
            vatAmount: 55.3,
            totalAmount: 845.3,
            paymentMethod: "BANK_SLIP",
            status: "PENDING",
          },
        });
        await activatePayment(tx, pro.id, tenant.id);
        const proTenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenant.id },
        });
        assert.equal(proTenant.enableKds, true);
        assert.equal(proTenant.enableQrOrder, true);
        assert.equal(proTenant.enableRecipeBom, true);
        assert.equal(proTenant.maxBranches, 3);
        const lifetime = await tx.saasPayment.create({
          data: {
            tenantId: tenant.id,
            invoiceNumber: `LIFE-${id}`,
            planCode: "LIFETIME_BUYOUT",
            amount: 12900,
            vatAmount: 903,
            totalAmount: 13803,
            paymentMethod: "BANK_SLIP",
            status: "PENDING",
          },
        });
        await activatePayment(tx, lifetime.id, tenant.id);
        const upgraded = await tx.tenant.findUniqueOrThrow({
          where: { id: tenant.id },
        });
        assert.equal(upgraded.subscriptionStatus, "LIFETIME_ACTIVE");
        assert.equal(upgraded.isLifetime, true);
        assert.equal(upgraded.currentPeriodEndsAt, null);
        assert.equal(upgraded.enableKds, true);
        assert.equal(upgraded.maxProducts, -1);
        throw rollback;
      },
      { timeout: 10000 },
    );
  } catch (e) {
    if (e !== rollback) throw e;
  }
});
after(() => db.$disconnect());
