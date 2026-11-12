import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import Stripe from "stripe";
import { db, serial } from "./db";
import { assert } from "./errors";
import { paidPlans } from "./billing";
import { withBillingLock, assertBillingLock } from "./billing-lock";
import { stripeClient, stripeReady } from "./stripe-client";
import { promptpay } from "./promptpay";
import { syncSubscription } from "./stripe-billing";
import { assertNewCheckoutAllowed } from "./release-policy";
export const checkoutSchema = z.object({
  requestKey: z.uuid(),
  storeSlug: z.string(),
  planCode: z.enum(paidPlans),
  confirmedTotal: z.number().int().positive(),
  method: z.enum(["BANK_SLIP", "STRIPE_CARD", "STRIPE_PROMPTPAY"]),
  coupon: z
    .string()
    .trim()
    .max(40)
    .transform((s) => s.toUpperCase())
    .default(""),
  companyName: z.string().trim().max(200).default(""),
  taxId: z
    .string()
    .regex(/^(\d{13})?$/)
    .default(""),
  billingAddress: z.string().trim().max(600).default(""),
});
type Checkout = z.infer<typeof checkoutSchema>;
export async function createCheckout(
  tenantId: string,
  input: Checkout,
  provider?: Stripe,
) {
  await assertNewCheckoutAllowed();
  assert(
    input.method === "BANK_SLIP"
      ? !!process.env.PLATFORM_PROMPTPAY_ID
      : provider || stripeReady(),
    "ช่องทางชำระนี้ยังไม่เปิดให้บริการ",
    503,
  );
  assert(
    !input.companyName || (input.taxId && input.billingAddress),
    "กรุณากรอกข้อมูลใบกำกับภาษีให้ครบ",
  );
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const current = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });
  if (current.stripeSubId)
    await syncSubscription(current.stripeSubId, provider ?? stripeClient());
  return withBillingLock(tenantId, async (token) => {
    const payment = await serial(async (tx) => {
      await assertBillingLock(tx, tenantId, token);
      const existing = await tx.saasPayment.findUnique({
        where: { checkoutKey: input.requestKey },
      });
      if (existing) {
        assert(
          existing.tenantId === tenantId && existing.checkoutHash === hash,
          "คำขอเดิมมีข้อมูลต่างกัน กรุณาตรวจสอบรายการเดิม",
          409,
        );
        assert(
          existing.status === "PENDING",
          "รายการนี้สิ้นสุดแล้ว กรุณาตรวจสอบประวัติ",
          409,
        );
        // Stripe retains idempotency keys for at least 24 hours. Never recreate an ambiguous older request.
        assert(
          existing.providerRef ||
            Date.now() - +existing.createdAt < 23 * 3600000,
          "รายการนี้ต้องตรวจสอบกับผู้ให้บริการก่อนเริ่มรายการใหม่",
          409,
        );
        return existing;
      }
      const t = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        include: { owner: true },
      });
      assert(!t.isLifetime, "ร้านนี้ใช้แพ็กเกจ Lifetime อยู่แล้ว");
      assert(
        !t.stripeSubId ||
          ["canceled", "incomplete_expired"].includes(
            t.stripeSubscriptionStatus ?? "",
          ),
        "มีการต่ออายุผ่านบัตรอยู่แล้ว กรุณาจัดการสมาชิกเดิมก่อน",
        409,
      );
      // Do not overlap plans or discard prepaid time. Same-plan one-off renewals stack calendar terms.
      assert(
        !t.currentPeriodEndsAt ||
          +t.currentPeriodEndsAt <= Date.now() ||
          (input.planCode === t.planCode && input.method !== "STRIPE_CARD"),
        "ยังมีระยะเวลาแพ็กเกจเดิม กรุณารอหมดรอบก่อนเปลี่ยนแพ็กเกจหรือเริ่มต่ออายุผ่านบัตร",
        409,
      );
      const pending = await tx.saasPayment.findFirst({
        where: { tenantId, status: "PENDING" },
      });
      assert(
        !pending,
        "มีรายการรอชำระอยู่ กรุณาชำระหรือยกเลิกรายการเดิมก่อน",
        409,
      );
      const plan = await tx.plan.findUniqueOrThrow({
        where: { code: input.planCode },
      });
      let amount = Number(plan.price);
      if (input.coupon) {
        const coupon = await tx.coupon.findUnique({
          where: { code: input.coupon },
        });
        assert(
          coupon?.isActive &&
            coupon.percent > 0 &&
            coupon.percent < 100 &&
            (!coupon.expiresAt || +coupon.expiresAt > Date.now()),
          "คูปองไม่ถูกต้องหรือหมดอายุ",
        );
        amount = Math.round(amount * (100 - coupon.percent)) / 100;
      }
      assert(amount > 0, "ยอดชำระต้องมากกว่า 0");
      const vatAmount = Math.round(amount * 7) / 100;
      const totalAmount = Math.round((amount + vatAmount) * 100) / 100;
      assert(
        input.confirmedTotal === Math.round(totalAmount * 100),
        "ราคาหรือคูปองเปลี่ยนแล้ว กรุณาตรวจสอบยอดใหม่ก่อนชำระ",
        409,
      );
      return tx.saasPayment.create({
        data: {
          tenantId,
          checkoutKey: input.requestKey,
          checkoutHash: hash,
          invoiceNumber: `INV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
          planCode: plan.code,
          amount,
          vatAmount,
          totalAmount,
          couponCode: input.coupon || null,
          paymentMethod: input.method,
          status: "PENDING",
          receipt: {
            planName: plan.name,
            customerName: input.companyName || t.name,
            taxId: input.taxId || null,
            billingAddress: input.billingAddress || null,
            currency: "THB",
            vatRate: 7,
            recurring:
              input.method === "STRIPE_CARD" && plan.code !== "LIFETIME_BUYOUT",
            checkoutInput: input,
            customerEmail: t.owner.email,
            appUrl: process.env.NEXT_PUBLIC_APP_URL!,
          },
        },
      });
    });
    if (input.method === "BANK_SLIP")
      return {
        payment,
        payload: promptpay(
          process.env.PLATFORM_PROMPTPAY_ID,
          Number(payment.totalAmount),
        ),
      };
    const stripe = provider ?? stripeClient();
    const recurring =
      input.method === "STRIPE_CARD" && payment.planCode !== "LIFETIME_BUYOUT";
    const metadata = {
      tenantId,
      paymentId: payment.id,
      planCode: payment.planCode,
    };
    const snapshot = payment.receipt as {
      appUrl: string;
      customerEmail: string;
      planName: string;
    };
    const base = snapshot.appUrl;
    // A persisted payment freezes both the provider request and its idempotency key.
    const session = payment.providerRef
      ? await stripe.checkout.sessions.retrieve(payment.providerRef)
      : await stripe.checkout.sessions.create(
          {
            mode: recurring ? "subscription" : "payment",
            payment_method_types:
              input.method === "STRIPE_PROMPTPAY" ? ["promptpay"] : ["card"],
            client_reference_id: tenantId,
            metadata,
            customer_email: snapshot.customerEmail,
            subscription_data: recurring ? { metadata } : undefined,
            payment_intent_data: recurring ? undefined : { metadata },
            line_items: [
              {
                price_data: {
                  currency: "thb",
                  unit_amount: Math.round(Number(payment.totalAmount) * 100),
                  product_data: {
                    name: String(
                      (payment.receipt as { planName?: string })?.planName ??
                        payment.planCode,
                    ),
                  },
                  ...(recurring
                    ? {
                        recurring: {
                          interval: payment.planCode.includes("YEARLY")
                            ? "year"
                            : "month",
                        },
                      }
                    : {}),
                },
                quantity: 1,
              },
            ],
            success_url: `${base}/${input.storeSlug}/billing?checkout=${payment.id}`,
            cancel_url: `${base}/${input.storeSlug}/billing?checkout=${payment.id}&canceled=1`,
          },
          { idempotencyKey: `checkout:${payment.id}` },
        );
    await serial(async (tx) => {
      await assertBillingLock(tx, tenantId, token);
      await tx.saasPayment.update({
        where: { id: payment.id },
        data: {
          providerRef: session.id,
          checkoutUrl: session.url,
          checkoutExpiresAt: new Date(session.expires_at * 1000),
        },
      });
    });
    assert(
      session.status === "open" && session.url,
      "รายการนี้สิ้นสุดแล้ว กรุณากดตรวจสอบสถานะก่อน",
      409,
    );
    return { payment, url: session.url };
  });
}
