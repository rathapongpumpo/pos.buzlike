import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { db } from "../src/lib/db";
import { decryptMail } from "../src/lib/email-outbox";
const base = process.env.TEST_BASE_URL ?? "http://localhost:3100";
const run = randomUUID();
let userId = "",
  tenantId = "",
  slug = "",
  cookie = "",
  paymentId = "";
async function call(
  path: string,
  body?: unknown,
  session = cookie,
  method = body ? "POST" : "GET",
) {
  return fetch(base + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: session,
      Origin: base,
      "Content-Type": "application/json",
      "X-Forwarded-For": `2001:db8:3::${run.slice(0, 8)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
test("Phase 3 HTTP: chosen plan survives registration, email verification, renewed session and empty-store setup", async () => {
  const guest = await call("/subscribe?plan=STARTER_YEARLY", undefined, "");
  assert(guest.headers.get("location")?.includes("register?next="));
  const email = `phase3-http-${run}@example.test`,
    password = `QA-${randomUUID()}`;
  const signup = await call(
    "/api/auth/register",
    {
      email,
      password,
      confirmPassword: password,
      next: "/subscribe?plan=STARTER_YEARLY",
    },
    "",
  );
  assert.equal(signup.status, 201, await signup.clone().text());
  userId = (await signup.json()).id;
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: userId } })).selectedPlan,
    "STARTER_YEARLY",
  );
  const mail = await db.emailOutbox.findFirstOrThrow({ where: { userId } });
  const link = new URL(
    decryptMail(mail.encryptedText!).match(/http[^\s]+/)![0],
  );
  assert.equal(link.searchParams.get("next"), "/subscribe?plan=STARTER_YEARLY");
  assert.equal(
    (
      await call(
        "/api/account/verify-email",
        { token: link.searchParams.get("token") },
        "",
      )
    ).status,
    200,
  );
  cookie = `authjs.session-token=${await encode({ token: { sub: userId, sessionVersion: 0 }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token", maxAge: 3600 })}`;
  assert(
    (await call("/start")).headers
      .get("location")
      ?.includes("/subscribe?plan=STARTER_YEARLY"),
  );
  assert(
    (await call("/subscribe?plan=STARTER_YEARLY")).headers
      .get("location")
      ?.includes("/onboarding?plan=STARTER_YEARLY"),
  );
  const requestKey = randomUUID();
  assert.equal(
    (
      await call(
        "/api/onboarding/draft",
        {
          requestKey,
          version: 0,
          name: "ร้านทดสอบสมาชิก",
          businessType: "RETAIL_SHOP",
        },
        cookie,
        "PUT",
      )
    ).status,
    200,
  );
  const setup = await call("/api/onboarding", {
    requestKey,
    name: "ร้านทดสอบสมาชิก",
    businessType: "RETAIL_SHOP",
    pin: "739126",
    confirmPin: "739126",
  });
  assert.equal(setup.status, 201, await setup.clone().text());
  slug = (await setup.json()).slug;
  const t = await db.tenant.findUniqueOrThrow({ where: { slug } });
  tenantId = t.id;
  assert.equal(t.ownerId, userId);
  assert.equal(t.planCode, "FREE_TRIAL");
  assert.equal(await db.product.count({ where: { tenantId } }), 0);
  const page = await call(`/${slug}/billing?plan=STARTER_YEARLY`);
  assert.equal(page.status, 200);
});
test("Phase 3 HTTP: prefetch does not mutate plan, intent writes require same-origin verified session", async () => {
  await call("/subscribe?plan=PRO_YEARLY");
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: userId } })).selectedPlan,
    "STARTER_YEARLY",
  );
  assert.equal(
    (await call("/api/billing/intent", { plan: "PRO_YEARLY" }, "", "PUT"))
      .status,
    401,
  );
  assert.equal(
    (await call("/api/billing/intent", { plan: "PRO_YEARLY" }, cookie, "PUT"))
      .status,
    200,
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: userId } })).selectedPlan,
    "PRO_YEARLY",
  );
});
test("Phase 3 HTTP: quote includes VAT, missing gateway fails closed, cross-shop payments cannot be changed and cashier cannot bill", async () => {
  for (const [planCode, amount, vat, total] of [
    ["STARTER_MONTHLY", 199, 13.93, 212.93],
    ["PRO_MONTHLY", 499, 34.93, 533.93],
    ["STARTER_YEARLY", 1990, 139.3, 2129.3],
    ["PRO_YEARLY", 4990, 349.3, 5339.3],
  ] as const) {
    const quote = await call("/api/billing/quote", {
      storeSlug: slug,
      planCode,
    });
    assert.equal(quote.status, 200);
    assert.deepEqual(await quote.json(), { amount, vat, total });
  }
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    const checkout = await call("/api/billing/checkout", {
      storeSlug: slug,
      requestKey: randomUUID(),
      planCode: "STARTER_MONTHLY",
      method: "STRIPE_CARD",
      confirmedTotal: 21293,
    });
    assert.equal(checkout.status, 503);
    assert.equal(await db.saasPayment.count({ where: { tenantId } }), 0);
  }
  const p = await db.saasPayment.create({
    data: {
      tenantId,
      invoiceNumber: `PHASE3HTTP-${run}`,
      planCode: "STARTER_MONTHLY",
      amount: 199,
      vatAmount: 13.93,
      totalAmount: 212.93,
      paymentMethod: "BANK_SLIP",
      status: "PENDING",
    },
  });
  paymentId = p.id;
  assert.equal(
    (
      await call("/api/billing/manage", {
        storeSlug: slug,
        paymentId: `foreign-${run}`,
        action: "abandon",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call("/api/billing/status", {
        storeSlug: slug,
        paymentId: `foreign-${run}`,
      })
    ).status,
    404,
  );
  await db.staffMember.updateMany({
    where: { tenantId, userId },
    data: { role: "CASHIER" },
  });
  assert.equal(
    (
      await call("/api/billing/quote", {
        storeSlug: slug,
        planCode: "STARTER_MONTHLY",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/billing/manage", {
        storeSlug: slug,
        paymentId,
        action: "abandon",
      })
    ).status,
    403,
  );
  await db.staffMember.updateMany({
    where: { tenantId, userId },
    data: { role: "OWNER" },
  });
  await db.tenant.update({
    where: { id: tenantId },
    data: { trialEndsAt: new Date(0) },
  });
  assert.equal(
    (
      await call("/api/billing/quote", {
        storeSlug: slug,
        planCode: "STARTER_MONTHLY",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/api/billing/manage", {
        storeSlug: slug,
        paymentId,
        action: "abandon",
      })
    ).status,
    200,
  );
  assert.equal(
    (await db.saasPayment.findUniqueOrThrow({ where: { id: paymentId } }))
      .status,
    "CANCELED",
  );
});
after(async () => {
  if (userId)
    await db.emailOutbox.deleteMany({
      where: { OR: [{ userId }, ...(tenantId ? [{ tenantId }] : [])] },
    });
  if (tenantId) await db.tenant.delete({ where: { id: tenantId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});
