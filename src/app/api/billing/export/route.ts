import { NextRequest } from "next/server";
import { context } from "@/lib/license-guard";
import { db } from "@/lib/db";
import { assert } from "@/lib/errors";
import { respond } from "@/lib/http";
export async function GET(req: NextRequest) {
  return respond(async () => {
    const { tenant } = await context(
      req.nextUrl.searchParams.get("storeSlug") ?? "",
      ["OWNER"],
    );
    assert(tenant.isLifetime, "สิทธิ์ส่งออกสำหรับ Lifetime เท่านั้น", 402);
    const tenantId = tenant.id;
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
      staff,
      tables,
      zones,
      cashMovements,
      auditLogs,
    ] = await Promise.all([
      db.storeBranch.findMany({ where: { tenantId } }),
      db.product.findMany({ where: { tenantId } }),
      db.category.findMany({ where: { tenantId } }),
      db.modifierGroup.findMany({
        where: { tenantId },
        include: {
          options: { where: { tenantId } },
          products: { where: { tenantId } },
        },
      }),
      db.ingredient.findMany({ where: { tenantId } }),
      db.branchIngredientStock.findMany({ where: { tenantId } }),
      db.recipeBomItem.findMany({ where: { tenantId } }),
      db.order.findMany({
        where: { tenantId },
        include: {
          items: {
            where: { tenantId },
            include: { modifiers: { where: { tenantId } } },
          },
          payments: { where: { tenantId } },
        },
      }),
      db.cashierShift.findMany({ where: { tenantId } }),
      db.stockMovement.findMany({ where: { tenantId } }),
      db.staffMember.findMany({
        where: { tenantId },
        select: {
          id: true,
          tenantId: true,
          displayName: true,
          role: true,
          isActive: true,
        },
      }),
      db.diningTable.findMany({
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
      db.diningZone.findMany({ where: { tenantId } }),
      db.cashMovement.findMany({ where: { tenantId } }),
      db.auditLog.findMany({ where: { tenantId } }),
    ]);
    const [branchProducts, productMovements, staffBranchAccess] =
      await Promise.all([
        db.branchProduct.findMany({ where: { tenantId } }),
        db.productStockMovement.findMany({ where: { tenantId } }),
        db.staffBranchAccess.findMany({ where: { tenantId } }),
      ]);
    return new Response(
      JSON.stringify(
        {
          format: "buzlike-export-v1",
          exportedAt: new Date(),
          tenant: {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            businessType: tenant.businessType,
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
          staff,
          tables,
          zones,
          cashMovements,
          auditLogs,
          branchProducts,
          productMovements,
          staffBranchAccess,
        },
        null,
        2,
      ),
      {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${tenant.slug}-export.json"`,
          "Cache-Control": "no-store",
        },
      },
    );
  });
}
