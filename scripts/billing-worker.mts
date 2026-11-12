import "dotenv/config";
import { db } from "../src/lib/db";
import { stripeClient, stripeReady } from "../src/lib/stripe-client";
import {
  processBillingEvent,
  receiveBillingEvent,
  syncCheckout,
  syncSubscription,
  recoverCheckout,
} from "../src/lib/stripe-billing";
if (!stripeReady())
  throw new Error("Billing worker requires Stripe secret and webhook secret");
const stripe = stripeClient();
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
const once = process.argv.includes("--once");
const all = process.argv.includes("--all");
do {
  let failed = 0;
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      failed++;
    }
  };
  // Recover events never delivered to the endpoint, using the authenticated provider API.
  await run(async () => {
    for await (const event of stripe.events.list({
      created: {
        gte: Math.floor(Date.now() / 1000) - (all ? 29 * 86400 : 3600),
      },
      limit: 100,
    })) {
      if (stopping) break;
      if (
        /^(checkout\.session\.|invoice\.|customer\.subscription\.|charge\.refunded$)/.test(
          event.type,
        )
      )
        await receiveBillingEvent(event);
    }
  });
  const jobs = await db.webhookEvent.findMany({
    where: {
      status: { in: ["PENDING", "RETRY", "PROCESSING"] },
      availableAt: { lte: new Date() },
    },
    orderBy: { availableAt: "asc" },
    take: 100,
  });
  for (const job of jobs) {
    if (stopping) break;
    await run(() => processBillingEvent(job.id, stripe));
  }
  const tenants = await db.tenant.findMany({
    where: {
      stripeSubId: { not: null },
      ...(all
        ? {}
        : {
            OR: [
              { billingSyncedAt: null },
              { billingSyncedAt: { lt: new Date(Date.now() - 300000) } },
            ],
          }),
    },
    orderBy: { billingSyncedAt: { sort: "asc", nulls: "first" } },
    take: all ? undefined : 50,
  });
  for (const t of tenants) {
    if (stopping) break;
    await run(() => syncSubscription(t.stripeSubId!, stripe));
  }
  const pending = await db.saasPayment.findMany({
    where: {
      paymentMethod: { startsWith: "STRIPE" },
      ...(all
        ? {}
        : {
            OR: [
              { providerCheckedAt: null },
              { providerCheckedAt: { lt: new Date(Date.now() - 300000) } },
            ],
          }),
      AND: [
        {
          OR: [
            { status: "PENDING" },
            {
              status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
              stripeSubscriptionId: null,
              ...(all
                ? {}
                : {
                    OR: [
                      { periodEnd: { gt: new Date() } },
                      { planCode: "LIFETIME_BUYOUT" },
                    ],
                  }),
            },
          ],
        },
      ],
    },
    orderBy: { providerCheckedAt: { sort: "asc", nulls: "first" } },
    take: all ? undefined : 100,
  });
  for (const p of pending) {
    if (stopping) break;
    await run(() =>
      p.providerRef?.startsWith("cs_")
        ? syncCheckout(p.id, p.tenantId, stripe)
        : recoverCheckout(p.id, p.tenantId, stripe),
    );
  }
  console.log(
    JSON.stringify({
      worker: "billing",
      jobs: jobs.length,
      subscriptions: tenants.length,
      pending: pending.length,
      failed,
    }),
  );
  if (once) {
    if (failed) process.exitCode = 1;
    break;
  }
  for (let n = 0; n < 30 && !stopping; n++)
    await new Promise((r) => setTimeout(r, 1000));
} while (!stopping);
await db.$disconnect();
