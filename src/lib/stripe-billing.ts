import Stripe from "stripe";
import { Prisma, SaasPayment } from "@prisma/client";
import { db, serial } from "./db";
import { assert } from "./errors";
import { activatePayment, recordRefund } from "./billing";
import { withBillingLock, assertBillingLock } from "./billing-lock";
import { stripeClient, stripeId } from "./stripe-client";

async function initialPayment(sub: Stripe.Subscription) {
  if (!sub.metadata.paymentId || !sub.metadata.tenantId) {
    const t = await db.tenant.findUnique({ where: { stripeSubId: sub.id } });
    assert(!t, "สมาชิกเดิมไม่มีข้อมูลเชื่อมโยง ต้องตรวจสอบก่อนปรับสิทธิ์", 409);
    return null; // An unrelated subscription in the same Stripe account.
  }
  const p = await db.saasPayment.findFirst({
    where: { id: sub.metadata.paymentId, tenantId: sub.metadata.tenantId },
  });
  assert(
    p &&
      p.paymentMethod === "STRIPE_CARD" &&
      p.planCode === sub.metadata.planCode,
    "ไม่พบรายการต้นทางของสมาชิก",
    409,
  );
  assert(
    !p.stripeSubscriptionId || p.stripeSubscriptionId === sub.id,
    "รายการต้นทางถูกใช้กับสมาชิกอื่นแล้ว",
    409,
  );
  return p;
}
function invoiceSubscription(invoice: Stripe.Invoice) {
  return stripeId(invoice.parent?.subscription_details?.subscription);
}
async function invoiceIntent(stripe: Stripe, invoice: Stripe.Invoice) {
  const entries =
    invoice.payments?.data ??
    (
      await stripe.invoicePayments.list({
        invoice: invoice.id,
        status: "paid",
        limit: 10,
      })
    ).data;
  const paid = entries.filter((p) => p.status === "paid");
  assert(
    paid.length === 1 && paid[0].payment.type === "payment_intent",
    "รูปแบบรับชำระไม่ตรงกับสมาชิก",
    409,
  );
  const id = stripeId(paid[0].payment.payment_intent);
  assert(id, "ไม่พบรายการรับชำระ", 409);
  return stripe.paymentIntents.retrieve(id, { expand: ["latest_charge"] });
}
function refundedCents(intent: Stripe.PaymentIntent, expected: number) {
  const charge = intent.latest_charge;
  assert(
    charge &&
      typeof charge !== "string" &&
      charge.paid &&
      charge.currency === "thb" &&
      charge.amount === expected,
    "รายการรับเงินไม่ตรงกับใบแจ้งหนี้",
    409,
  );
  return charge.amount_refunded;
}
async function applyInvoice(
  tx: Prisma.TransactionClient,
  invoice: Stripe.Invoice,
  first: SaasPayment,
  intent: Stripe.PaymentIntent,
) {
  const expected = Math.round(Number(first.totalAmount) * 100);
  assert(
    invoice.status === "paid" &&
      invoice.currency === "thb" &&
      invoice.total === expected &&
      invoice.amount_paid === expected,
    "ยอดต่ออายุไม่ตรงกับแพ็กเกจ กรุณาตรวจสอบกับผู้ให้บริการ",
    409,
  );
  assert(
    invoiceSubscription(invoice) &&
      invoiceSubscription(invoice) === first.stripeSubscriptionId,
    "สมาชิกในใบแจ้งหนี้ไม่ตรงกัน",
    409,
  );
  assert(
    invoice.lines.data.length === 1 && !invoice.lines.has_more,
    "รายการปรับยอดยังไม่รองรับ กรุณาตรวจสอบกับผู้ให้บริการ",
    409,
  );
  const period = invoice.lines.data[0].period;
  assert(
    period &&
      period.end > period.start &&
      invoice.lines.data[0].amount === expected,
    "รอบชำระไม่ถูกต้อง",
    409,
  );
  let p = await tx.saasPayment.findUnique({
    where: { stripeInvoiceId: invoice.id },
  });
  if (!p && invoice.billing_reason === "subscription_create") {
    p = await tx.saasPayment.findUniqueOrThrow({ where: { id: first.id } });
    assert(
      !p.stripeInvoiceId || p.stripeInvoiceId === invoice.id,
      "ใบแจ้งหนี้ต้นทางซ้ำ",
      409,
    );
    p = await tx.saasPayment.update({
      where: { id: p.id },
      data: {
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: intent.id,
        stripeSubscriptionId: first.stripeSubscriptionId,
      },
    });
  }
  if (!p)
    p = await tx.saasPayment.create({
      data: {
        tenantId: first.tenantId,
        invoiceNumber: `INV-${invoice.id}`,
        providerRef: invoice.id,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: intent.id,
        stripeSubscriptionId: first.stripeSubscriptionId,
        planCode: first.planCode,
        amount: first.amount,
        vatAmount: first.vatAmount,
        totalAmount: first.totalAmount,
        couponCode: first.couponCode,
        receipt: first.receipt as Prisma.InputJsonValue,
        paymentMethod: "STRIPE_CARD",
        status: "PENDING",
      },
    });
  assert(
    p.tenantId === first.tenantId &&
      (!p.stripePaymentIntentId || p.stripePaymentIntentId === intent.id),
    "ใบแจ้งหนี้ไม่ตรงร้าน",
    409,
  );
  await activatePayment(
    tx,
    p.id,
    p.tenantId,
    new Date(period.end * 1000),
    new Date(period.start * 1000),
  );
  await recordRefund(tx, p.id, refundedCents(intent, expected));
  await tx.saasPayment.update({
    where: { id: p.id },
    data: { providerCheckedAt: new Date() },
  });
}

// Every event reads the current provider state under a per-tenant lease. Delivery order is irrelevant.
export async function syncSubscription(
  subscriptionId: string,
  stripe = stripeClient(),
  extraInvoiceId?: string,
) {
  const preview = await stripe.subscriptions.retrieve(subscriptionId);
  const initial = await initialPayment(preview);
  if (!initial) return;
  return withBillingLock(initial.tenantId, async (token) => {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const first = await initialPayment(sub);
    assert(first && first.id === initial.id, "ข้อมูลสมาชิกเปลี่ยนไป", 409);
    const customer = stripeId(sub.customer);
    assert(customer, "ไม่พบลูกค้าในระบบชำระ", 409);
    const invoices = await stripe.invoices.list({
      subscription: sub.id,
      status: "paid",
      limit: 100,
      expand: ["data.payments"],
    });
    const paid = [...invoices.data];
    if (extraInvoiceId && !paid.some((i) => i.id === extraInvoiceId)) {
      const i = await stripe.invoices.retrieve(extraInvoiceId, {
        expand: ["payments"],
      });
      if (i.status === "paid") paid.push(i);
    }
    paid.sort(
      (a, b) =>
        (a.lines.data[0]?.period.end ?? 0) - (b.lines.data[0]?.period.end ?? 0),
    );
    const snapshots: {
      invoice: Stripe.Invoice;
      intent: Stripe.PaymentIntent;
    }[] = [];
    for (const invoice of paid) {
      const known = await db.saasPayment.findUnique({
        where: { stripeInvoiceId: invoice.id },
      });
      // Audit the current paid term on each reconciliation, including refunds missed by webhooks.
      if (
        !known ||
        known.status === "PENDING" ||
        (known.status !== "REFUNDED" &&
          known.periodEnd &&
          +known.periodEnd > Date.now())
      )
        snapshots.push({
          invoice,
          intent: await invoiceIntent(stripe, invoice),
        });
    }
    await serial(async (tx) => {
      await assertBillingLock(tx, first.tenantId, token);
      const t = await tx.tenant.findUniqueOrThrow({
        where: { id: first.tenantId },
      });
      const mapped =
        !t.stripeSubId ||
        t.stripeSubId === sub.id ||
        (["canceled", "incomplete_expired"].includes(
          t.stripeSubscriptionStatus ?? "",
        ) &&
          first.status === "PENDING");
      const linked = await tx.saasPayment.update({
        where: { id: first.id },
        data: { stripeSubscriptionId: sub.id },
      });
      for (const { invoice, intent } of snapshots)
        await applyInvoice(tx, invoice, linked, intent);
      if (mapped) {
        assert(
          !t.stripeCustomerId ||
            t.stripeSubId !== sub.id ||
            t.stripeCustomerId === customer,
          "ข้อมูลลูกค้าไม่ตรงกัน",
          409,
        );
        const current = await tx.tenant.findUniqueOrThrow({
          where: { id: t.id },
        });
        const protectedState = [
          "SUSPENDED",
          "READ_ONLY",
          "LIFETIME_ACTIVE",
        ].includes(current.subscriptionStatus);
        const failed = ["past_due", "unpaid", "paused", "incomplete"].includes(
          sub.status,
        );
        const ended = ["canceled", "incomplete_expired"].includes(sub.status);
        if (ended && linked.status === "PENDING" && !snapshots.length)
          await tx.saasPayment.update({
            where: { id: linked.id },
            data: { status: "FAILED" },
          });
        const expired =
          !current.currentPeriodEndsAt ||
          +current.currentPeriodEndsAt <= Date.now();
        await tx.tenant.update({
          where: { id: t.id },
          data: {
            stripeSubId: sub.id,
            stripeCustomerId: customer,
            stripeSubscriptionStatus: sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end || ended,
            billingSyncedAt: new Date(),
            // Cancellation preserves time already paid; only failed collections receive a grace period.
            ...(!protectedState && current.currentPeriodEndsAt
              ? {
                  subscriptionStatus:
                    ended && expired
                      ? "READ_ONLY"
                      : failed
                        ? "PAST_DUE"
                        : "ACTIVE",
                }
              : {}),
          },
        });
      }
    });
  });
}

export async function syncCheckout(
  paymentId: string,
  tenantId: string,
  stripe = stripeClient(),
) {
  const preview = await db.saasPayment.findFirstOrThrow({
    where: { id: paymentId, tenantId },
  });
  assert(
    preview.providerRef?.startsWith("cs_"),
    "รายการยังไม่พร้อมตรวจสอบ กรุณาลองดำเนินการชำระเดิมอีกครั้ง",
    409,
  );
  const result = await withBillingLock(tenantId, async (token) => {
    const s = await stripe.checkout.sessions.retrieve(preview.providerRef!, {
      expand: ["payment_intent.latest_charge"],
    });
    assert(
      s.metadata?.paymentId === paymentId &&
        s.metadata.tenantId === tenantId &&
        s.metadata.planCode === preview.planCode &&
        s.currency === "thb",
      "ข้อมูลชำระไม่ตรงร้าน",
      409,
    );
    assert(
      s.amount_total === Math.round(Number(preview.totalAmount) * 100),
      "ยอดชำระไม่ตรงใบแจ้งหนี้",
      409,
    );
    const subId = stripeId(s.subscription);
    if (subId) return { subscriptionId: subId };
    const intent = s.payment_intent;
    await serial(async (tx) => {
      await assertBillingLock(tx, tenantId, token);
      const p = await tx.saasPayment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      if (s.payment_status === "paid") {
        assert(
          intent && typeof intent !== "string" && intent.status === "succeeded",
          "รอยืนยันการรับเงิน",
          409,
        );
        await tx.saasPayment.update({
          where: { id: p.id },
          data: { stripePaymentIntentId: intent.id },
        });
        await activatePayment(tx, p.id, tenantId);
        await recordRefund(
          tx,
          p.id,
          refundedCents(intent, Math.round(Number(p.totalAmount) * 100)),
        );
      } else if (p.status === "PENDING" && s.status === "expired") {
        await tx.saasPayment.update({
          where: { id: p.id },
          data: { status: "EXPIRED" },
        });
      } else if (
        p.status === "PENDING" &&
        intent &&
        typeof intent !== "string" &&
        intent.status === "canceled"
      ) {
        await tx.saasPayment.update({
          where: { id: p.id },
          data: { status: "FAILED" },
        });
      } else if (
        p.status === "PENDING" &&
        s.status === "complete" &&
        intent &&
        typeof intent !== "string" &&
        intent.status === "requires_payment_method"
      ) {
        await tx.saasPayment.update({
          where: { id: p.id },
          data: { status: "FAILED" },
        });
      }
      await tx.saasPayment.update({
        where: { id: p.id },
        data: { providerCheckedAt: new Date() },
      });
    });
    return { subscriptionId: undefined };
  });
  if (result.subscriptionId)
    await syncSubscription(result.subscriptionId, stripe);
  return db.saasPayment.findUniqueOrThrow({ where: { id: paymentId } });
}

// Recover a lost Checkout response even if the browser never retries and no webhook arrives.
export async function recoverCheckout(
  paymentId: string,
  tenantId: string,
  stripe = stripeClient(),
) {
  await withBillingLock(tenantId, async (token) => {
    const p = await db.saasPayment.findFirstOrThrow({
      where: { id: paymentId, tenantId },
    });
    if (p.providerRef || p.status !== "PENDING") return;
    const matches: Stripe.Checkout.Session[] = [];
    for await (const session of stripe.checkout.sessions.list({
      created: {
        gte: Math.floor(+p.createdAt / 1000) - 60,
        lte: Math.floor(+p.createdAt / 1000) + 86400,
      },
      limit: 100,
    })) {
      if (
        session.metadata?.paymentId === p.id &&
        session.metadata.tenantId === p.tenantId
      )
        matches.push(session);
    }
    assert(
      matches.length <= 1,
      "พบรายการรับชำระซ้ำ ต้องตรวจสอบกับผู้ให้บริการ",
      409,
    );
    await serial(async (tx) => {
      await assertBillingLock(tx, tenantId, token);
      const s = matches[0];
      if (s)
        await tx.saasPayment.update({
          where: { id: p.id },
          data: {
            providerRef: s.id,
            checkoutUrl: s.url,
            checkoutExpiresAt: new Date(s.expires_at * 1000),
            providerCheckedAt: new Date(),
          },
        });
      else
        await tx.saasPayment.update({
          where: { id: p.id },
          data: {
            providerCheckedAt: new Date(),
            ...(Date.now() - +p.createdAt > 86400000
              ? { status: "EXPIRED" }
              : {}),
          },
        });
    });
  });
  const p = await db.saasPayment.findUniqueOrThrow({
    where: { id: paymentId },
  });
  if (p.providerRef) await syncCheckout(p.id, tenantId, stripe);
}

export async function dispatchBillingEvent(
  type: string,
  objectId: string,
  stripe = stripeClient(),
) {
  if (type.startsWith("checkout.session.")) {
    const s = await stripe.checkout.sessions.retrieve(objectId);
    if (!s.metadata?.paymentId || !s.metadata.tenantId) return;
    const p = await db.saasPayment.findFirst({
      where: { id: s.metadata.paymentId, tenantId: s.metadata.tenantId },
    });
    assert(
      p && (!p.providerRef || p.providerRef === s.id),
      "ไม่พบรายการชำระต้นทาง",
      409,
    );
    // Webhook may beat the response that persists the Checkout session.
    if (!p.providerRef)
      await db.saasPayment.update({
        where: { id: p.id },
        data: { providerRef: s.id },
      });
    await syncCheckout(p.id, p.tenantId, stripe);
  } else if (type.startsWith("invoice.")) {
    const invoice = await stripe.invoices.retrieve(objectId);
    const sub = invoiceSubscription(invoice);
    if (sub) await syncSubscription(sub, stripe, invoice.id);
  } else if (type.startsWith("customer.subscription.")) {
    await syncSubscription(objectId, stripe);
  } else if (type === "charge.refunded") {
    const charge = await stripe.charges.retrieve(objectId);
    const intentId = stripeId(charge.payment_intent);
    if (!intentId) return;
    let p = await db.saasPayment.findUnique({
      where: { stripePaymentIntentId: intentId },
    });
    if (!p) {
      const entries = await stripe.invoicePayments.list({
        payment: { type: "payment_intent", payment_intent: intentId },
        limit: 10,
      });
      if (entries.data.length) {
        const invoice = await stripe.invoices.retrieve(
          stripeId(entries.data[0].invoice)!,
        );
        const sub = invoiceSubscription(invoice);
        if (sub) await syncSubscription(sub, stripe, invoice.id);
      } else {
        const intent = await stripe.paymentIntents.retrieve(intentId);
        if (intent.metadata.paymentId && intent.metadata.tenantId)
          await syncCheckout(
            intent.metadata.paymentId,
            intent.metadata.tenantId,
            stripe,
          );
        else return;
      }
      p = await db.saasPayment.findUnique({
        where: { stripePaymentIntentId: intentId },
      });
    }
    assert(p, "รอเชื่อมโยงรายการคืนเงิน", 409);
    await withBillingLock(p.tenantId, async (token) => {
      const current = await stripe.charges.retrieve(objectId);
      assert(
        current.currency === "thb" &&
          current.paid &&
          current.amount === Math.round(Number(p!.totalAmount) * 100),
        "ยอดคืนเงินไม่ตรงรายการ",
        409,
      );
      await serial(async (tx) => {
        await assertBillingLock(tx, p!.tenantId, token);
        await recordRefund(tx, p!.id, current.amount_refunded);
      });
    });
  }
}
export async function receiveBillingEvent(event: Stripe.Event) {
  const object = event.data.object as { id?: string };
  await db.webhookEvent.upsert({
    where: { id: event.id },
    update: {},
    create: {
      id: event.id,
      type: event.type,
      objectId: object.id,
      status: "PENDING",
    },
  });
}
export async function processBillingEvent(id: string, stripe = stripeClient()) {
  // Claim with compare-and-swap; a crashed job is retried after its five-minute lease.
  const claim = await db.webhookEvent.updateMany({
    where: {
      id,
      status: { in: ["PENDING", "RETRY", "PROCESSING"] },
      availableAt: { lte: new Date() },
    },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
      availableAt: new Date(Date.now() + 300000),
    },
  });
  if (!claim.count) return;
  const job = await db.webhookEvent.findUniqueOrThrow({ where: { id } });
  try {
    if (job.type && job.objectId)
      await dispatchBillingEvent(job.type, job.objectId, stripe);
    await db.webhookEvent.update({
      where: { id },
      data: { status: "PROCESSED", processedAt: new Date(), lastError: null },
    });
  } catch {
    // Never persist provider payloads, signatures, card details, or credentials in errors.
    await db.webhookEvent.update({
      where: { id },
      data: {
        status: "RETRY",
        lastError: "Provider sync failed; inspect with billing:reconcile",
        availableAt: new Date(
          Date.now() +
            Math.min(3600000, 15000 * 2 ** Math.min(job.attempts, 8)),
        ),
      },
    });
    throw new Error("การตรวจสอบชำระยังไม่สำเร็จ ระบบจะลองใหม่อัตโนมัติ");
  }
}
