import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { db, serial } from "../src/lib/db";
import { createCheckout, checkoutSchema } from "../src/lib/billing-checkout";
import { calendarPeriod } from "../src/lib/billing";
import {
  syncCheckout,
  syncSubscription,
  receiveBillingEvent,
  processBillingEvent,
  dispatchBillingEvent,
  recoverCheckout,
} from "../src/lib/stripe-billing";
import { subscriptionState } from "../src/lib/license-guard";
import { safeNext } from "../src/lib/account-links";

function gateway() {
  const sessions = new Map<string, any>(),
    invoices = new Map<string, any>(),
    intents = new Map<string, any>(),
    subscriptions = new Map<string, any>();
  const keys = new Map<string, any>();
  let creates = 0,
    timeoutOnce = false;
  const api = {
    checkout: {
      sessions: {
        create: async (params: any, options: any) => {
          let s = keys.get(options.idempotencyKey);
          if (!s) {
            creates++;
            s = {
              id: `cs_test_${randomUUID()}`,
              metadata: params.metadata,
              amount_total: params.line_items[0].price_data.unit_amount,
              currency: "thb",
              status: "open",
              payment_status: "unpaid",
              url: "https://checkout.stripe.com/c/pay/test",
              expires_at: Math.floor(Date.now() / 1000) + 86400,
              payment_intent: null,
              subscription: null,
            };
            keys.set(options.idempotencyKey, s);
            sessions.set(s.id, s);
          }
          if (timeoutOnce) {
            timeoutOnce = false;
            throw new Error("Simulated response lost AFTER provider committed");
          }
          return s;
        },
        retrieve: async (id: string) => {
          const s = sessions.get(id);
          assert(s);
          return s;
        },
        list: () => ({
          async *[Symbol.asyncIterator]() {
            for (const s of sessions.values()) yield s;
          },
        }),
      },
    },
    subscriptions: {
      retrieve: async (id: string) => {
        const sub = subscriptions.get(id);
        assert(sub);
        return sub;
      },
    },
    invoices: {
      list: async (args: any) => ({
        data: [...invoices.values()].filter(
          (i) =>
            i.parent.subscription_details.subscription === args.subscription &&
            i.status === "paid",
        ),
        has_more: false,
      }),
      retrieve: async (id: string) => {
        const i = invoices.get(id);
        assert(i);
        return i;
      },
    },
    paymentIntents: {
      retrieve: async (id: string) => {
        const p = intents.get(id);
        assert(p);
        return p;
      },
    },
    charges: {
      retrieve: async (id: string) => {
        const p = [...intents.values()].find((p) => p.latest_charge.id === id);
        assert(p);
        return p.latest_charge;
      },
    },
    invoicePayments: {
      list: async (args: any) => ({
        data: [...invoices.values()]
          .flatMap((i) => i.payments.data)
          .filter((p) =>
            args.invoice
              ? p.invoice === args.invoice
              : p.payment.payment_intent === args.payment.payment_intent,
          ),
      }),
    },
  } as unknown as Stripe;
  function intent(total: number) {
    const id = `pi_${randomUUID()}`;
    const value = {
      id,
      status: "succeeded",
      metadata: {},
      latest_charge: {
        id: `ch_${randomUUID()}`,
        amount: total,
        amount_refunded: 0,
        paid: true,
        currency: "thb",
        payment_intent: id,
      },
    };
    intents.set(id, value);
    return value;
  }
  return {
    api,
    sessions,
    invoices,
    intents,
    subscriptions,
    intent,
    creates: () => creates,
    timeout: () => {
      timeoutOnce = true;
    },
  };
}
async function fixture(
  fn: (f: {
    tenantId: string;
    userId: string;
    slug: string;
    g: ReturnType<typeof gateway>;
    input: ReturnType<typeof checkoutSchema.parse>;
  }) => Promise<void>,
) {
  const id = randomUUID();
  const u = await db.user.create({
    data: {
      email: `phase3-${id}@example.test`,
      fullName: "Phase 3 QA",
      selectedPlan: "STARTER_MONTHLY",
    },
  });
  const t = await db.tenant.create({
    data: {
      slug: `phase3-${id}`,
      ownerId: u.id,
      name: "Original buyer",
      trialEndsAt: new Date(Date.now() + 86400000),
    },
  });
  try {
    await fn({
      tenantId: t.id,
      userId: u.id,
      slug: t.slug,
      g: gateway(),
      input: checkoutSchema.parse({
        requestKey: randomUUID(),
        storeSlug: t.slug,
        planCode: "STARTER_MONTHLY",
        method: "STRIPE_CARD",
        confirmedTotal: 21293,
      }),
    });
  } finally {
    await db.emailOutbox.deleteMany({ where: { tenantId: t.id } });
    await db.tenant.delete({ where: { id: t.id } });
    await db.user.delete({ where: { id: u.id } });
  }
}
async function startSubscription(f: {
  tenantId: string;
  g: ReturnType<typeof gateway>;
  input: ReturnType<typeof checkoutSchema.parse>;
}) {
  const result = await createCheckout(f.tenantId, f.input, f.g.api);
  const p = result.payment;
  const session = [...f.g.sessions.values()][0];
  const id = `sub_${randomUUID()}`;
  const sub = {
    id,
    customer: { id: `cus_${randomUUID()}` },
    metadata: session.metadata,
    status: "active",
    cancel_at_period_end: false,
  };
  f.g.subscriptions.set(id, sub);
  session.status = "complete";
  session.payment_status = "paid";
  session.subscription = { id };
  function invoice(start: number, end: number, first = false) {
    const pi = f.g.intent(21293);
    const i = {
      id: `in_${randomUUID()}`,
      status: "paid",
      billing_reason: first ? "subscription_create" : "subscription_cycle",
      currency: "thb",
      total: 21293,
      amount_paid: 21293,
      parent: { subscription_details: { subscription: id } },
      lines: {
        data: [{ amount: 21293, period: { start, end } }],
        has_more: false,
      },
      payments: { data: [] as any[] },
    };
    i.payments.data.push({
      invoice: i.id,
      status: "paid",
      payment: { type: "payment_intent", payment_intent: pi.id },
    });
    f.g.invoices.set(i.id, i);
    return { invoice: i, intent: pi };
  }
  const now = Math.floor(Date.now() / 1000);
  const first = invoice(now, now + 31 * 86400, true);
  return { payment: p, sub, session, invoice, first, now };
}

test("Phase 3 calendar periods clamp month end and safe auth redirects retain only valid plans", () => {
  assert.equal(
    calendarPeriod(
      new Date("2028-01-31T10:00:00Z"),
      "STARTER_MONTHLY",
    ).toISOString(),
    "2028-02-29T10:00:00.000Z",
  );
  assert.equal(
    calendarPeriod(
      new Date("2028-02-29T10:00:00Z"),
      "PRO_YEARLY",
    ).toISOString(),
    "2029-02-28T10:00:00.000Z",
  );
  assert.equal(
    safeNext("/subscribe?plan=PRO_YEARLY"),
    "/subscribe?plan=PRO_YEARLY",
  );
  for (const value of [
    "//evil.test",
    "/subscribe?plan=FREE_TRIAL",
    "/subscribe?plan=PRO_YEARLY&next=https://evil.test",
  ])
    assert.equal(safeNext(value), "/start");
});
test("Phase 3 lost provider response, identical retries and concurrent attempts create one checkout only", async () =>
  fixture(async (f) => {
    f.g.timeout();
    await assert.rejects(createCheckout(f.tenantId, f.input, f.g.api));
    assert.equal(
      await db.saasPayment.count({ where: { tenantId: f.tenantId } }),
      1,
    );
    const results = await Promise.allSettled([
      createCheckout(f.tenantId, f.input, f.g.api),
      createCheckout(f.tenantId, f.input, f.g.api),
    ]);
    assert(results.some((r) => r.status === "fulfilled"));
    await createCheckout(f.tenantId, f.input, f.g.api);
    assert.equal(f.g.creates(), 1);
    await assert.rejects(
      createCheckout(
        f.tenantId,
        { ...f.input, planCode: "PRO_MONTHLY" },
        f.g.api,
      ),
      /ข้อมูลต่างกัน/,
    );
    await assert.rejects(
      createCheckout(
        f.tenantId,
        { ...f.input, requestKey: randomUUID() },
        f.g.api,
      ),
      /รายการรอชำระ/,
    );
  }));
test("Phase 3 confirms exact total before payment and keeps a frozen receipt after shop edits", async () =>
  fixture(async (f) => {
    await assert.rejects(
      createCheckout(
        f.tenantId,
        { ...f.input, confirmedTotal: 41730 },
        f.g.api,
      ),
      /ราคา/,
    );
    assert.equal(
      await db.saasPayment.count({ where: { tenantId: f.tenantId } }),
      0,
    );
    const r = await createCheckout(f.tenantId, f.input, f.g.api);
    await db.tenant.update({
      where: { id: f.tenantId },
      data: { name: "Changed buyer", companyName: "Changed legal name" },
    });
    await createCheckout(f.tenantId, f.input, f.g.api);
    const p = await db.saasPayment.findUniqueOrThrow({
      where: { id: r.payment.id },
    });
    assert.equal((p.receipt as any).customerName, "Original buyer");
    assert.equal(Number(p.totalAmount), 212.93);
  }));
test("Phase 3 invoice arriving before checkout, duplicate events and stale failure cannot duplicate or regress entitlement", async () =>
  fixture(async (f) => {
    const s = await startSubscription(f);
    await dispatchBillingEvent("invoice.paid", s.first.invoice.id, f.g.api);
    await dispatchBillingEvent(
      "checkout.session.completed",
      s.session.id,
      f.g.api,
    );
    const first = await db.tenant.findUniqueOrThrow({
      where: { id: f.tenantId },
    });
    assert.equal(first.subscriptionStatus, "ACTIVE");
    assert.equal(first.stripeSubId, s.sub.id);
    assert.equal(+first.currentPeriodEndsAt!, (s.now + 31 * 86400) * 1000);
    const renewal = s.invoice(s.now + 31 * 86400, s.now + 59 * 86400);
    await dispatchBillingEvent("invoice.paid", renewal.invoice.id, f.g.api);
    await dispatchBillingEvent(
      "invoice.payment_failed",
      s.first.invoice.id,
      f.g.api,
    ); // canonical invoice is paid
    await dispatchBillingEvent(
      "checkout.session.completed",
      s.session.id,
      f.g.api,
    );
    const current = await db.tenant.findUniqueOrThrow({
      where: { id: f.tenantId },
    });
    assert.equal(current.subscriptionStatus, "ACTIVE");
    assert.equal(+current.currentPeriodEndsAt!, (s.now + 59 * 86400) * 1000);
    assert.equal(
      await db.saasPayment.count({ where: { tenantId: f.tenantId } }),
      2,
    );
    assert.equal(
      await db.emailOutbox.count({ where: { tenantId: f.tenantId } }),
      2,
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: f.userId } }))
        .selectedPlan,
      null,
    );
  }));
test("Phase 3 paid term survives cancellation; payment failure gets exactly three days grace; suspension stays enforced", async () =>
  fixture(async (f) => {
    const s = await startSubscription(f);
    await syncSubscription(s.sub.id, f.g.api);
    s.sub.cancel_at_period_end = true;
    await syncSubscription(s.sub.id, f.g.api);
    let t = await db.tenant.findUniqueOrThrow({ where: { id: f.tenantId } });
    assert.equal(subscriptionState(t), "ACTIVE");
    assert.equal(
      subscriptionState(t, +t.currentPeriodEndsAt! + 1),
      "READ_ONLY",
    );
    s.sub.cancel_at_period_end = false;
    s.sub.status = "past_due";
    await syncSubscription(s.sub.id, f.g.api);
    t = await db.tenant.findUniqueOrThrow({ where: { id: f.tenantId } });
    assert.equal(
      subscriptionState(t, +t.currentPeriodEndsAt! + 2 * 86400000),
      "PAST_DUE",
    );
    assert.equal(
      subscriptionState(t, +t.currentPeriodEndsAt! + 3 * 86400000 + 1),
      "READ_ONLY",
    );
    await db.tenant.update({
      where: { id: t.id },
      data: { subscriptionStatus: "SUSPENDED" },
    });
    s.sub.status = "active";
    s.invoice(s.now + 31 * 86400, s.now + 62 * 86400);
    await syncSubscription(s.sub.id, f.g.api);
    assert.equal(
      (await db.tenant.findUniqueOrThrow({ where: { id: t.id } }))
        .subscriptionStatus,
      "SUSPENDED",
    );
  }));
test("Phase 3 partial/full refunds reconcile without removing unrelated paid periods or reactivating a refunded invoice", async () =>
  fixture(async (f) => {
    const s = await startSubscription(f);
    await syncSubscription(s.sub.id, f.g.api);
    const renewal = s.invoice(s.now + 31 * 86400, s.now + 62 * 86400);
    await syncSubscription(s.sub.id, f.g.api);
    s.first.intent.latest_charge.amount_refunded = 10000;
    await dispatchBillingEvent(
      "charge.refunded",
      s.first.intent.latest_charge.id,
      f.g.api,
    );
    let p = await db.saasPayment.findUniqueOrThrow({
      where: { stripeInvoiceId: s.first.invoice.id },
    });
    assert.equal(p.status, "PARTIALLY_REFUNDED");
    s.first.intent.latest_charge.amount_refunded = 21293;
    await dispatchBillingEvent(
      "charge.refunded",
      s.first.intent.latest_charge.id,
      f.g.api,
    );
    let t = await db.tenant.findUniqueOrThrow({ where: { id: f.tenantId } });
    assert.equal(t.subscriptionStatus, "ACTIVE");
    assert.equal(+t.currentPeriodEndsAt!, (s.now + 62 * 86400) * 1000);
    renewal.intent.latest_charge.amount_refunded = 21293;
    await syncSubscription(s.sub.id, f.g.api); // missed refund webhook recovered by reconciliation
    t = await db.tenant.findUniqueOrThrow({ where: { id: f.tenantId } });
    assert.equal(t.subscriptionStatus, "READ_ONLY");
    await dispatchBillingEvent("invoice.paid", s.first.invoice.id, f.g.api);
    t = await db.tenant.findUniqueOrThrow({ where: { id: f.tenantId } });
    assert.equal(t.subscriptionStatus, "READ_ONLY");
  }));
test("Phase 3 one-off checkout completion is idempotent, does not create recurring billing, and can be refunded", async () =>
  fixture(async (f) => {
    const result = await createCheckout(
      f.tenantId,
      { ...f.input, method: "STRIPE_PROMPTPAY" },
      f.g.api,
    );
    const session = [...f.g.sessions.values()][0];
    const pi = f.g.intent(21293);
    session.payment_intent = pi;
    session.status = "complete";
    session.payment_status = "paid";
    await syncCheckout(result.payment.id, f.tenantId, f.g.api);
    const t = await db.tenant.findUniqueOrThrow({ where: { id: f.tenantId } });
    await syncCheckout(result.payment.id, f.tenantId, f.g.api);
    assert.equal(t.stripeSubId, null);
    assert.equal(t.planCode, "STARTER_MONTHLY");
    assert.equal(
      +(await db.tenant.findUniqueOrThrow({ where: { id: t.id } }))
        .currentPeriodEndsAt!,
      +t.currentPeriodEndsAt!,
    );
    pi.latest_charge.amount_refunded = 21293;
    await syncCheckout(result.payment.id, f.tenantId, f.g.api);
    assert.equal(
      (
        await db.saasPayment.findUniqueOrThrow({
          where: { id: result.payment.id },
        })
      ).status,
      "REFUNDED",
    );
  }));
test("Phase 3 wrong totals fail closed and a durable webhook job retries after provider failure", async () =>
  fixture(async (f) => {
    const s = await startSubscription(f);
    s.first.invoice.amount_paid = 1;
    const id = `evt_${randomUUID()}`;
    try {
      await receiveBillingEvent({
        id,
        type: "invoice.paid",
        data: { object: { id: s.first.invoice.id } },
      } as Stripe.Event);
      await assert.rejects(processBillingEvent(id, f.g.api));
      assert.equal(
        (await db.webhookEvent.findUniqueOrThrow({ where: { id } })).status,
        "RETRY",
      );
      assert.equal(
        (await db.tenant.findUniqueOrThrow({ where: { id: f.tenantId } }))
          .planCode,
        "FREE_TRIAL",
      );
      s.first.invoice.amount_paid = 21293;
      await db.webhookEvent.update({
        where: { id },
        data: { availableAt: new Date(0) },
      });
      await processBillingEvent(id, f.g.api);
      await processBillingEvent(id, f.g.api);
      const event = await db.webhookEvent.findUniqueOrThrow({ where: { id } });
      assert.equal(event.status, "PROCESSED");
      assert.equal(event.attempts, 2);
      assert.equal(
        await db.saasPayment.count({ where: { tenantId: f.tenantId } }),
        1,
      );
    } finally {
      await db.webhookEvent.deleteMany({ where: { id } });
    }
  }));
test("Phase 3 signed webhook verifies raw body, mode and signature and deduplicates HTTP delivery", async () => {
  const savedKey = process.env.STRIPE_SECRET_KEY,
    savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const id = `evt_${randomUUID()}`;
  try {
    process.env.STRIPE_SECRET_KEY = "sk_test_phase3_local_fixture";
    process.env.STRIPE_WEBHOOK_SECRET = `whsec_${randomUUID()}`;
    const { POST } = await import("../src/app/api/webhooks/stripe/route");
    const payload = JSON.stringify({
      id,
      object: "event",
      type: "customer.created",
      livemode: false,
      data: { object: { id: "cus_unrelated" } },
    });
    const signer = new Stripe(process.env.STRIPE_SECRET_KEY);
    const signature = signer.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    const request = (body = payload, sig = signature) =>
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": sig },
        body,
      });
    assert.equal((await POST(request(payload + " "))).status, 400);
    assert.equal((await POST(request())).status, 200);
    assert.equal((await POST(request())).status, 200);
    assert.equal(await db.webhookEvent.count({ where: { id } }), 1);
  } finally {
    if (savedKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = savedKey;
    if (savedSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = savedSecret;
    await db.webhookEvent.deleteMany({ where: { id } });
  }
});
test("Phase 3 reconciliation recovers a lost Checkout response without browser retry or webhook", async () =>
  fixture(async (f) => {
    f.g.timeout();
    await assert.rejects(
      createCheckout(
        f.tenantId,
        { ...f.input, method: "STRIPE_PROMPTPAY" },
        f.g.api,
      ),
    );
    const p = await db.saasPayment.findFirstOrThrow({
      where: { tenantId: f.tenantId },
    });
    assert.equal(p.providerRef, null);
    const session = [...f.g.sessions.values()][0];
    session.payment_status = "paid";
    session.status = "complete";
    session.payment_intent = f.g.intent(21293);
    await recoverCheckout(p.id, p.tenantId, f.g.api);
    const recovered = await db.saasPayment.findUniqueOrThrow({
      where: { id: p.id },
    });
    assert.equal(recovered.status, "PAID");
    assert.equal(recovered.providerRef, session.id);
    assert.equal(f.g.creates(), 1);
    assert(recovered.providerCheckedAt);
  }));
test("Phase 3 abandoned and failed asynchronous checkouts release pending state without granting a plan", async () =>
  fixture(async (f) => {
    const result = await createCheckout(
      f.tenantId,
      { ...f.input, method: "STRIPE_PROMPTPAY" },
      f.g.api,
    );
    const session = [...f.g.sessions.values()][0];
    session.status = "expired";
    await syncCheckout(result.payment.id, f.tenantId, f.g.api);
    assert.equal(
      (
        await db.saasPayment.findUniqueOrThrow({
          where: { id: result.payment.id },
        })
      ).status,
      "EXPIRED",
    );
    const another = await createCheckout(
      f.tenantId,
      { ...f.input, requestKey: randomUUID(), method: "STRIPE_PROMPTPAY" },
      f.g.api,
    );
    const next = [...f.g.sessions.values()][1];
    next.status = "complete";
    next.payment_intent = {
      ...f.g.intent(21293),
      status: "requires_payment_method",
    };
    await syncCheckout(another.payment.id, f.tenantId, f.g.api);
    assert.equal(
      (
        await db.saasPayment.findUniqueOrThrow({
          where: { id: another.payment.id },
        })
      ).status,
      "FAILED",
    );
    assert.equal(
      (await db.tenant.findUniqueOrThrow({ where: { id: f.tenantId } }))
        .planCode,
      "FREE_TRIAL",
    );
  }));
test("Phase 3 an unpaid initial subscription never bypasses trial expiry or grants indefinite access", async () =>
  fixture(async (f) => {
    const s = await startSubscription(f);
    f.g.invoices.clear();
    s.sub.status = "incomplete";
    await syncSubscription(s.sub.id, f.g.api);
    let t = await db.tenant.findUniqueOrThrow({ where: { id: f.tenantId } });
    assert.equal(t.subscriptionStatus, "TRIALING");
    assert.equal(t.currentPeriodEndsAt, null);
    assert.equal(subscriptionState(t, +t.trialEndsAt + 1), "READ_ONLY");
    s.sub.status = "incomplete_expired";
    await syncSubscription(s.sub.id, f.g.api);
    assert.equal(
      (await db.saasPayment.findUniqueOrThrow({ where: { id: s.payment.id } }))
        .status,
      "FAILED",
    );
  }));
after(() => db.$disconnect());
