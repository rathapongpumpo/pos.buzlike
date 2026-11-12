import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { compare, hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { db, serial } from "@/lib/db";
import { releasePolicy } from "@/lib/release-policy";
import { context, feature } from "@/lib/license-guard";
import { assert } from "@/lib/errors";
import { respond } from "@/lib/http";
import { sameOrigin, rateLimit, audit } from "@/lib/security";
import {
  createOrder,
  orderInput,
  orderInclude,
  writePayments,
} from "@/lib/orders";
import { deductStock, returnStock } from "@/lib/stock-deduction";
import { staffCookie } from "@/lib/staff-session";
import { promptpay } from "@/lib/promptpay";
import { publish, subscribe } from "@/lib/realtime";
import { cents } from "@/lib/money";
import { branchProductView } from "@/lib/branch-product";
import { mayAssumeRole, staffBranchIds } from "@/lib/branch-access";
import { stripeReady } from "@/lib/stripe-client";
import { effectiveTenantById } from "@/lib/entitlements";
type Route = { params: Promise<{ storeSlug: string; path: string[] }> };
const managers = ["OWNER", "MANAGER"] as const;
const sellers = ["OWNER", "MANAGER", "CASHIER"] as const;
const number = z.coerce.number().finite();
export async function GET(req: NextRequest, route: Route) {
  return respond(async () => {
    const { storeSlug, path } = await route.params;
    const key = path.join("/");
    const ctx = await context(
      storeSlug,
      key === "reports/export" ? [...managers] : undefined,
      false,
      req.nextUrl.searchParams.get("branchId"),
    );
    const { tenant, staff } = ctx;
    const tenantId = tenant.id;
    const requested = req.nextUrl.searchParams.get("branchId");
    const branch = requested
      ? ctx.branches.find((b) => b.id === requested)
      : ctx.branch;
    assert(branch, "ไม่พบสาขา", 404);
    const branchId = branch.id;
    if (key === "promptpay")
      return {
        payload: promptpay(
          branch.promptPayId,
          Number(req.nextUrl.searchParams.get("amount")),
        ),
      };
    if (key === "reports/summary") {
      assert(
        managers.includes(staff.role as never),
        "ไม่มีสิทธิ์ดูรายงาน",
        403,
      );
      const date = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .parse(req.nextUrl.searchParams.get("date"));
      const start = new Date(`${date}T00:00:00+07:00`);
      assert(!isNaN(+start), "วันที่ไม่ถูกต้อง");
      const end = new Date(+start + 86400000);
      const orders = await db.order.findMany({
        where: {
          tenantId,
          branchId,
          status: "PAID",
          paidAt: { gte: start, lt: end },
        },
        include: {
          items: { where: { tenantId } },
          payments: { where: { tenantId } },
        },
      });
      const hours = Array.from({ length: 24 }, () => 0);
      const best = new Map<
        string,
        { name: string; quantity: number; total: number }
      >();
      let sales = 0,
        cash = 0;
      for (const o of orders) {
        sales += Number(o.grandTotal);
        const h = Number(
          new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Bangkok",
            hour: "2-digit",
            hourCycle: "h23",
          }).format(o.paidAt!),
        );
        hours[h] += Number(o.grandTotal);
        cash += o.payments
          .filter((p) => p.method === "CASH")
          .reduce((s, p) => s + Number(p.amount), 0);
        for (const i of o.items) {
          const row = best.get(i.productId) ?? {
            name: i.productNameSnapshot,
            quantity: 0,
            total: 0,
          };
          row.quantity += i.quantity;
          row.total += Number(i.lineTotal);
          best.set(i.productId, row);
        }
      }
      return {
        sales,
        bills: orders.length,
        average: orders.length ? sales / orders.length : 0,
        cash,
        hours,
        best: [...best.values()].sort((a, b) => b.quantity - a.quantity),
      };
    }
    if (key === "reports/export") {
      if (ctx.state !== "READ_ONLY") feature(tenant, "enableExport");
      const csvCell = (v: unknown) =>
        `"${String(v ?? "")
          .replace(/^[=+\-@\t\r]/, "'$&")
          .replaceAll('"', '""')}"`;
      let rows: unknown[][] = [];
      if (req.nextUrl.searchParams.get("type") === "stock") {
        const stocks = await db.branchIngredientStock.findMany({
          where: { tenantId, branchId },
          include: { ingredient: true },
        });
        rows = [
          ["วัตถุดิบ", "คงเหลือ", "หน่วย"],
          ...stocks.map((s) => [
            s.ingredient.name,
            s.currentQty,
            s.ingredient.unit,
          ]),
        ];
      } else {
        const orders = await db.order.findMany({
          where: { tenantId, branchId },
          orderBy: { createdAt: "desc" },
        });
        rows = [
          ["เลขที่บิล", "วันที่", "สถานะ", "ยอดสุทธิ", "VAT"],
          ...orders.map((o) => [
            o.orderNumber,
            o.createdAt.toISOString(),
            o.status,
            o.grandTotal,
            o.vatAmount,
          ]),
        ];
      }
      return new Response(
        "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="buzlike-report.csv"',
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if (key === "bootstrap") {
      const release = await releasePolicy();
      const [
        products,
        categories,
        ingredients,
        tables,
        orders,
        shifts,
        staffList,
        plans,
        payments,
        stockMovements,
        cashMovements,
        zones,
      ] = await Promise.all([
        db.product.findMany({
          where: { tenantId },
          orderBy: { sortOrder: "asc" },
          include: {
            branchStocks: { where: { tenantId, branchId } },
            category: true,
            recipeItems: { where: { tenantId } },
            modifierGroups: {
              where: { tenantId },
              include: {
                modifierGroup: {
                  include: {
                    options: {
                      where: { tenantId },
                      orderBy: { sortOrder: "asc" },
                    },
                  },
                },
              },
            },
          },
        }),
        db.category.findMany({
          where: { tenantId },
          orderBy: { sortOrder: "asc" },
        }),
        db.ingredient.findMany({
          where: { tenantId },
          include: { branchStocks: { where: { tenantId, branchId } } },
        }),
        db.diningTable.findMany({
          where: { tenantId, zone: { branchId } },
          include: { zone: true },
          orderBy: { name: "asc" },
        }),
        db.order.findMany({
          where: { tenantId, branchId },
          include: orderInclude,
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
        db.cashierShift.findMany({
          where: { tenantId, branchId },
          orderBy: { openedAt: "desc" },
          take: 50,
        }),
        db.staffMember.findMany({
          where: {
            tenantId,
            OR: [
              { role: "OWNER" },
              { branchAccess: { some: { tenantId, branchId } } },
            ],
          },
          select: {
            id: true,
            displayName: true,
            role: true,
            isActive: true,
            userId: true,
            branchAccess: { select: { branchId: true } },
          },
        }),
        db.plan.findMany(),
        staff.role === "OWNER"
          ? db.saasPayment.findMany({
              where: { tenantId },
              orderBy: { createdAt: "desc" },
            })
          : [],
        db.stockMovement.findMany({
          where: { tenantId, branchId },
          include: { ingredient: true },
          orderBy: { createdAt: "desc" },
          take: 60,
        }),
        db.cashMovement.findMany({
          where: {
            tenantId,
            shiftId: {
              in: (
                await db.cashierShift.findMany({
                  where: { tenantId, branchId },
                  select: { id: true },
                })
              ).map((shift) => shift.id),
            },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        db.diningZone.findMany({ where: { tenantId, branchId } }),
      ]);
      const openOrders = await db.order.findMany({
        where: {
          tenantId,
          branchId,
          status: "OPEN",
          id: { notIn: orders.map((o) => o.id) },
        },
        include: orderInclude,
      });
      const activeShift = shifts.find((s) => s.status === "OPEN");
      let shiftCash = 0,
        shiftMovements = 0;
      if (activeShift) {
        shiftCash = Number(
          (
            await db.orderPayment.aggregate({
              where: {
                tenantId,
                method: "CASH",
                order: {
                  tenantId,
                  branchId,
                  shiftId: activeShift.id,
                  status: "PAID",
                },
              },
              _sum: { amount: true },
            })
          )._sum.amount ?? 0,
        );
        shiftMovements = Number(
          (
            await db.cashMovement.aggregate({
              where: { tenantId, shiftId: activeShift.id },
              _sum: { amount: true },
            })
          )._sum.amount ?? 0,
        );
      }
      return {
        terminals:
          staff.role === "OWNER"
            ? await db.posTerminal.findMany({
                where: { tenantId },
                orderBy: { lastSeenAt: "desc" },
              })
            : [],
        tenant: {
          ...tenant,
          stripeCustomerId: undefined,
          stripeSubId: undefined,
        },
        state: ctx.state,
        entitlement: ctx.entitlement,
        release: { mode: release.releaseMode, checkoutAvailable: release.releaseMode !== "PRIVATE_PILOT" && release.checkoutMode === "PUBLIC" },
        branch,
        branches: ctx.branches,
        staff: {
          id: staff.id,
          displayName: staff.displayName,
          role: staff.role,
        },
        accountStaffId: ctx.membership.id,
        products: products
          .filter((p) => p.branchStocks.length > 0)
          .map(({ branchStocks, ...p }) =>
            branchProductView(p, branchStocks[0]),
          ),
        categories,
        ingredients,
        tables,
        orders: [...openOrders, ...orders],
        shifts,
        staffList: staffList.map(({ branchAccess, ...s }) => ({
          ...s,
          canSwitch: mayAssumeRole(ctx.membership.role, s.role),
          branchIds:
            s.role === "OWNER"
              ? ctx.branches.map((b) => b.id)
              : branchAccess
                  .map((grant) => grant.branchId)
                  .filter((id) => ctx.branches.some((b) => b.id === id)),
        })),
        plans,
        payments,
        stockMovements,
        cashMovements,
        zones,
        shiftCash,
        shiftMovements,
        integrations: {
          hasStripeSubscription: staff.role === "OWNER" && !!tenant.stripeSubId,
          recurring: staff.role === "OWNER" && !!tenant.stripeSubId && !["canceled", "incomplete_expired"].includes(tenant.stripeSubscriptionStatus ?? ""),
          stripe: stripeReady(),
          platformPromptpay: !!process.env.PLATFORM_PROMPTPAY_ID,
        },
      };
    }
    if (key === "events") {
      let last = "";
      let timer: ReturnType<typeof setInterval>;
      let closed = false;
      let unsubscribe = () => {};
      const stream = new ReadableStream({
        start(controller) {
          const send = async () => {
            if (closed) return;
            try {
              // A grant/session may be revoked while an SSE connection is open.
              const currentContext = await context(storeSlug, undefined, false, branchId);
              const [orders, tables, stockVersions] = await Promise.all([
                db.order.findMany({
                  where: { tenantId, branchId },
                  select: {
                    id: true,
                    status: true,
                    kitchenStatus: true,
                    items: { select: { id: true, kitchenStatus: true } },
                  },
                  orderBy: { createdAt: "desc" },
                  take: 100,
                }),
                db.diningTable.findMany({
                  where: { tenantId, zone: { branchId } },
                  select: { id: true, status: true, currentOrderId: true },
                }),
                db.branchProduct.findMany({
                  where: { tenantId, branchId },
                  select: { productId: true, version: true },
                  orderBy: { productId: "asc" },
                }),
              ]);
              const revision = JSON.stringify([orders, tables, stockVersions, currentContext.state, currentContext.entitlement]);
              if (revision !== last) {
                last = revision;
                controller.enqueue(
                  new TextEncoder().encode(
                    "data: " + JSON.stringify({ type: "refresh" }) + "\n\n",
                  ),
                );
              } else
                controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
            } catch {
              if (!closed) {
                closed = true;
                clearInterval(timer);
                unsubscribe();
                controller.close();
              }
            }
          };
          void send();
          void subscribe(`${tenantId}:${branchId}`, () => void send()).then(
            (cleanup) => {
              if (closed) cleanup();
              else unsubscribe = cleanup;
            },
          );
          timer = setInterval(() => void send(), 1500);
          req.signal.addEventListener("abort", () => {
            closed = true;
            clearInterval(timer);
            unsubscribe();
            try {
              controller.close();
            } catch {}
          });
        },
        cancel() {
          closed = true;
          clearInterval(timer);
          unsubscribe();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }
    assert(false, "ไม่พบ API", 404);
  });
}
export async function POST(req: NextRequest, route: Route) {
  return mutate(req, route);
}
export async function PATCH(req: NextRequest, route: Route) {
  return mutate(req, route);
}
async function mutate(req: NextRequest, route: Route) {
  return respond(async () => {
    sameOrigin(req);
    const { storeSlug, path } = await route.params;
    const key = path.join("/");
    const b = await req.json();
    const allowed =
      key === "pin/switch"
        ? undefined
        : key.includes("/kds")
          ? ["OWNER", "MANAGER", "KITCHEN"]
          : key.startsWith("tables")
            ? ["OWNER", "MANAGER", "CASHIER", "WAITER"]
            : key.startsWith("orders") || key.startsWith("shifts")
              ? [...sellers]
              : key === "settings" || key.startsWith("branches")
                ? ["OWNER"]
                : [...managers];
    const ctx = await context(
      storeSlug,
      allowed as never,
      key !== "pin/switch",
      b.branchId,
    );
    const { tenant, staff } = ctx;
    const tenantId = tenant.id;
    const branchId = b.branchId ?? ctx.branch.id;
    assert(
      ctx.branches.some((branch) => branch.id === branchId),
      "ไม่พบสาขา",
      404,
    );
    const record = async (action: string, details: string) =>
      audit(tenantId, staff.displayName, action, details);
    if (key === "terminals/revoke") {
      assert(staff.role === "OWNER", "เฉพาะเจ้าของร้าน", 403);
      const id = z.string().parse(b.id);
      await db.posTerminal.deleteMany({ where: { id, tenantId } });
      await record("REVOKE_TERMINAL", id);
      return { ok: true };
    }
    if (key === "pin/switch") {
      await rateLimit(`pin:${tenantId}:${ctx.session.user.id}`, 8, 60000);
      const input = z
        .object({ staffId: z.string(), pin: z.string().regex(/^\d{4,6}$/) })
        .parse(b);
      const member = await db.staffMember.findFirst({
        where: { tenantId, id: input.staffId, isActive: true },
      });
      assert(
        member && (await compare(input.pin, member.pinCodeHash)),
        "PIN ไม่ถูกต้อง",
        403,
      );
      assert(
        mayAssumeRole(ctx.membership.role, member.role),
        "บัญชีนี้ไม่มีสิทธิ์สลับเป็นบทบาทนี้",
        403,
      );
      assert(
        (await staffBranchIds(tenantId, member.id, member.role)).includes(
          branchId,
        ),
        "พนักงานไม่มีสิทธิ์ในสาขานี้",
        403,
      );
      (await cookies()).set(
        `pos-staff-${tenantId}`,
        staffCookie(member.id, ctx.session.user.id, tenantId),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 43200,
        },
      );
      return { ok: true };
    }
    if (key === "orders") {
      const input = orderInput.parse(b);
      if (input.tableId) feature(tenant, "enableQrOrder");
      assert(input.terminalId, "ต้องระบุ terminalId สำหรับเครื่องขาย");
      assert(
        !req.headers.get("idempotency-key") ||
          req.headers.get("idempotency-key") === input.clientOrderId,
        "Idempotency-Key ไม่ตรงกับ clientOrderId",
      );
      if (input.discount > 0)
        assert(
          managers.includes(staff.role as never),
          "ส่วนลดต้องใช้สิทธิ์ผู้จัดการ",
          403,
        );
      const order = await serial((tx) =>
        createOrder(tx, tenantId, branchId, staff.id, input),
      );
      await publish(`${tenantId}:${branchId}`);
      return order;
    }
    if (path[0] === "orders" && path[2] === "kds") {
      feature(tenant, "enableKds");
      const input = z
        .object({
          status: z.enum(["PREPARING", "READY", "SERVED"]),
          itemId: z.string().optional(),
        })
        .parse(b);
      const result = await serial(async (tx) => {
        const order = await tx.order.findFirst({
          where: {
            tenantId,
            id: path[1],
            branchId,
            status: { in: ["OPEN", "PAID"] },
          },
        });
        assert(order, "ไม่พบออเดอร์", 404);
        if (input.itemId) {
          const changed = await tx.orderItem.updateMany({
            where: { tenantId, orderId: order.id, id: input.itemId },
            data: { kitchenStatus: input.status },
          });
          assert(changed.count, "ไม่พบรายการ", 404);
        } else {
          await tx.order.updateMany({
            where: { tenantId, id: order.id },
            data: { kitchenStatus: input.status },
          });
          await tx.orderItem.updateMany({
            where: { tenantId, orderId: order.id },
            data: { kitchenStatus: input.status },
          });
        }
        return { ok: true };
      });
      await publish(`${tenantId}:${branchId}`);
      return result;
    }
    if (path[0] === "orders" && ["void", "refund"].includes(path[2])) {
      assert(
        managers.includes(staff.role as never),
        "ต้องใช้สิทธิ์ผู้จัดการ",
        403,
      );
      const input = z
        .object({ pin: z.string(), reason: z.string().trim().min(3).max(500) })
        .parse(b);
      await rateLimit(`void-pin:${tenantId}`, 10, 60000);
      assert(
        await compare(input.pin, staff.pinCodeHash),
        "PIN ผู้จัดการไม่ถูกต้อง",
        403,
      );
      return serial(async (tx) => {
        const o = await tx.order.findFirst({
          where: { tenantId, id: path[1], branchId },
        });
        assert(o, "ไม่พบออเดอร์", 404);
        assert(
          ["OPEN", "PAID"].includes(o.status),
          "รายการถูกยกเลิกหรือคืนเงินแล้ว",
          409,
        );
        if (o.status === "PAID")
          await returnStock(tx, tenantId, branchId, o.id);
        await tx.order.updateMany({
          where: { tenantId, id: o.id },
          data: {
            status: path[2] === "refund" ? "REFUNDED" : "VOIDED",
            voidReason: input.reason,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            actorName: staff.displayName,
            action: path[2] === "refund" ? "REFUND_ORDER" : "VOID_ORDER",
            details: `${o.orderNumber}: ${input.reason}`,
          },
        });
        return { ok: true };
      });
    }
    if (key === "orders/settle") {
      const input = z
        .object({
          orderIds: z.array(z.string()).min(1).max(100),
          method: z.enum(["CASH", "PROMPTPAY_QR", "CREDIT_CARD", "TRANSFER"]),
          cashReceived: number.nonnegative().optional(),
          referenceNo: z.string().optional(),
          payments: orderInput.shape.payments,
        })
        .parse(b);
      return serial(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
        const orders = await tx.order.findMany({
          where: {
            tenantId,
            branchId,
            id: { in: input.orderIds },
            status: "OPEN",
          },
        });
        assert(
          orders.length === [...new Set(input.orderIds)].length,
          "บิลถูกชำระแล้วหรือไม่พบข้อมูล",
          409,
        );
        const shift = await tx.cashierShift.findFirst({
          where: { tenantId, branchId, status: "OPEN" },
        });
        assert(shift, "กรุณาเปิดกะ", 409);
        const total =
          orders.reduce((s, o) => s + cents(Number(o.grandTotal)), 0) / 100;
        const pool = input.payments?.map((p) => ({
          ...p,
          remaining: cents(p.amount),
          change:
            p.method === "CASH"
              ? cents(p.cashReceived ?? p.amount) - cents(p.amount)
              : 0,
        }));
        if (pool) {
          assert(
            pool.reduce((s, p) => s + p.remaining, 0) === cents(total),
            "ยอดแบ่งชำระไม่ตรงกับยอดสุทธิ",
          );
          assert(
            pool.every((p) => p.change >= 0),
            "เงินสดไม่พอ",
          );
        }
        assert(
          input.method !== "CASH" || (input.cashReceived ?? 0) >= total,
          "เงินสดไม่พอ",
        );
        for (const [i, o] of orders.entries()) {
          const allocations: NonNullable<typeof input.payments> = [];
          if (pool) {
            let remaining = cents(Number(o.grandTotal));
            for (const p of pool) {
              if (remaining <= 0) break;
              const amount = Math.min(remaining, p.remaining);
              if (amount <= 0) continue;
              p.remaining -= amount;
              remaining -= amount;
              allocations.push({
                method: p.method,
                amount: amount / 100,
                cashReceived:
                  p.method === "CASH"
                    ? (amount + (p.remaining === 0 ? p.change : 0)) / 100
                    : undefined,
                referenceNo: p.referenceNo,
              });
            }
          }
          await writePayments(tx, tenantId, o.id, Number(o.grandTotal), {
            ...input,
            payments: pool ? allocations : undefined,
            cashReceived:
              input.method === "CASH"
                ? Number(o.grandTotal) +
                  (i === orders.length - 1
                    ? (input.cashReceived ?? total) - total
                    : 0)
                : undefined,
          });
          await deductStock(tx, tenantId, branchId, o.id);
          await tx.order.updateMany({
            where: { tenantId, id: o.id },
            data: {
              status: "PAID",
              paidAt: new Date(),
              shiftId: shift.id,
              staffId: staff.id,
            },
          });
        }
        for (const id of [
          ...new Set(orders.map((o) => o.tableId).filter(Boolean)),
        ]) {
          if (
            !(await tx.order.count({
              where: { tenantId, tableId: id!, status: "OPEN" },
            }))
          )
            await tx.diningTable.updateMany({
              where: { tenantId, id: id! },
              data: {
                status: "AVAILABLE",
                activeQrToken: null,
                currentOrderId: null,
              },
            });
        }
        return { ok: true };
      });
    }
    if (key === "shifts/open") {
      const startingCash = number.min(0).max(1000000).parse(b.startingCash);
      return serial(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${branchId}))`;
        assert(
          !(await tx.cashierShift.findFirst({
            where: { tenantId, branchId, status: "OPEN" },
          })),
          "มีกะที่เปิดอยู่แล้ว",
          409,
        );
        const shift = await tx.cashierShift.create({
          data: { tenantId, branchId, staffId: staff.id, startingCash },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            actorName: staff.displayName,
            action: "OPEN_SHIFT",
            details: shift.id,
          },
        });
        return shift;
      });
    }
    if (key === "shifts/cash") {
      const input = z
        .object({
          amount: number
            .min(-1000000)
            .max(1000000)
            .refine((n) => n !== 0),
          reason: z.string().trim().min(3).max(300),
        })
        .parse(b);
      return serial(async (tx) => {
        const shift = await tx.cashierShift.findFirst({
          where: { tenantId, branchId, status: "OPEN" },
        });
        assert(shift, "ไม่มีกะที่เปิดอยู่", 409);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${branchId}))`;
        return tx.cashMovement.create({
          data: { tenantId, shiftId: shift.id, ...input },
        });
      });
    }
    if (key === "shifts/close") {
      const actualCash = number.nonnegative().max(10000000).parse(b.actualCash);
      return serial(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
        const shift = await tx.cashierShift.findFirst({
          where: { tenantId, branchId, status: "OPEN" },
        });
        assert(shift, "ไม่มีกะที่เปิดอยู่", 409);
        const cash = await tx.orderPayment.aggregate({
          where: {
            tenantId,
            method: "CASH",
            order: { tenantId, branchId, shiftId: shift.id, status: "PAID" },
          },
          _sum: { amount: true },
        });
        const movement = await tx.cashMovement.aggregate({
          where: { tenantId, shiftId: shift.id },
          _sum: { amount: true },
        });
        const expectedCash =
          (cents(Number(shift.startingCash)) +
            cents(Number(cash._sum.amount ?? 0)) +
            cents(Number(movement._sum.amount ?? 0))) /
          100;
        return tx.cashierShift.update({
          where: { id: shift.id, tenantId },
          data: {
            closedAt: new Date(),
            status: "CLOSED",
            expectedCash,
            actualCash,
            cashDifference: (cents(actualCash) - cents(expectedCash)) / 100,
            closingNote: z
              .string()
              .max(500)
              .parse(b.closingNote ?? ""),
          },
        });
      });
    }
    if (key === "products") {
      const input = z
        .object({
          id: z.string().optional(),
          name: z.string().min(1).max(150),
          sku: z.string().min(1).max(80),
          barcode: z.string().max(80).optional(),
          price: number.nonnegative().max(1000000),
          categoryId: z.string(),
          isAvailable: z.boolean().default(true),
          trackStockType: z
            .enum(["NONE", "DIRECT_UNIT", "RECIPE"])
            .default("DIRECT_UNIT"),
          directStockQty: number.int().nonnegative().default(0),
          stockVersion: number.int().nonnegative().optional(),
          stockReason: z
            .string()
            .trim()
            .min(3)
            .max(300)
            .default("ปรับจำนวนคงเหลือ"),
        })
        .parse(b);
      const {
        id,
        price,
        isAvailable,
        directStockQty,
        stockVersion,
        stockReason,
        ...data
      } = input;
      return serial(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
        assert(
          await tx.category.findFirst({
            where: { id: data.categoryId, tenantId },
          }),
          "ไม่พบหมวดหมู่",
          404,
        );
        let product;
        if (id) {
          assert(
            await tx.product.findFirst({ where: { id, tenantId } }),
            "ไม่พบสินค้า",
            404,
          );
          product = await tx.product.update({ where: { id, tenantId }, data });
        } else {
          const count = await tx.product.count({ where: { tenantId } });
          const { tenant: limits } = await effectiveTenantById(tenantId, tx);
          assert(
            limits.maxProducts < 0 || count < limits.maxProducts,
            "สินค้าเต็มโควตา",
            402,
          );
          product = await tx.product.create({
            data: { tenantId, ...data, price, directStockQty: 0 },
          });
        }
        const previous = await tx.branchProduct.findUniqueOrThrow({
          where: { branchId_productId: { branchId, productId: product.id } },
        });
        if (id && (directStockQty !== previous.quantity || cents(Number(price)) !== cents(Number(previous.price)) || isAvailable !== previous.isAvailable))
          assert(
            stockVersion === previous.version,
            "ราคา/สต็อกเปลี่ยนไปแล้ว กรุณาโหลดใหม่ก่อนบันทึก",
            409,
          );
        const stock = await tx.branchProduct.update({
          where: {
            branchId_productId: { branchId, productId: product.id },
            tenantId,
          },
          data: { price, quantity: directStockQty, isAvailable },
        });
        if (stock.quantity !== previous.quantity)
          await tx.productStockMovement.create({
            data: {
              tenantId,
              branchId,
              productId: product.id,
              kind: id ? "ADJUSTMENT" : "OPENING",
              quantityChange: stock.quantity - previous.quantity,
              balanceAfter: stock.quantity,
              reason: `${staff.displayName}: ${stockReason}`,
            },
          });
        return branchProductView(product, stock);
      });
    }
    if (key === "categories")
      return db.category.create({
        data: {
          tenantId,
          ...z
            .object({
              name: z.string().min(1).max(80),
              kitchenStation: z.enum(["BAR", "MAIN", "BAKERY"]).default("MAIN"),
            })
            .parse(b),
        },
      });
    if (key === "modifiers") {
      const input = z
        .object({
          productId: z.string(),
          name: z.string().min(1).max(80),
          isRequired: z.boolean(),
          maxSelect: number.int().min(1).max(10),
          options: z
            .array(
              z.object({
                name: z.string().min(1).max(80),
                priceDelta: number.nonnegative().max(10000),
              }),
            )
            .min(1)
            .max(20),
        })
        .parse(b);
      return serial(async (tx) => {
        assert(
          await tx.product.findFirst({
            where: { id: input.productId, tenantId },
          }),
          "ไม่พบสินค้า",
          404,
        );
        return tx.modifierGroup.create({
          data: {
            tenantId,
            name: input.name,
            isRequired: input.isRequired,
            minSelect: input.isRequired ? 1 : 0,
            maxSelect: input.maxSelect,
            options: { create: input.options.map((o) => ({ ...o, tenantId })) },
            products: { create: { tenantId, productId: input.productId } },
          },
        });
      });
    }
    if (key === "ingredients") {
      const input = z
        .object({
          name: z.string().min(1).max(120),
          sku: z.string().min(1).max(80),
          unit: z.string().min(1).max(20),
          costPerUnit: number.nonnegative(),
          lowStockThreshold: number.nonnegative(),
        })
        .parse(b);
      return serial(async (tx) => {
        const i = await tx.ingredient.create({ data: { tenantId, ...input } });
        for (const branch of await tx.storeBranch.findMany({
          where: { tenantId },
        }))
          await tx.branchIngredientStock.create({
            data: { tenantId, branchId: branch.id, ingredientId: i.id },
          });
        return i;
      });
    }
    if (key === "inventory/adjust") {
      const input = z
        .object({
          ingredientId: z.string(),
          quantity: number
            .min(-10000000)
            .max(10000000)
            .refine((n) => n !== 0),
          type: z.enum(["INBOUND", "ADJUST", "WASTE"]),
          note: z.string().min(3).max(300),
        })
        .parse(b);
      assert(
        input.type !== "INBOUND" || input.quantity > 0,
        "จำนวนรับเข้าต้องมากกว่า 0",
      );
      assert(
        input.type !== "WASTE" || input.quantity < 0,
        "ของเสียต้องเป็นค่าลบ",
      );
      return serial(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
        const s = await tx.branchIngredientStock.findFirst({
          where: { tenantId, branchId, ingredientId: input.ingredientId },
        });
        assert(s, "ไม่พบวัตถุดิบ", 404);
        assert(
          Number(s.currentQty) + input.quantity >= 0,
          "สต็อกไม่เพียงพอ",
          409,
        );
        const updated = await tx.branchIngredientStock.update({
          where: { id: s.id, tenantId },
          data: { currentQty: { increment: input.quantity } },
        });
        return tx.stockMovement.create({
          data: {
            tenantId,
            branchId,
            ingredientId: input.ingredientId,
            type: input.type,
            quantityChange: input.quantity,
            balanceAfter: updated.currentQty,
            note: input.note,
          },
        });
      });
    }
    if (key === "recipes") {
      feature(tenant, "enableRecipeBom");
      const input = z
        .object({
          productId: z.string(),
          items: z
            .array(
              z.object({
                ingredientId: z.string(),
                quantityUsed: number.positive().max(100000),
              }),
            )
            .max(50),
        })
        .parse(b);
      return serial(async (tx) => {
        assert(
          await tx.product.findFirst({
            where: { id: input.productId, tenantId },
          }),
          "ไม่พบสินค้า",
          404,
        );
        for (const item of input.items)
          assert(
            await tx.ingredient.findFirst({
              where: { id: item.ingredientId, tenantId },
            }),
            "ไม่พบวัตถุดิบ",
            404,
          );
        await tx.recipeBomItem.deleteMany({
          where: { tenantId, productId: input.productId },
        });
        await tx.recipeBomItem.createMany({
          data: input.items.map((i) => ({
            ...i,
            tenantId,
            productId: input.productId,
          })),
        });
        await tx.product.updateMany({
          where: { tenantId, id: input.productId },
          data: { trackStockType: "RECIPE" },
        });
        return { ok: true };
      });
    }
    if (key === "tables") {
      feature(tenant, "enableQrOrder");
      const input = z
        .object({
          name: z.string().min(1).max(40),
          zoneId: z.string(),
          seats: number.int().min(1).max(50),
        })
        .parse(b);
      assert(
        await db.diningZone.findFirst({
          where: { tenantId, branchId, id: input.zoneId },
        }),
        "ไม่พบโซน",
        404,
      );
      return db.diningTable.create({ data: { tenantId, ...input } });
    }
    if (key === "zones") {
      feature(tenant, "enableQrOrder");
      return db.diningZone.create({
        data: {
          tenantId,
          branchId,
          name: z.string().min(1).max(80).parse(b.name),
        },
      });
    }
    if (path[0] === "tables" && path.length === 3) {
      feature(tenant, "enableQrOrder");
      return serial(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
        const table = await tx.diningTable.findFirst({
          where: { tenantId, id: path[1], zone: { branchId } },
        });
        assert(table, "ไม่พบโต๊ะ", 404);
        if (path[2] === "open") {
          assert(table.status === "AVAILABLE", "โต๊ะเปิดอยู่แล้ว", 409);
          return tx.diningTable.update({
            where: { tenantId, id: table.id },
            data: { status: "OCCUPIED", activeQrToken: randomUUID() },
          });
        }
        if (path[2] === "close") {
          assert(
            !(await tx.order.count({
              where: { tenantId, tableId: table.id, status: "OPEN" },
            })),
            "มีบิลค้างชำระ",
            409,
          );
          return tx.diningTable.update({
            where: { tenantId, id: table.id },
            data: {
              status: "AVAILABLE",
              activeQrToken: null,
              currentOrderId: null,
            },
          });
        }
        assert(["move", "merge"].includes(path[2]), "ไม่พบคำสั่ง", 404);
        const target = await tx.diningTable.findFirst({
          where: {
            tenantId,
            id: z.string().parse(b.targetId),
            zone: { branchId },
          },
        });
        assert(target && target.id !== table.id, "โต๊ะปลายทางไม่ถูกต้อง");
        assert(table.status !== "AVAILABLE", "โต๊ะต้นทางยังไม่เปิด", 409);
        assert(
          path[2] !== "move" || target.status === "AVAILABLE",
          "โต๊ะปลายทางไม่ว่าง",
          409,
        );
        await tx.order.updateMany({
          where: { tenantId, tableId: table.id, status: "OPEN" },
          data: { tableId: target.id },
        });
        await tx.diningTable.update({
          where: { tenantId, id: target.id },
          data: {
            status: "OCCUPIED",
            activeQrToken: target.activeQrToken ?? randomUUID(),
          },
        });
        await tx.diningTable.update({
          where: { tenantId, id: table.id },
          data: {
            status: "AVAILABLE",
            activeQrToken: null,
            currentOrderId: null,
          },
        });
        return { ok: true };
      });
    }
    if (key === "staff") {
      const input = z
        .object({
          id: z.string().optional(),
          displayName: z.string().min(1).max(120),
          role: z.enum(["MANAGER", "CASHIER", "KITCHEN", "WAITER"]),
          pin: z.string().regex(/^\d{4,6}$/).optional(),
          isActive: z.boolean().default(true),
          branchIds: z
            .array(z.string())
            .min(1, "กรุณาเลือกอย่างน้อยหนึ่งสาขา")
            .max(100)
            .default([branchId]),
        })
        .parse(b);
      assert(
        staff.role === "OWNER" || input.role !== "MANAGER",
        "การเพิ่มผู้จัดการต้องใช้สิทธิ์เจ้าของร้าน",
        403,
      );
      const branchIds = [...new Set(input.branchIds)];
      assert(
        branchIds.every((id) =>
          ctx.branches.some((branch) => branch.id === id),
        ),
        "ไม่มีสิทธิ์กำหนดพนักงานให้สาขานี้",
        403,
      );
      return serial(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
        const data = {
          displayName: input.displayName,
          role: input.role,
          ...(input.pin ? { pinCodeHash: await hash(input.pin, 10) } : {}),
          isActive: input.isActive,
        };
        if (input.id) {
          const target = await tx.staffMember.findFirst({
            where: { id: input.id, tenantId },
            include: { branchAccess: true },
          });
          assert(
            target && target.role !== "OWNER" && target.id !== staff.id,
            "ไม่สามารถแก้ไขเจ้าของร้านหรือบัญชีตนเอง",
          );
          assert(
            staff.role === "OWNER" || target.role !== "MANAGER",
            "ไม่มีสิทธิ์แก้ไขผู้จัดการ",
            403,
          );
          await tx.staffMember.updateMany({
            where: { tenantId, id: input.id },
            data,
          });
          assert(
            staff.role === "OWNER" ||
              target.branchAccess.every((grant) =>
                ctx.branches.some((branch) => branch.id === grant.branchId),
              ),
            "การแก้พนักงานหลายสาขาต้องใช้เจ้าของร้าน",
            403,
          );
          await tx.staffBranchAccess.deleteMany({
            where: { tenantId, staffId: input.id },
          });
          await tx.staffBranchAccess.createMany({
            data: branchIds.map((branchId) => ({
              tenantId,
              branchId,
              staffId: input.id!,
            })),
          });
          return { ok: true };
        }
        const count = await tx.staffMember.count({
          where: { tenantId, isActive: true },
        });
        const { tenant: limits } = await effectiveTenantById(tenantId, tx);
        assert(
          limits.maxStaff < 0 || count < limits.maxStaff,
          "พนักงานเต็มโควตา",
          402,
        );
        assert(input.pin, "กรุณาตั้ง PIN ให้พนักงานใหม่");
        const member = await tx.staffMember.create({
          data: { tenantId, ...data, pinCodeHash: await hash(input.pin, 10) },
        });
        await tx.staffBranchAccess.createMany({
          data: branchIds.map((branchId) => ({
            tenantId,
            branchId,
            staffId: member.id,
          })),
        });
        return { ok: true };
      });
    }
    if (key === "settings") {
      const input = z
        .object({
          storeName: z.string().trim().min(2).max(100).optional(),
          name: z.string().min(1).max(100),
          address: z.string().max(400),
          phone: z.string().max(20),
          taxId: z.string().regex(/^(\d{13})?$/),
          promptPayId: z.string().regex(/^(\d{10}|\d{13})?$/),
          promptPayName: z.string().max(120),
          receiptHeader: z.string().max(200),
          receiptFooter: z.string().max(200),
          vatRate: number.min(0).max(20),
          vatInclusive: z.boolean(),
          serviceChargeRate: number.min(0).max(30),
        })
        .parse(b);
      await record("UPDATE_SETTINGS", branchId);
      const { storeName, ...branchData } = input;
      return serial(async (tx) => {
        if (storeName !== undefined)
          await tx.tenant.update({
            where: { id: tenantId },
            data: { name: storeName },
          });
        return tx.storeBranch.updateMany({
          where: { tenantId, id: branchId },
          data: branchData,
        });
      });
    }
    if (key === "branches") {
      const input = z
        .object({
          name: z.string().min(1).max(120),
          address: z.string().max(400).default(""),
        })
        .parse(b);
      return serial(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
        const count = await tx.storeBranch.count({
          where: { tenantId, isActive: true },
        });
        const { tenant: limits } = await effectiveTenantById(tenantId, tx);
        assert(
          limits.maxBranches < 0 || count < limits.maxBranches,
          "สาขาเต็มโควตา",
          402,
        );
        const branch = await tx.storeBranch.create({
          data: { tenantId, ...input },
        });
        await tx.$executeRaw`UPDATE "BranchProduct" dest SET price=src.price,"isAvailable"=src."isAvailable" FROM "BranchProduct" src WHERE dest."tenantId"=${tenantId} AND dest."branchId"=${branch.id} AND src."tenantId"=${tenantId} AND src."branchId"=${branchId} AND src."productId"=dest."productId"`;
        const ingredients = await tx.ingredient.findMany({
          where: { tenantId },
        });
        await tx.branchIngredientStock.createMany({
          data: ingredients.map((i) => ({
            tenantId,
            branchId: branch.id,
            ingredientId: i.id,
          })),
        });
        return branch;
      });
    }
    assert(false, "ไม่พบ API", 404);
  });
}
