import { Prisma } from "@prisma/client";
import { assert } from "./errors";
import { effectiveTenantById } from "./entitlements";
export async function deductStock(
  tx: Prisma.TransactionClient,
  tenantId: string,
  branchId: string,
  orderId: string,
) {
  const order = await tx.order.findFirstOrThrow({
    where: { id: orderId, tenantId, branchId },
    include: { items: true },
  });
  const { tenant } = await effectiveTenantById(tenantId, tx);
  const quantities = new Map<string, number>();
  for (const item of order.items)
    quantities.set(
      item.productId,
      (quantities.get(item.productId) ?? 0) + item.quantity,
    );
  for (const [productId, quantity] of quantities) {
    const p = await tx.product.findFirstOrThrow({
      where: { id: productId, tenantId },
      include: { recipeItems: { where: { tenantId } } },
    });
    if (
      p.trackStockType === "DIRECT_UNIT" ||
      (!tenant.enableRecipeBom && p.trackStockType !== "NONE")
    ) {
      if (
        await tx.productStockMovement.findFirst({
          where: { tenantId, branchId, orderId, productId, kind: "SALE" },
        })
      )
        continue;
      const changed = await tx.branchProduct.updateMany({
        where: { tenantId, branchId, productId, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
      assert(changed.count, "สินค้าในสาขานี้ไม่เพียงพอ: " + p.name, 409);
      const stock = await tx.branchProduct.findUniqueOrThrow({
        where: { branchId_productId: { branchId, productId } },
      });
      await tx.productStockMovement.create({
        data: {
          tenantId,
          branchId,
          productId,
          orderId,
          kind: "SALE",
          quantityChange: -quantity,
          balanceAfter: stock.quantity,
        },
      });
    } else if (p.trackStockType === "RECIPE") {
      for (const recipe of p.recipeItems) {
        const qty = Number(recipe.quantityUsed) * quantity;
        const result = await tx.branchIngredientStock.updateMany({
          where: {
            tenantId,
            branchId,
            ingredientId: recipe.ingredientId,
            currentQty: { gte: qty },
          },
          data: { currentQty: { decrement: qty } },
        });
        assert(result.count, "วัตถุดิบไม่เพียงพอสำหรับ " + p.name, 409);
        const stock = await tx.branchIngredientStock.findFirstOrThrow({
          where: { tenantId, branchId, ingredientId: recipe.ingredientId },
        });
        await tx.stockMovement.create({
          data: {
            tenantId,
            branchId,
            ingredientId: recipe.ingredientId,
            type: "SALE_DEDUCTION",
            quantityChange: -qty,
            balanceAfter: stock.currentQty,
            referenceOrderId: orderId,
          },
        });
      }
    }
  }
}
export async function returnStock(
  tx: Prisma.TransactionClient,
  tenantId: string,
  branchId: string,
  orderId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
  await tx.order.findFirstOrThrow({
    where: { id: orderId, tenantId, branchId },
  });
  const movements = await tx.stockMovement.findMany({
    where: {
      tenantId,
      branchId,
      referenceOrderId: orderId,
      type: "SALE_DEDUCTION",
    },
  });
  const ingredients = new Map<string, number>();
  for (const movement of movements)
    ingredients.set(
      movement.ingredientId,
      (ingredients.get(movement.ingredientId) ?? 0) -
        Number(movement.quantityChange),
    );
  for (const [ingredientId, quantity] of ingredients) {
    if (
      await tx.stockMovement.findFirst({
        where: {
          tenantId,
          branchId,
          ingredientId,
          referenceOrderId: orderId,
          type: "VOID_RETURN",
        },
      })
    )
      continue;
    const stock = await tx.branchIngredientStock.findFirstOrThrow({
      where: { tenantId, branchId, ingredientId },
    });
    const updated = await tx.branchIngredientStock.update({
      where: { id: stock.id, tenantId },
      data: { currentQty: { increment: quantity } },
    });
    await tx.stockMovement.create({
      data: {
        tenantId,
        branchId,
        ingredientId,
        type: "VOID_RETURN",
        quantityChange: quantity,
        balanceAfter: updated.currentQty,
        referenceOrderId: orderId,
      },
    });
  }
  const sales = await tx.productStockMovement.findMany({
    where: { tenantId, branchId, orderId, kind: "SALE" },
  });
  const direct = new Map(
    sales.map((sale) => [sale.productId, -sale.quantityChange]),
  );
  if (!sales.length)
    for (const log of await tx.auditLog.findMany({
      where: {
        tenantId,
        action: "DIRECT_STOCK_DEDUCTION",
        details: { contains: orderId },
      },
    })) {
      try {
        const row = JSON.parse(log.details);
        if (
          row.orderId === orderId &&
          Number.isInteger(row.quantity) &&
          row.quantity > 0
        )
          direct.set(
            row.productId,
            (direct.get(row.productId) ?? 0) + row.quantity,
          );
      } catch {
        /* Preserve malformed legacy records for manual review. */
      }
    }
  for (const [productId, quantity] of direct) {
    if (
      await tx.productStockMovement.findFirst({
        where: { tenantId, branchId, orderId, productId, kind: "RETURN" },
      })
    )
      continue;
    const stock = await tx.branchProduct.update({
      where: { branchId_productId: { branchId, productId }, tenantId },
      data: { quantity: { increment: quantity } },
    });
    await tx.productStockMovement.create({
      data: {
        tenantId,
        branchId,
        orderId,
        productId,
        kind: "RETURN",
        quantityChange: quantity,
        balanceAfter: stock.quantity,
      },
    });
  }
}
