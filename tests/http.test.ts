import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { compare } from "bcryptjs";
import { db } from "../src/lib/db";
import { seedTenantTemplate } from "../src/lib/provision";
const base = process.env.TEST_BASE_URL ?? "http://localhost:3100";
const terminalId = randomUUID();
let cookie = "",
  slug = "",
  tenantId = "",
  branchId = "",
  staffId = "",
  productId = "",
  tableId = "",
  orderId = "";
async function req(
  path: string,
  body?: unknown,
  options: { cookie?: string; origin?: string } = {},
) {
  return fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Cookie: options.cookie ?? cookie,
      ...(body === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            Origin: options.origin ?? base,
          }),
    },
    body:
      body === undefined
        ? undefined
        : JSON.stringify({ terminalId, ...(body as object) }),
    redirect: "manual",
  });
}
before(async () => {
  const id = randomUUID();
  slug = `http-${id.slice(0, 8)}`;
  const user = await db.user.create({
    data: { email: `${id}@example.test`, fullName: "HTTP QA" },
  });
  const t = await db.tenant.create({
    data: {
      ownerId: user.id,
      name: "HTTP QA",
      slug,
      trialEndsAt: new Date(Date.now() + 14 * 86400000),
    },
  });
  tenantId = t.id;
  const branch = await db.$transaction(
    (tx) =>
      seedTenantTemplate(
        tx,
        t.id,
        "CAFE_BEVERAGE",
        "1234",
        user.id,
        "HTTP QA",
        undefined,
        "INCLUSIVE",
      ),
    { timeout: 30000 },
  );
  branchId = branch.id;
  const token = await encode({
    token: { sub: user.id, name: user.fullName, email: user.email },
    secret: process.env.AUTH_SECRET!,
    salt: "authjs.session-token",
    maxAge: 3600,
  });
  cookie = `authjs.session-token=${token}`;
  staffId = (await db.staffMember.findFirstOrThrow({ where: { tenantId } })).id;
  productId = (
    await db.product.findFirstOrThrow({
      where: { tenantId, trackStockType: "DIRECT_UNIT" },
    })
  ).id;
  tableId = (await db.diningTable.findFirstOrThrow({ where: { tenantId } })).id;
});
test("HTTP authorization, cross-tenant isolation and secret redaction", async () => {
  assert.equal(
    (await req(`/api/v1/${slug}/bootstrap`, undefined, { cookie: "" })).status,
    401,
  );
  assert.equal((await req("/api/v1/buzlike-cafe/bootstrap")).status, 403);
  const res = await req(`/api/v1/${slug}/bootstrap`);
  assert.equal(res.status, 200);
  assert.ok(!(await res.text()).includes("pinCodeHash"));
  assert.equal((await req("/api/admin")).status, 403);
});
test("HTTP onboarding creates an empty store; owner adds their own category/product/price", async () => {
  const original = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });
  const beforeCount = await db.tenant.count({
    where: { ownerId: original.ownerId },
  });
  const mismatchedPin = await req("/api/onboarding", {
    requestKey: randomUUID(),
    name: "ห้ามสร้างเมื่อ PIN ไม่ตรง",
    businessType: "RETAIL_SHOP",
    pin: "906127",
    confirmPin: "906128",
  });
  assert.equal(mismatchedPin.status, 400);
  assert.equal(
    await db.tenant.count({ where: { ownerId: original.ownerId } }),
    beforeCount,
  );
  const response = await req("/api/onboarding", {
    requestKey: randomUUID(),
    name: "ร้านที่เจ้าของตั้งเอง",
    businessType: "RETAIL_SHOP",
    pin: "906127",
    confirmPin: "906127",
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  const newSlug = body.slug as string;
  assert.match(newSlug, /^shop-[a-f0-9]{32}$/);
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { slug: newSlug },
  });
  try {
    assert.equal(
      await db.storeBranch.count({ where: { tenantId: tenant.id } }),
      1,
    );
    assert.equal(
      await db.staffMember.count({
        where: { tenantId: tenant.id, role: "OWNER" },
      }),
      1,
    );
    const counts = await Promise.all([
      db.product.count({ where: { tenantId: tenant.id } }),
      db.category.count({ where: { tenantId: tenant.id } }),
      db.ingredient.count({ where: { tenantId: tenant.id } }),
      db.diningTable.count({ where: { tenantId: tenant.id } }),
      db.order.count({ where: { tenantId: tenant.id } }),
      db.modifierGroup.count({ where: { tenantId: tenant.id } }),
    ]);
    assert.deepEqual(counts, [0, 0, 0, 0, 0, 0]);
    const category = await req(`/api/v1/${newSlug}/categories`, {
      name: "สินค้าของฉัน",
      kitchenStation: "MAIN",
    });
    assert.equal(category.status, 200);
    const ownCategory = await category.json();
    const product = await req(`/api/v1/${newSlug}/products`, {
      name: "สินค้าแรก",
      sku: "MY-001",
      price: 45.5,
      categoryId: ownCategory.id,
      trackStockType: "DIRECT_UNIT",
      directStockQty: 20,
    });
    assert.equal(product.status, 200);
    const ownProduct = await product.json();
    assert.equal(ownProduct.name, "สินค้าแรก");
    assert.equal(Number(ownProduct.price), 45.5);
    assert.equal(await db.product.count({ where: { tenantId: tenant.id } }), 1);
    const settings = await req(`/api/v1/${newSlug}/settings`, {
      storeName: "ชื่อร้านแก้ได้",
      name: "สาขาหลัก",
      address: "",
      phone: "",
      taxId: "",
      promptPayId: "",
      promptPayName: "",
      receiptHeader: "",
      receiptFooter: "",
      vatRate: 0,
      vatInclusive: true,
      serviceChargeRate: 0,
    });
    assert.equal(settings.status, 200);
    const renamed = await db.tenant.findUniqueOrThrow({
      where: { id: tenant.id },
    });
    assert.equal(renamed.name, "ชื่อร้านแก้ได้");
    assert.equal(renamed.slug, newSlug);
    assert.equal(
      (
        await db.storeBranch.findFirstOrThrow({
          where: { tenantId: tenant.id },
        })
      ).vatRate.toString(),
      "0",
    );
  } finally {
    await db.product.deleteMany({ where: { tenantId: tenant.id } });
    await db.tenant.delete({ where: { id: tenant.id } });
  }
});
test("HTTP signup requires matching passwords, no personal name/phone, and stores only a hash", async () => {
  const email = `signup-${randomUUID()}@example.test`;
  const ip = `2001:db8::${randomUUID().slice(0, 8)}`;
  const password = "QA-only-strong-password-2026";
  const submit = (body: unknown) =>
    fetch(base + "/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: base,
        "X-Forwarded-For": ip,
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await submit({ email, password })).status, 400);
    const mismatch = await submit({
      email,
      password,
      confirmPassword: "Different-password-2026",
    });
    assert.equal(mismatch.status, 400);
    assert.match((await mismatch.json()).error, /รหัสผ่านทั้งสองช่องไม่ตรงกัน/);
    assert.equal(await db.user.count({ where: { email } }), 0);
    const created = await submit({
      email: `  ${email.toUpperCase()}  `,
      password,
      confirmPassword: password,
    });
    assert.equal(created.status, 201);
    assert.deepEqual(Object.keys(await created.json()), ["id"]);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    assert.equal(user.phone, null);
    assert.equal(user.fullName, "เจ้าของร้าน");
    assert.notEqual(user.passwordHash, password);
    assert.ok(await compare(password, user.passwordHash!));
    assert.equal(
      (await submit({ email, password, confirmPassword: password })).status,
      409,
    );
  } finally {
    await db.user.deleteMany({ where: { email } });
    await db.rateLimit.deleteMany({ where: { key: `register:${ip}` } });
  }
});
test("HTTP rejects cross-origin mutation and forged Stripe events", async () => {
  assert.equal(
    (
      await req(
        `/api/v1/${slug}/shifts/open`,
        { startingCash: 1000 },
        { origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  const stripe = await req("/api/webhooks/stripe", {});
  assert.ok([400, 503].includes(stripe.status));
});
test("HTTP cash sale requires a shift, validates cash, is idempotent and reverses stock once", async () => {
  const input = {
    clientOrderId: randomUUID(),
    items: [{ productId, quantity: 1 }],
    method: "CASH",
    cashReceived: 1000,
  };
  assert.equal((await req(`/api/v1/${slug}/orders`, input)).status, 409);
  assert.equal(
    (await req(`/api/v1/${slug}/shifts/open`, { startingCash: 1000 })).status,
    200,
  );
  assert.equal(
    (await req(`/api/v1/${slug}/shifts/open`, { startingCash: 1000 })).status,
    409,
  );
  const initial = await db.product.findFirstOrThrow({
    where: { tenantId, id: productId },
  });
  const bad = await req(`/api/v1/${slug}/orders`, {
    ...input,
    clientOrderId: randomUUID(),
    cashReceived: 0,
  });
  assert.equal(bad.status, 400);
  const first = await req(`/api/v1/${slug}/orders`, input);
  assert.equal(first.status, 200, await first.clone().text());
  const order = await first.json();
  orderId = order.id;
  const duplicate = await req(`/api/v1/${slug}/orders`, input);
  assert.equal((await duplicate.json()).id, order.id);
  assert.equal(
    (await db.product.findFirstOrThrow({ where: { tenantId, id: productId } }))
      .directStockQty,
    initial.directStockQty - 1,
  );
  assert.equal(
    (
      await req(`/api/v1/${slug}/orders/${order.id}/void`, {
        reason: "ทดสอบยกเลิก",
        pin: "1234",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await req(`/api/v1/${slug}/orders/${order.id}/void`, {
        reason: "ทดสอบยกเลิก",
        pin: "1234",
      })
    ).status,
    409,
  );
  assert.equal(
    (await db.product.findFirstOrThrow({ where: { tenantId, id: productId } }))
      .directStockQty,
    initial.directStockQty,
  );
});
test("HTTP QR opens, accepts unpaid order, settles and invalidates old token", async () => {
  const opened = await req(`/api/v1/${slug}/tables/${tableId}/open`, {});
  assert.equal(opened.status, 200);
  const table = await opened.json();
  const token = table.activeQrToken;
  const menu = await req(`/api/m/${token}`, undefined, { cookie: "" });
  assert.equal(menu.status, 200);
  const input = {
    clientOrderId: randomUUID(),
    items: [{ productId, quantity: 1 }],
  };
  const res = await req(`/api/m/${token}`, input, { cookie: "" });
  assert.equal(res.status, 200, await res.clone().text());
  const qrOrder = await db.order.findFirstOrThrow({
    where: { tenantId, clientOrderId: input.clientOrderId },
  });
  assert.equal(qrOrder.status, "OPEN");
  const settled = await req(`/api/v1/${slug}/orders/settle`, {
    orderIds: [qrOrder.id],
    method: "CASH",
    cashReceived: 1000,
  });
  assert.equal(settled.status, 200, await settled.clone().text());
  assert.equal(
    (await req(`/api/m/${token}`, input, { cookie: "" })).status,
    410,
  );
});
test("HTTP export gate, read-only reports and checkout authorization", async () => {
  assert.equal((await req(`/api/v1/${slug}/reports/export`)).status, 402);
  await db.tenant.update({
    where: { id: tenantId },
    data: { trialEndsAt: new Date(Date.now() - 1000) },
  });
  assert.equal(
    (
      await req(`/api/v1/${slug}/orders`, {
        clientOrderId: randomUUID(),
        items: [{ productId, quantity: 1 }],
        method: "CASH",
        cashReceived: 1000,
      })
    ).status,
    402,
  );
  const exportResponse = await req(`/api/v1/${slug}/reports/export`);
  assert.equal(exportResponse.status, 200);
  const bytes = new Uint8Array(await exportResponse.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191]);
  await db.tenant.update({
    where: { id: tenantId },
    data: { trialEndsAt: new Date(Date.now() + 86400000) },
  });
});
test("HTTP cashier PIN reduces permissions, role can be switched back only with valid PIN", async () => {
  const cashier = await db.staffMember.create({
    data: {
      tenantId,
      branchAccess: { create: { branchId } },
      displayName: "QA Cashier",
      role: "CASHIER",
      pinCodeHash: await (await import("bcryptjs")).hash("5678", 10),
    },
  });
  const switched = await req(`/api/v1/${slug}/pin/switch`, {
    staffId: cashier.id,
    pin: "5678",
  });
  assert.equal(switched.status, 200);
  const posCookie = switched.headers.getSetCookie()[0].split(";")[0];
  const cashierCookie = cookie + "; " + posCookie;
  assert.equal(
    (await req(`/api/v1/${slug}/settings`, {}, { cookie: cashierCookie }))
      .status,
    403,
  );
  assert.equal(
    (
      await req(
        `/api/v1/${slug}/pin/switch`,
        { staffId, pin: "9999" },
        { cookie: cashierCookie },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await req(
        `/api/v1/${slug}/pin/switch`,
        { staffId, pin: "1234" },
        { cookie: cashierCookie },
      )
    ).status,
    200,
  );
});
test("HTTP shift close aggregates cash and records drawer difference", async () => {
  const res = await req(`/api/v1/${slug}/shifts/close`, { actualCash: 1000 });
  assert.equal(res.status, 200);
  const report = await res.json();
  assert.equal(report.status, "CLOSED");
  assert.ok(Number(report.expectedCash) > 1000);
  assert.ok(Number(report.cashDifference) < 0);
});
test("HTTP Starter cannot use Pro workflows, upgrading to Pro unlocks table QR, kitchen and BOM", async () => {
  const starter = await db.plan.findUniqueOrThrow({
    where: { code: "STARTER_MONTHLY" },
  });
  await db.tenant.update({
    where: { id: tenantId },
    data: {
      planCode: starter.code,
      subscriptionStatus: "ACTIVE",
      currentPeriodEndsAt: new Date(Date.now() + 86400000),
      enableKds: starter.enableKds,
      enableQrOrder: starter.enableQrOrder,
      enableRecipeBom: starter.enableRecipeBom,
    },
  });
  assert.equal(
    (
      await req(`/api/v1/${slug}/orders/${orderId}/kds`, {
        status: "PREPARING",
      })
    ).status,
    402,
  );
  assert.equal(
    (await req(`/api/v1/${slug}/tables/${tableId}/open`, {})).status,
    402,
  );
  assert.equal(
    (await req(`/api/v1/${slug}/recipes`, { productId, items: [] })).status,
    402,
  );
  assert.equal(
    (
      await req(`/api/v1/${slug}/orders`, {
        clientOrderId: randomUUID(),
        tableId,
        items: [{ productId, quantity: 1 }],
        method: "CASH",
        cashReceived: 1000,
      })
    ).status,
    402,
  );
  const pro = await db.plan.findUniqueOrThrow({
    where: { code: "PRO_MONTHLY" },
  });
  await db.tenant.update({
    where: { id: tenantId },
    data: {
      planCode: pro.code,
      enableKds: pro.enableKds,
      enableQrOrder: pro.enableQrOrder,
      enableRecipeBom: pro.enableRecipeBom,
    },
  });
  const open = await req(`/api/v1/${slug}/tables/${tableId}/open`, {});
  assert.equal(open.status, 200);
  const table = await open.json();
  assert.equal(
    (await req(`/api/m/${table.activeQrToken}`, undefined, { cookie: "" }))
      .status,
    200,
  );
  assert.equal(
    (await req(`/api/v1/${slug}/recipes`, { productId, items: [] })).status,
    200,
  );
  assert.equal(
    (
      await req(`/api/v1/${slug}/orders/${orderId}/kds`, {
        status: "PREPARING",
      })
    ).status,
    404,
  );
  await req(`/api/v1/${slug}/tables/${tableId}/close`, {});
});
after(async () => {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (tenant && tenant.slug === slug && slug.startsWith("http-")) {
    await db.order.deleteMany({ where: { tenantId } });
    await db.cashierShift.deleteMany({ where: { tenantId } });
    await db.product.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
    await db.user.delete({ where: { id: tenant.ownerId } });
  }
  await db.$disconnect();
});
