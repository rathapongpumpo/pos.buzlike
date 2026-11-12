import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createHash } from "node:crypto";
import { assert } from "./errors";
import { totals, cents } from "./money";
import { deductStock } from "./stock-deduction";
import { assertStaffBranch } from "./branch-access";
import { effectiveTenantById } from "./entitlements";
export const orderInput = z.object({
  clientOrderId: z.string().uuid(),
  terminalId: z.string().uuid().optional(),
  expectedGrandTotal: z.number().nonnegative().max(10000000).optional(),
  branchId: z.string().optional(),
  operatorId: z.string().optional(),
  shiftId: z.string().optional(),
  tableId: z.string().nullable().optional(),
  orderType: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]).default("TAKEAWAY"),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().min(1).max(999),
        optionIds: z.array(z.string()).max(20).default([]),
        note: z.string().max(300).default(""),
      }),
    )
    .min(1)
    .max(100),
  discount: z.number().min(0).max(1000000).default(0),
  discountReason: z.string().max(200).default(""),
  customerNote: z.string().max(500).default(""),
  method: z
    .enum(["CASH", "PROMPTPAY_QR", "CREDIT_CARD", "TRANSFER"])
    .optional(),
  cashReceived: z.number().min(0).max(10000000).optional(),
  referenceNo: z.string().max(100).optional(),
  payments: z
    .array(
      z.object({
        method: z.enum(["CASH", "PROMPTPAY_QR", "CREDIT_CARD", "TRANSFER"]),
        amount: z.number().positive(),
        cashReceived: z.number().nonnegative().optional(),
        referenceNo: z.string().max(100).optional(),
      }),
    )
    .max(20)
    .optional(),
});
export type OrderInput = z.infer<typeof orderInput>;
export const orderInclude = {
  items: { include: { modifiers: true } },
  payments: true,
  table: true,
  staff: { select: { displayName: true } },
} satisfies Prisma.OrderInclude;
export async function createOrder(
  tx: Prisma.TransactionClient,
  tenantId: string,
  branchId: string,
  staffId: string | null,
  input: OrderInput,
  publicQr = false,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
  assert(
    !input.branchId || input.branchId === branchId,
    "สาขาของบิลไม่ตรงกับสาขาที่กำลังใช้งาน",
    403,
  );
  if (staffId) await assertStaffBranch(tx, tenantId, branchId, staffId);
  assert(
    !input.operatorId || input.operatorId === staffId,
    "ผู้ขายเปลี่ยนไป กรุณาสลับกลับไปพนักงานเดิมก่อนส่งบิล",
    409,
  );
  const legacyDigest = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  const { operatorId: _operatorId, ...legacyInput } = input;
  const legacyStaffDigest = createHash("sha256")
    .update(JSON.stringify(legacyInput))
    .digest("hex");
  const digest = createHash("sha256")
    .update(JSON.stringify({ ...input, branchId }))
    .digest("hex");
  const existing = await tx.order.findFirst({
    where: { tenantId, clientOrderId: input.clientOrderId },
    include: orderInclude,
  });
  if (existing) {
    assert(existing.branchId === branchId, "ไม่พบออเดอร์ในสาขานี้", 404);
    assert(
      existing.requestHash === digest ||
        existing.requestHash === legacyDigest ||
        (existing.staffId === staffId &&
          existing.requestHash === legacyStaffDigest),
      "รหัสออเดอร์ซ้ำกับรายการที่ต่างกัน",
      409,
    );
    return existing;
  }
  if (!publicQr && input.terminalId) {
    const { tenant } = await effectiveTenantById(tenantId, tx);
    const terminal = await tx.posTerminal.findUnique({
      where: { tenantId_clientId: { tenantId, clientId: input.terminalId } },
    });
    if (!terminal) {
      const count = await tx.posTerminal.count({ where: { tenantId } });
      assert(
        tenant.maxTerminals < 0 || count < tenant.maxTerminals,
        "เครื่องขายครบโควตาแล้ว กรุณาอัปเกรด",
        402,
      );
      await tx.posTerminal.create({
        data: { tenantId, branchId, clientId: input.terminalId },
      });
    } else
      await tx.posTerminal.update({
        where: { id: terminal.id, tenantId },
        data: { lastSeenAt: new Date(), branchId },
      });
  }
  const access = await effectiveTenantById(tenantId, tx);
  assert(
    !["READ_ONLY", "SUSPENDED"].includes(access.entitlement.state),
    "สิทธิ์ใช้งานหมดอายุหรือถูกระงับ บิลยังเก็บไว้ให้ตรวจสอบ",
    402,
  );
  if (publicQr || input.tableId)
    assert(
      access.tenant.enableQrOrder,
      "แพ็กเกจนี้ไม่รองรับการสั่งที่โต๊ะ",
      402,
    );
  const branch = await tx.storeBranch.findFirstOrThrow({
    where: { id: branchId, tenantId, isActive: true },
  });
  const shift = publicQr
    ? null
    : await tx.cashierShift.findFirst({
        where: { tenantId, branchId, status: "OPEN" },
      });
  assert(publicQr || shift, "กรุณาเปิดกะก่อนขาย", 409);
  assert(
    publicQr || !input.shiftId || input.shiftId === shift?.id,
    "กะของบิลเปลี่ยนไป กรุณาตรวจสอบบิลก่อนส่ง",
    409,
  );
  const isPaid = !publicQr && (!!input.method || !!input.payments?.length);
  const table = input.tableId
    ? await tx.diningTable.findFirst({
        where: { id: input.tableId, tenantId, zone: { branchId } },
      })
    : null;
  assert(!input.tableId || table, "ไม่พบโต๊ะ", 404);
  if (table) assert(table.status !== "AVAILABLE", "กรุณาเปิดโต๊ะก่อน", 409);
  let subtotal = 0;
  const items = [];
  for (const row of input.items) {
    const p = await tx.product.findFirst({
      where: { tenantId, id: row.productId },
      include: {
        branchStocks: { where: { tenantId, branchId } },
        category: true,
        modifierGroups: {
          where: { tenantId },
          include: {
            modifierGroup: { include: { options: { where: { tenantId } } } },
          },
        },
      },
    });
    const branchProduct = p?.branchStocks[0];
    assert(
      p && branchProduct?.isAvailable,
      "ไม่พบสินค้าหรือสินค้าปิดขายในสาขานี้",
      404,
    );
    const choices = [...new Set(row.optionIds)];
    const allowed = p.modifierGroups.flatMap((g) => g.modifierGroup.options);
    assert(
      choices.every((id) => allowed.some((o) => o.id === id)),
      "ตัวเลือกสินค้าไม่ถูกต้อง",
    );
    for (const join of p.modifierGroups) {
      const g = join.modifierGroup;
      const count = g.options.filter((o) => choices.includes(o.id)).length;
      assert(
        count >= g.minSelect &&
          count <= g.maxSelect &&
          (!g.isRequired || count > 0),
        `กรุณาเลือก ${g.name} ให้ครบ`,
      );
    }
    const selected = allowed.filter((o) => choices.includes(o.id));
    const extra = selected.reduce((s, o) => s + Number(o.priceDelta), 0);
    const lineTotal =
      ((cents(Number(branchProduct.price)) + cents(extra)) * row.quantity) /
      100;
    subtotal += lineTotal;
    items.push({
      tenantId,
      productId: p.id,
      productNameSnapshot: p.name,
      unitPriceSnapshot: branchProduct.price,
      quantity: row.quantity,
      modifiersTotal: extra,
      lineTotal,
      kitchenStation: p.category.kitchenStation,
      note: row.note,
      modifiers: {
        create: selected.map((o) => ({
          tenantId,
          modifierName: p.modifierGroups.find(
            (g) => g.modifierGroupId === o.modifierGroupId,
          )!.modifierGroup.name,
          optionName: o.name,
          priceDelta: o.priceDelta,
        })),
      },
    });
  }
  assert(input.discount <= subtotal, "ส่วนลดมากกว่ายอดสินค้า");
  assert(publicQr ? input.discount === 0 : true, "ไม่สามารถลดราคาจาก QR ได้");
  const calculated = totals(
    subtotal,
    input.discount,
    Number(branch.vatRate),
    branch.vatInclusive,
    Number(branch.serviceChargeRate),
  );
  if (input.expectedGrandTotal !== undefined)
    assert(
      cents(input.expectedGrandTotal) === cents(calculated.grandTotal),
      "ราคาหรือภาษีเปลี่ยนจากข้อมูลในเครื่อง กรุณาตรวจสอบบิลก่อนซิงก์",
      409,
    );
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
  const count = await tx.order.count({
    where: { tenantId, orderNumber: { startsWith: `ORD-${day}-` } },
  });
  const queueNumber = count + 1;
  const order = await tx.order.create({
    data: {
      tenantId,
      branchId,
      staffId,
      shiftId: shift?.id,
      tableId: table?.id,
      clientOrderId: input.clientOrderId,
      requestHash: digest,
      orderNumber: `ORD-${day}-${String(queueNumber).padStart(4, "0")}`,
      queueNumber,
      orderType: input.orderType,
      status: isPaid ? "PAID" : "OPEN",
      paidAt: isPaid ? new Date() : null,
      ...calculated,
      discountReason: input.discountReason,
      customerNote: input.customerNote,
      items: { create: items },
    },
  });
  if (isPaid) {
    await writePayments(tx, tenantId, order.id, calculated.grandTotal, input);
    await deductStock(tx, tenantId, branchId, order.id);
  }
  if (table) {
    await tx.diningTable.updateMany({
      where: { tenantId, id: table.id },
      data: { currentOrderId: order.id },
    });
    if (isPaid) {
      const remaining = await tx.order.count({
        where: { tenantId, tableId: table.id, status: "OPEN" },
      });
      if (!remaining)
        await tx.diningTable.updateMany({
          where: { tenantId, id: table.id },
          data: {
            status: "AVAILABLE",
            activeQrToken: null,
            currentOrderId: null,
          },
        });
    }
  }
  return tx.order.findFirstOrThrow({
    where: { id: order.id, tenantId },
    include: orderInclude,
  });
}
export async function writePayments(
  tx: Prisma.TransactionClient,
  tenantId: string,
  orderId: string,
  total: number,
  input: Pick<
    OrderInput,
    "method" | "cashReceived" | "referenceNo" | "payments"
  >,
) {
  const payments = input.payments?.length
    ? input.payments
    : [
        {
          method: input.method ?? "CASH",
          amount: total,
          cashReceived: input.cashReceived,
          referenceNo: input.referenceNo,
        },
      ];
  assert(
    cents(payments.reduce((s, p) => s + p.amount, 0)) === cents(total),
    "ยอดแบ่งชำระไม่ตรงกับยอดสุทธิ",
  );
  for (const p of payments) {
    assert(
      p.method !== "CASH" ||
        cents(p.cashReceived ?? p.amount) >= cents(p.amount),
      "รับเงินสดไม่ครบ",
    );
    if (p.method !== "CASH")
      assert(
        p.referenceNo?.trim(),
        "กรุณาระบุเลขอ้างอิงและตรวจสอบยอดรับเงินจริง",
      );
    await tx.orderPayment.create({
      data: {
        tenantId,
        orderId,
        method: p.method,
        amount: p.amount,
        cashReceived: p.method === "CASH" ? (p.cashReceived ?? p.amount) : null,
        changeGiven:
          p.method === "CASH"
            ? (cents(p.cashReceived ?? p.amount) - cents(p.amount)) / 100
            : null,
        referenceNo: p.referenceNo,
      },
    });
  }
}
