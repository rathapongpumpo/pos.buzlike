import { NextRequest } from "next/server";
import { db, serial } from "@/lib/db";
import { assert } from "@/lib/errors";
import { respond } from "@/lib/http";
import { orderInput, createOrder } from "@/lib/orders";
import { branchProductView } from "@/lib/branch-product";
import { feature, subscriptionState } from "@/lib/license-guard";
import { sameOrigin, rateLimit } from "@/lib/security";
import { effectiveTenant } from "@/lib/entitlements";
type Route = { params: Promise<{ tableToken: string }> };
async function getTable(token: string) {
  const table = await db.diningTable.findFirst({
    where: { activeQrToken: token, status: { not: "AVAILABLE" } },
    include: { zone: { include: { branch: { include: { tenant: true } } } } },
  });
  assert(table, "QR นี้หมดอายุแล้ว กรุณาติดต่อพนักงาน", 410);
  const { tenant } = await effectiveTenant(table.zone.branch.tenant);
  assert(table.zone.branch.isActive, "สาขานี้ยังไม่เปิดให้บริการ", 410);
  feature(tenant, "enableQrOrder");
  assert(
    !["SUSPENDED", "READ_ONLY"].includes(subscriptionState(tenant)),
    "ร้านยังไม่พร้อมรับออเดอร์",
    402,
  );
  return { table, tenant, branch: table.zone.branch };
}
export async function GET(req: NextRequest, route: Route) {
  return respond(async () => {
    const { tableToken } = await route.params;
    const { table, tenant, branch } = await getTable(tableToken);
    const products = await db.product.findMany({
      where: {
        tenantId: tenant.id,
        branchStocks: {
          some: { tenantId: tenant.id, branchId: branch.id, isAvailable: true },
        },
      },
      include: {
        branchStocks: { where: { tenantId: tenant.id, branchId: branch.id } },
        category: true,
        modifierGroups: {
          where: { tenantId: tenant.id },
          include: {
            modifierGroup: {
              include: { options: { where: { tenantId: tenant.id } } },
            },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });
    return {
      name: tenant.name,
      table: { id: table.id, name: table.name },
      branch: {
        vatRate: branch.vatRate,
        vatInclusive: branch.vatInclusive,
        serviceChargeRate: branch.serviceChargeRate,
      },
      products: products.map(({ branchStocks, ...product }) =>
        branchProductView(product, branchStocks[0]),
      ),
    };
  });
}
export async function POST(req: NextRequest, route: Route) {
  return respond(async () => {
    sameOrigin(req);
    const { tableToken } = await route.params;
    await rateLimit(`qr:${tableToken}`, 20, 60000);
    const { table, tenant, branch } = await getTable(tableToken);
    const body = await req.json();
    if (body.action === "call" || body.action === "bill") {
      await db.diningTable.updateMany({
        where: { tenantId: tenant.id, id: table.id, activeQrToken: tableToken },
        data: { status: "BILL_REQUESTED" },
      });
      return { ok: true };
    }
    const input = orderInput.parse({
      ...body,
      tableId: table.id,
      orderType: "DINE_IN",
      discount: 0,
      method: undefined,
      payments: undefined,
    });
    const order = await serial(async (tx) => {
      const fresh = await tx.diningTable.findFirst({
        where: {
          tenantId: tenant.id,
          id: table.id,
          activeQrToken: tableToken,
          status: { not: "AVAILABLE" },
        },
      });
      assert(fresh, "QR นี้หมดอายุแล้ว", 410);
      return createOrder(tx, tenant.id, branch.id, null, input, true);
    });
    return {
      orderNumber: order.orderNumber,
      queueNumber: order.queueNumber,
      grandTotal: order.grandTotal,
    };
  });
}
