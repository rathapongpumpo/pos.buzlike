import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { assert } from "./errors";
const rows = z.array(z.record(z.string(), z.unknown()));
export const importSchema = z.object({
  format: z.literal("buzlike-export-v1"),
  tenant: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    businessType: z.enum(["CAFE_BEVERAGE", "RESTAURANT", "RETAIL_SHOP"]),
  }),
  branches: rows,
  products: rows,
  categories: rows,
  modifiers: rows,
  ingredients: rows,
  stocks: rows,
  recipes: rows,
  orders: rows,
  shifts: rows,
  movements: rows,
  staff: rows,
  tables: rows,
  zones: rows,
  cashMovements: rows.default([]),
  auditLogs: rows.default([]),
  branchProducts: rows.optional(),
  productMovements: rows.default([]),
  staffBranchAccess: rows.default([]),
});
export async function importStore(
  target: PrismaClient,
  input: unknown,
  owner: { email: string; password: string; pin: string },
) {
  const data = importSchema.parse(input);
  z.object({
    email: z.string().email(),
    password: z.string().min(10),
    pin: z.string().regex(/^\d{4,6}$/),
  }).parse(owner);
  return target.$transaction(
    async (tx) => {
      assert(
        (await tx.tenant.count()) === 0,
        "นำเข้าได้เฉพาะฐานข้อมูลปลายทางที่ยังไม่มีร้านค้า",
      );
      const user = await tx.user.create({
        data: {
          email: owner.email.toLowerCase(),
          passwordHash: await hash(owner.password, 12),
          fullName: "เจ้าของร้าน",
        },
      });
      const tenant = await tx.tenant.create({
        data: {
          ...data.tenant,
          ownerId: user.id,
          trialEndsAt: new Date(),
          planCode: "LIFETIME_BUYOUT",
          subscriptionStatus: "LIFETIME_ACTIVE",
          isLifetime: true,
          maxBranches: -1,
          maxTerminals: -1,
          maxProducts: -1,
          maxStaff: -1,
          enableKds: true,
          enableQrOrder: true,
          enableRecipeBom: true,
          enableExport: true,
        },
      });
      const tenantId = tenant.id;
      await tx.storeBranch.createMany({
        data: data.branches.map((r) => ({
          ...r,
          tenantId,
        })) as Prisma.StoreBranchCreateManyInput[],
      });
      await tx.category.createMany({
        data: data.categories.map((r) => ({
          ...r,
          tenantId,
        })) as Prisma.CategoryCreateManyInput[],
      });
      await tx.product.createMany({
        data: data.products.map((r) => ({
          ...r,
          tenantId,
        })) as Prisma.ProductCreateManyInput[],
      });
      if (data.branchProducts) {
        assert(
          data.branchProducts.length ===
            data.branches.length * data.products.length,
          "ไฟล์สต็อกรายสาขาไม่ครบ",
        );
        const seen = new Set<string>();
        for (const raw of data.branchProducts) {
          const row = z
            .object({
              branchId: z.string(),
              productId: z.string(),
              quantity: z.number().int().nonnegative(),
              price: z.coerce.number().nonnegative(),
              isAvailable: z.boolean(),
            })
            .parse(raw);
          const key = `${row.branchId}:${row.productId}`;
          assert(!seen.has(key), "สต็อกรายสาขาซ้ำ");
          seen.add(key);
          await tx.branchProduct.update({
            where: {
              branchId_productId: {
                branchId: row.branchId,
                productId: row.productId,
              },
              tenantId,
            },
            data: {
              quantity: row.quantity,
              price: row.price,
              isAvailable: row.isAvailable,
            },
          });
        }
      }
      for (const group of data.modifiers) {
        const { options, products, ...row } = group;
        await tx.modifierGroup.create({
          data: {
            ...row,
            tenantId,
          } as Prisma.ModifierGroupUncheckedCreateInput,
        });
        await tx.modifierOption.createMany({
          data: rows.parse(options).map((r) => ({
            ...r,
            tenantId,
          })) as Prisma.ModifierOptionCreateManyInput[],
        });
        await tx.productModifierGroup.createMany({
          data: rows.parse(products).map((r) => ({
            ...r,
            tenantId,
          })) as Prisma.ProductModifierGroupCreateManyInput[],
        });
      }
      await tx.ingredient.createMany({
        data: data.ingredients.map((r) => ({
          ...r,
          tenantId,
        })) as Prisma.IngredientCreateManyInput[],
      });
      await tx.branchIngredientStock.createMany({
        data: data.stocks.map((r) => ({
          ...r,
          tenantId,
        })) as Prisma.BranchIngredientStockCreateManyInput[],
      });
      await tx.recipeBomItem.createMany({
        data: data.recipes.map((r) => ({
          ...r,
          tenantId,
        })) as Prisma.RecipeBomItemCreateManyInput[],
      });
      const ownerStaff = data.staff.find((r) => r.role === "OWNER");
      assert(ownerStaff, "ไฟล์ไม่มีบัญชีเจ้าของร้าน");
      for (const s of data.staff)
        await tx.staffMember.create({
          data: {
            ...s,
            tenantId,
            userId: s.id === ownerStaff.id ? user.id : null,
            isActive: s.id === ownerStaff.id,
            pinCodeHash: await hash(
              s.id === ownerStaff.id ? owner.pin : randomUUID(),
              10,
            ),
          } as Prisma.StaffMemberUncheckedCreateInput,
        });
      await tx.staffBranchAccess.createMany({
        data: data.staffBranchAccess.map((row) => ({
          ...row,
          tenantId,
        })) as Prisma.StaffBranchAccessCreateManyInput[],
      });
      await tx.diningZone.createMany({
        data: data.zones.map((r) => ({
          ...r,
          tenantId,
        })) as Prisma.DiningZoneCreateManyInput[],
      });
      await tx.diningTable.createMany({
        data: data.tables.map((r) => ({
          ...r,
          tenantId,
          activeQrToken: r.status === "AVAILABLE" ? null : randomUUID(),
          currentOrderId: null,
        })) as Prisma.DiningTableCreateManyInput[],
      });
      await tx.cashierShift.createMany({
        data: data.shifts.map((r) => ({
          ...r,
          tenantId,
        })) as Prisma.CashierShiftCreateManyInput[],
      });
      for (const order of data.orders) {
        const { items, payments, ...row } = order;
        await tx.order.create({
          data: { ...row, tenantId } as Prisma.OrderUncheckedCreateInput,
        });
        for (const item of rows.parse(items)) {
          const { modifiers, ...itemRow } = item;
          await tx.orderItem.create({
            data: {
              ...itemRow,
              tenantId,
            } as Prisma.OrderItemUncheckedCreateInput,
          });
          await tx.orderItemModifier.createMany({
            data: rows.parse(modifiers).map((r) => ({
              ...r,
              tenantId,
            })) as Prisma.OrderItemModifierCreateManyInput[],
          });
        }
        await tx.orderPayment.createMany({
          data: rows.parse(payments).map((r) => ({
            ...r,
            tenantId,
          })) as Prisma.OrderPaymentCreateManyInput[],
        });
      }
      await tx.stockMovement.createMany({
        data: data.movements.map((r) => ({
          ...r,
          tenantId,
        })) as Prisma.StockMovementCreateManyInput[],
      });
      await tx.productStockMovement.createMany({
        data: data.productMovements.map((row) => ({
          ...row,
          tenantId,
        })) as Prisma.ProductStockMovementCreateManyInput[],
      });
      await tx.cashMovement.createMany({
        data: data.cashMovements.map((r) => ({
          ...r,
          tenantId,
        })) as Prisma.CashMovementCreateManyInput[],
      });
      await tx.auditLog.createMany({
        data: data.auditLogs.map((r) => ({
          ...r,
          tenantId,
        })) as Prisma.AuditLogCreateManyInput[],
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorName: "เจ้าของร้าน",
          action: "SELF_HOST_IMPORT",
          details: "Restored store data. Staff PINs reset; QR tokens rotated.",
        },
      });
      return {
        slug: tenant.slug,
        products: data.products.length,
        orders: data.orders.length,
      };
    },
    { timeout: 60000 },
  );
}
