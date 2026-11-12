import { Prisma, PlanCode } from "@prisma/client";
import { assert } from "./errors";
export { flushEmailOutbox } from "./email-outbox";
export const paidPlans = [
  "STARTER_MONTHLY",
  "STARTER_YEARLY",
  "PRO_MONTHLY",
  "PRO_YEARLY",
  "LIFETIME_BUYOUT",
] as const;
export function isPaidPlan(
  value: unknown,
): value is (typeof paidPlans)[number] {
  return (
    typeof value === "string" &&
    paidPlans.includes(value as (typeof paidPlans)[number])
  );
}
export function calendarPeriod(start: Date, code: PlanCode) {
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  if (code.includes("YEARLY")) end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  const last = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  return end;
}
export async function activatePayment(
  tx: Prisma.TransactionClient,
  paymentId: string,
  tenantId: string,
  periodEnd?: Date,
  periodStart?: Date,
) {
  const payment = await tx.saasPayment.findFirst({
    where: { id: paymentId, tenantId },
  });
  assert(payment, "ไม่พบใบแจ้งหนี้", 404);
  if (["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status))
    return payment;
  assert(payment.status === "PENDING", "ใบแจ้งหนี้นี้ไม่สามารถอนุมัติได้", 409);
  const plan = await tx.plan.findUniqueOrThrow({
    where: { code: payment.planCode },
  });
  const t = await tx.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    include: { owner: true },
  });
  const lifetime = plan.code === "LIFETIME_BUYOUT";
  const start =
    periodStart ??
    new Date(
      t.planCode === plan.code &&
        t.currentPeriodEndsAt &&
        +t.currentPeriodEndsAt > Date.now()
        ? +t.currentPeriodEndsAt
        : Date.now(),
    );
  const end = lifetime ? null : (periodEnd ?? calendarPeriod(start, plan.code));
  // A late invoice gets a receipt, but cannot overwrite a newer paid term or Lifetime.
  if (
    !t.isLifetime &&
    (lifetime ||
      !t.currentPeriodEndsAt ||
      !end ||
      +end >= +t.currentPeriodEndsAt)
  ) {
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        planCode: plan.code,
        subscriptionStatus:
          t.subscriptionStatus === "SUSPENDED"
            ? "SUSPENDED"
            : lifetime
              ? "LIFETIME_ACTIVE"
              : "ACTIVE",
        isLifetime: lifetime,
        currentPeriodEndsAt: end,
        maxBranches: plan.maxBranches,
        maxTerminals: plan.maxTerminals,
        maxProducts: plan.maxProducts,
        maxStaff: plan.maxStaff,
        enableKds: plan.enableKds,
        enableQrOrder: plan.enableQrOrder,
        enableRecipeBom: plan.enableRecipeBom,
        enableExport: plan.enableExport,
      },
    });
  }
  const receipt = payment.receipt ?? {
    planName: plan.name,
    customerName: t.companyName || t.name,
    taxId: t.taxId,
    billingAddress: t.billingAddress,
    currency: "THB",
    vatRate: 7,
  };
  const result = await tx.saasPayment.update({
    where: { id: payment.id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      periodStart: start,
      periodEnd: end,
      receipt: receipt as Prisma.InputJsonValue,
    },
  });
  await tx.emailOutbox.upsert({
    where: { paymentId },
    update: {},
    create: {
      tenantId,
      paymentId,
      to: t.owner.email,
      subject: `BUZLIKE ใบเสร็จ ${payment.invoiceNumber}`,
      text: `ขอบคุณสำหรับการชำระ ${plan.name}\nเลขที่ ${payment.invoiceNumber}\nยอดรวม ${payment.totalAmount} บาท\nดูใบเสร็จ: ${process.env.NEXT_PUBLIC_APP_URL}/${t.slug}/billing`,
    },
  });
  await tx.user.updateMany({
    where: { id: t.ownerId, selectedPlan: plan.code },
    data: { selectedPlan: null },
  });
  return result;
}
// Refunding an old term must not remove a later, independently paid term.
export async function recordRefund(
  tx: Prisma.TransactionClient,
  paymentId: string,
  cents: number,
) {
  const p = await tx.saasPayment.findUniqueOrThrow({
    where: { id: paymentId },
  });
  assert(
    Number.isSafeInteger(cents) &&
      cents >= 0 &&
      cents <= Math.round(Number(p.totalAmount) * 100),
    "ยอดคืนเงินไม่ถูกต้อง",
  );
  const amount = cents / 100;
  if (amount <= Number(p.refundedAmount)) return;
  const full = cents === Math.round(Number(p.totalAmount) * 100);
  await tx.saasPayment.update({
    where: { id: p.id },
    data: {
      refundedAmount: amount,
      status: full ? "REFUNDED" : "PARTIALLY_REFUNDED",
    },
  });
  if (!full) return;
  const t = await tx.tenant.findUniqueOrThrow({ where: { id: p.tenantId } });
  const other = await tx.saasPayment.findFirst({
    where: {
      tenantId: p.tenantId,
      id: { not: p.id },
      status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
      OR: [{ periodEnd: { gt: new Date() } }, { planCode: "LIFETIME_BUYOUT" }],
    },
    orderBy: { periodEnd: "desc" },
  });
  if (other) {
    const plan = await tx.plan.findUniqueOrThrow({
      where: { code: other.planCode },
    });
    await tx.tenant.update({
      where: { id: t.id },
      data: {
        planCode: plan.code,
        isLifetime: plan.code === "LIFETIME_BUYOUT",
        currentPeriodEndsAt: other.periodEnd,
        subscriptionStatus:
          t.subscriptionStatus === "SUSPENDED"
            ? "SUSPENDED"
            : plan.code === "LIFETIME_BUYOUT"
              ? "LIFETIME_ACTIVE"
              : "ACTIVE",
        maxBranches: plan.maxBranches,
        maxTerminals: plan.maxTerminals,
        maxProducts: plan.maxProducts,
        maxStaff: plan.maxStaff,
        enableKds: plan.enableKds,
        enableQrOrder: plan.enableQrOrder,
        enableRecipeBom: plan.enableRecipeBom,
        enableExport: plan.enableExport,
      },
    });
  } else {
    await tx.tenant.update({
      where: { id: t.id },
      data: {
        isLifetime: false,
        subscriptionStatus:
          t.subscriptionStatus === "SUSPENDED" ? "SUSPENDED" : "READ_ONLY",
        currentPeriodEndsAt: new Date(),
      },
    });
  }
}
