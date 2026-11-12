import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { hash } from "bcryptjs";
import { db } from "../src/lib/db";
import { provisionEmptyTenant } from "../src/lib/provision";
import { staffCookie } from "../src/lib/staff-session";
import { offlineScope, replayMatchesScope } from "../src/lib/offline-scope";
import { returnStock } from "../src/lib/stock-deduction";
const base = process.env.TEST_BASE_URL ?? "http://localhost:3100";
const run = randomUUID();
const terminalId = randomUUID();
let tenantId = "",
  slug = "",
  ownerId = "",
  ownerStaff = "",
  employeeId = "",
  employeeStaff = "",
  managerStaff = "",
  branchA = "",
  branchB = "",
  productId = "",
  categoryId = "",
  otherTenant = "",
  otherBranch = "",
  cookie = "",
  employeeCookie = "",
  saleId = "",
  saleClientId = "";
const users: string[] = [];
async function session(userId: string) {
  return `authjs.session-token=${await encode({ token: { sub: userId }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token", maxAge: 3600 })}`;
}
const operatorCookie = (staffId: string) =>
  `${cookie}; pos-staff-${tenantId}=${staffCookie(staffId, ownerId, tenantId)}`;
const request = (path: string, body?: object, authCookie = cookie) =>
  fetch(base + `/api/v1/${slug}/` + path, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: authCookie,
      Origin: base,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify({ terminalId, ...body }) : undefined,
  });
const bootstrap = async (branchId: string, authCookie = cookie) =>
  (
    await request(`bootstrap?branchId=${branchId}`, undefined, authCookie)
  ).json();
const sale = (branchId: string, clientOrderId: string = randomUUID()) =>
  request("orders", {
    branchId,
    clientOrderId,
    items: [{ productId, quantity: 1 }],
    method: "CASH",
    cashReceived: 1000,
  });
async function updateProduct(
  branchId: string,
  quantity: number,
  price: number,
  stockVersion?: number,
) {
  return request("products", {
    branchId,
    id: productId,
    name: "สินค้าแยกสาขา",
    sku: "BRANCH-001",
    categoryId,
    price,
    directStockQty: quantity,
    stockVersion,
    trackStockType: "DIRECT_UNIT",
    isAvailable: true,
  });
}
before(async () => {
  const owner = await db.user.create({
    data: {
      email: `branch-owner-${run}@example.test`,
      fullName: "Phase 1 owner",
    },
  });
  ownerId = owner.id;
  users.push(owner.id);
  cookie = await session(ownerId);
  const tenant = await db.tenant.create({
    data: {
      ownerId,
      name: "Phase 1 QA",
      slug: `phase1-${run}`,
      trialEndsAt: new Date(Date.now() + 86400000),
      maxBranches: 5,
      maxStaff: 20,
      maxTerminals: -1,
      enableExport: true,
    },
  });
  tenantId = tenant.id;
  slug = tenant.slug;
  const main = await db.$transaction(
    (tx) =>
      provisionEmptyTenant(
        tx,
        tenantId,
        "827146",
        ownerId,
        owner.fullName,
        "",
        "NONE",
      ),
    { timeout: 30000 },
  );
  branchA = main.id;
  ownerStaff = (
    await db.staffMember.findFirstOrThrow({
      where: { tenantId, role: "OWNER" },
    })
  ).id;
  branchB = (
    await db.storeBranch.create({ data: { tenantId, name: "สาขา B" } })
  ).id;
  categoryId = (
    await db.category.create({ data: { tenantId, name: "สินค้าของร้าน" } })
  ).id;
  productId = (
    await db.product.create({
      data: {
        tenantId,
        categoryId,
        sku: "BRANCH-001",
        name: "สินค้าแยกสาขา",
        price: 45,
        directStockQty: 10,
        trackStockType: "DIRECT_UNIT",
      },
    })
  ).id;
  const employee = await db.user.create({
    data: {
      email: `branch-employee-${run}@example.test`,
      fullName: "Employee A",
    },
  });
  employeeId = employee.id;
  users.push(employee.id);
  employeeCookie = await session(employee.id);
  employeeStaff = (
    await db.staffMember.create({
      data: {
        tenantId,
        userId: employeeId,
        displayName: "พนักงาน A",
        role: "CASHIER",
        pinCodeHash: await hash("741852", 10),
        branchAccess: { create: { branchId: branchA } },
      },
    })
  ).id;
  managerStaff = (
    await db.staffMember.create({
      data: {
        tenantId,
        displayName: "ผู้จัดการ A",
        role: "MANAGER",
        pinCodeHash: "not-a-login-pin",
        branchAccess: { create: { branchId: branchA } },
      },
    })
  ).id;
  const other = await db.tenant.create({
    data: {
      ownerId,
      slug: `other-${run}`,
      name: "ร้านอื่น",
      trialEndsAt: new Date(Date.now() + 86400000),
    },
  });
  otherTenant = other.id;
  otherBranch = (
    await db.storeBranch.create({
      data: { tenantId: other.id, name: "สาขาร้านอื่น" },
    })
  ).id;
});
test("Phase 1: stock is not duplicated into another branch; prices and adjustments are branch-specific", async () => {
  const a = await bootstrap(branchA),
    b = await bootstrap(branchB);
  assert.equal(a.products[0].directStockQty, 10);
  assert.equal(b.products[0].directStockQty, 0);
  assert.equal(
    (await updateProduct(branchB, 6, 65, b.products[0].stockVersion)).status,
    200,
  );
  const afterA = await bootstrap(branchA),
    afterB = await bootstrap(branchB);
  assert.equal(afterA.products[0].directStockQty, 10);
  assert.equal(Number(afterA.products[0].price), 45);
  assert.equal(afterB.products[0].directStockQty, 6);
  assert.equal(Number(afterB.products[0].price), 65);
  assert.equal(
    (await db.product.findUniqueOrThrow({ where: { id: productId } }))
      .directStockQty,
    16,
  );
  for (const id of [branchA, branchB])
    assert.equal(
      (await request("shifts/open", { branchId: id, startingCash: 1000 }))
        .status,
      200,
    );
});
test("Phase 1: branch grants isolate bootstrap, reports, cash records, PIN switching and newly-created branches", async () => {
  const allowed = await bootstrap(branchA, employeeCookie);
  assert.deepEqual(
    allowed.branches.map((branch: { id: string }) => branch.id),
    [branchA],
  );
  for (const path of [
    `bootstrap?branchId=${branchB}`,
    `reports/export?branchId=${branchB}`,
    `events?branchId=${branchB}`,
  ])
    assert.equal((await request(path, undefined, employeeCookie)).status, 403);
  assert.equal(
    (await request(`bootstrap?branchId=${otherBranch}`)).status,
    403,
  );
  assert.equal(
    (
      await request(
        "shifts/cash",
        { branchId: branchB, amount: 10, reason: "ห้ามข้ามสาขา" },
        employeeCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "pin/switch",
        { branchId: branchA, staffId: ownerStaff, pin: "827146" },
        employeeCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request("pin/switch", {
        branchId: branchB,
        staffId: employeeStaff,
        pin: "741852",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "staff",
        {
          branchId: branchA,
          displayName: "ห้ามเพิ่มสิทธิ์ B",
          role: "CASHIER",
          pin: "741852",
          branchIds: [branchB],
        },
        operatorCookie(managerStaff),
      )
    ).status,
    403,
  );
  await request("shifts/cash", {
    branchId: branchA,
    amount: 11,
    reason: "เงินสาขา A",
  });
  const cashB = await (
    await request("shifts/cash", {
      branchId: branchB,
      amount: 22,
      reason: "เงินสาขา B",
    })
  ).json();
  assert.ok(
    !(await bootstrap(branchA, employeeCookie)).cashMovements.some(
      (movement: { id: string }) => movement.id === cashB.id,
    ),
  );
  const branch = await (
    await request("branches", { branchId: branchA, name: "สาขา C" })
  ).json();
  assert.equal((await bootstrap(branch.id)).products[0].directStockQty, 0);
  assert.equal(
    (
      await request(
        `bootstrap?branchId=${branch.id}`,
        undefined,
        employeeCookie,
      )
    ).status,
    403,
  );
});
test("Phase 1: duplicate/cross-branch sale IDs cannot expose another branch's bill; stale stock edits roll back", async () => {
  saleClientId = randomUUID();
  const responses = await Promise.all(
    Array.from({ length: 4 }, () => sale(branchA, saleClientId)),
  );
  assert.ok(
    responses.every((response) => response.status === 200),
    JSON.stringify(await Promise.all(responses.map(async response => ({ status: response.status, body: await response.clone().text() })))),
  );
  const bills = await Promise.all(responses.map((response) => response.json()));
  saleId = bills[0].id;
  assert.ok(bills.every((bill) => bill.id === saleId));
  assert.equal(Number(bills[0].grandTotal), 45);
  assert.equal((await bootstrap(branchA)).products[0].directStockQty, 9);
  assert.equal((await bootstrap(branchB)).products[0].directStockQty, 6);
  assert.equal((await sale(branchB, saleClientId)).status, 404);
  assert.equal((await updateProduct(branchA, 10, 45, 0)).status, 409);
  assert.equal(
    (
      await request("orders", {
        branchId: branchA,
        operatorId: employeeStaff,
        clientOrderId: randomUUID(),
        items: [{ productId, quantity: 1 }],
        method: "CASH",
        cashReceived: 100,
      })
    ).status,
    409,
  );
});
test("Phase 1: refunds restore only the original branch, once; competing sales never overdraw stock", async () => {
  const body = { branchId: branchA, pin: "827146", reason: "คืนบิลทดสอบ" };
  assert.equal(
    (await request(`orders/${saleId}/refund`, { ...body, branchId: branchB }))
      .status,
    404,
  );
  assert.equal((await request(`orders/${saleId}/refund`, body)).status, 200);
  assert.equal((await request(`orders/${saleId}/refund`, body)).status, 409);
  await db.$transaction((tx) => returnStock(tx, tenantId, branchA, saleId));
  assert.equal((await bootstrap(branchA)).products[0].directStockQty, 10);
  const b = await bootstrap(branchB);
  assert.equal(
    (await updateProduct(branchB, 2, 65, b.products[0].stockVersion)).status,
    200,
  );
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => sale(branchB)),
  );
  assert.equal(
    responses.filter((response) => response.status === 200).length,
    2,
  );
  assert.ok(
    responses.every((response) => [200, 409].includes(response.status)),
  );
  const bAfter = await bootstrap(branchB);
  assert.equal(bAfter.products[0].directStockQty, 0);
  for (const response of responses.filter(
    (response) => response.status === 200,
  ))
    assert.equal(Number((await response.json()).grandTotal), 65);
  assert.equal((await bootstrap(branchA)).products[0].directStockQty, 10);
});
test("Phase 1: revoking a branch stops an existing SSE stream and prevents future reads", async () => {
  const originalPin = (await db.staffMember.findUniqueOrThrow({ where: { id: employeeStaff } })).pinCodeHash;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(
      `${base}/api/v1/${slug}/events?branchId=${branchA}`,
      { headers: { Cookie: employeeCookie }, signal: controller.signal },
    );
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    assert.equal((await reader.read()).done, false);
    assert.equal(
      (
        await request("staff", {
          branchId: branchA,
          id: employeeStaff,
          displayName: "พนักงาน B",
          role: "CASHIER",
          branchIds: [branchB],
        })
      ).status,
      200,
    );
    assert.equal((await db.staffMember.findUniqueOrThrow({ where: { id: employeeStaff } })).pinCodeHash, originalPin);
    let ended = false;
    while (!ended) ended = Boolean((await reader.read()).done);
    assert.equal(ended, true);
    assert.equal(
      (
        await request(
          `bootstrap?branchId=${branchA}`,
          undefined,
          employeeCookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          `bootstrap?branchId=${branchB}`,
          undefined,
          employeeCookie,
        )
      ).status,
      200,
    );
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
});
test("Phase 1: database rejects cross-tenant grants/stocks and negative quantities; offline replay binds branch and operator", async () => {
  await assert.rejects(
    db.staffBranchAccess.create({
      data: { tenantId, staffId: employeeStaff, branchId: otherBranch },
    }),
  );
  await assert.rejects(
    db.branchProduct.create({
      data: {
        tenantId: otherTenant,
        branchId: otherBranch,
        productId,
        price: 1,
        quantity: 1,
      },
    }),
  );
  await assert.rejects(
    db.branchProduct.update({
      where: { branchId_productId: { branchId: branchA, productId } },
      data: { quantity: -1 },
    }),
  );
  const key = offlineScope(ownerId, slug, branchA, ownerStaff);
  const row = {
    key,
    slug,
    input: { branchId: branchA, operatorId: ownerStaff },
  };
  assert.ok(replayMatchesScope(key, row));
  for (const input of [
    { branchId: branchB, operatorId: ownerStaff },
    { branchId: branchA, operatorId: employeeStaff },
    { branchId: branchA },
  ])
    assert.equal(replayMatchesScope(key, { ...row, input }), false);
  assert.equal(
    replayMatchesScope(`${ownerId}:${slug}`, {
      ...row,
      key: `${ownerId}:${slug}`,
    }),
    false,
  );
});
after(async () => {
  await db.order.deleteMany({ where: { tenantId } });
  await db.cashierShift.deleteMany({ where: { tenantId } });
  await db.tenant.deleteMany({
    where: { id: { in: [tenantId, otherTenant] } },
  });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});
