import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
const schema = "qa_pilot_a_" + randomUUID().replaceAll("-", "");
const root = new PrismaClient();
let db: typeof import("../src/lib/db").db,
  serial: typeof import("../src/lib/db").serial;
let pilot: typeof import("../src/lib/pilot"),
  rights: typeof import("../src/lib/entitlements");
let server: ChildProcess | undefined,
  adminId = "";
const base = "http://localhost:3101";
before(async () => {
  assert.match(schema, /^qa_pilot_a_[a-f0-9]+$/);
  await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.href;
  execFileSync(
    process.execPath,
    [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: { ...process.env }, stdio: "pipe" },
  );
  ({ db, serial } = await import("../src/lib/db"));
  pilot = await import("../src/lib/pilot");
  rights = await import("../src/lib/entitlements");
  adminId = (
    await db.user.create({
      data: {
        email: `admin-${randomUUID()}@example.test`,
        fullName: "Pilot admin",
        systemRole: "SUPER_ADMIN",
        emailVerifiedAt: new Date(),
      },
    })
  ).id;
  server = spawn(
    process.execPath,
    [
      path.resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3101",
    ],
    {
      env: {
        ...process.env,
        AUTH_URL: base,
        NEXT_PUBLIC_APP_URL: base,
        SMTP_HOST: "",
        SMTP_USER: "",
        SMTP_PASS: "",
        STRIPE_SECRET_KEY: "",
        STRIPE_WEBHOOK_SECRET: "",
      },
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    },
  );
  let diagnostic = "";
  server.stderr?.on("data", (chunk: Buffer) => {
    diagnostic += chunk.toString();
    const lines = diagnostic.split("\n");
    diagnostic = lines.pop() ?? "";
    for (const line of lines)
      if (line.includes('"event":"request_failed"')) console.error(line);
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + "/api/auth/session");
      if (r.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(
    ready,
    "Isolated HTTP server did not start; build first and keep port 3101 free",
  );
});
async function user(verified = true) {
  return db.user.create({
    data: {
      email: `pilot-${randomUUID()}@example.test`,
      fullName: "Pilot QA",
      emailVerifiedAt: verified ? new Date() : null,
    },
  });
}
async function campaign() {
  const c = await pilot.createPilotCampaign(adminId, `pilot-${randomUUID()}`);
  return pilot.setCampaignStatus(adminId, c.id, "OPEN", c.version);
}
async function invited(campaignId: string, verified = true) {
  const owner = await user(verified);
  const invite = await pilot.issuePilotInvitation(
    adminId,
    campaignId,
    owner.email,
  );
  return { owner, ...invite };
}
async function activate(
  campaignId: string,
  ownerId: string,
  grantId: string,
  sample = false,
) {
  const { seedTenantTemplate, provisionEmptyTenant } =
    await import("../src/lib/provision");
  return serial(async (tx) => {
    await pilot.lockPilotCampaign(tx, campaignId);
    const t = await tx.tenant.create({
      data: {
        ownerId,
        name: "Pilot QA",
        slug: `pilot-${randomUUID()}`,
        trialEndsAt: new Date(Date.now() - 1000),
        enableQrOrder: false,
        enableRecipeBom: false,
        enableKds: false,
      },
    });
    const branch = await (sample
      ? seedTenantTemplate(
          tx,
          t.id,
          "CAFE_BEVERAGE",
          "619472",
          ownerId,
          "Pilot QA",
          "",
          "NONE",
        )
      : provisionEmptyTenant(
          tx,
          t.id,
          "619472",
          ownerId,
          "Pilot QA",
          "",
          "NONE",
        ));
    const grant = await pilot.activatePilot(tx, ownerId, grantId, t.id);
    return { tenant: t, branch, grant };
  });
}
async function cookie(userId: string) {
  return `authjs.session-token=${await encode({ token: { sub: userId, sessionVersion: 0 }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token", maxAge: 3600 })}`;
}
async function request(url: string, userId: string, body?: unknown) {
  return fetch(base + url, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: await cookie(userId),
      Origin: base,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
}
test("Pilot A: migration preserves legacy defaults and only admins can issue campaigns", async () => {
  const settings = await db.releaseSettings.findUniqueOrThrow({
    where: { id: "platform" },
  });
  assert.equal(settings.releaseMode, "LEGACY");
  assert.equal(settings.checkoutMode, "PUBLIC");
  const u = await user();
  await assert.rejects(
    pilot.createPilotCampaign(u.id, "not-admin"),
    /ไม่มีสิทธิ์/,
  );
  const t = await db.tenant.create({
    data: {
      ownerId: u.id,
      name: "Legacy",
      slug: `legacy-${randomUUID()}`,
      trialEndsAt: new Date(Date.now() + 86400000),
    },
  });
  const resolved = await rights.effectiveTenantById(t.id);
  assert.deepEqual(resolved.tenant, t);
  assert.equal(resolved.entitlement.source, "BASE");
});
test("Pilot A: strict verified email and opaque, expiring invitations; legacy verification exemption cannot claim", async () => {
  const c = await campaign(),
    a = await invited(c.id, false),
    other = await user();
  assert.equal(a.invitation.tokenHash, pilot.pilotTokenHash(a.token));
  assert(!JSON.stringify(a.invitation).includes(a.token));
  await assert.rejects(pilot.reservePilot(a.owner.id, a.token), /ยืนยันอีเมล/);
  await assert.rejects(pilot.reservePilot(other.id, a.token), /อีเมลที่ได้รับ/);
  await assert.rejects(
    pilot.reservePilot(other.id, "0".repeat(64)),
    /ใช้ไม่ได้/,
  );
  await db.user.update({
    where: { id: a.owner.id },
    data: { emailVerifiedAt: new Date() },
  });
  const e = await pilot.reservePilot(a.owner.id, a.token);
  assert.equal(e.status, "RESERVED");
  assert.equal(e.activatedAt, null);
  assert.equal(e.endsAt, null);
  const replay = await pilot.reservePilot(a.owner.id, a.token);
  assert.equal(replay.id, e.id);
  assert.equal(+replay.reservedUntil!, +e.reservedUntil!);
  await db.pilotInvitation.update({
    where: { id: a.invitation.id },
    data: { revokedAt: new Date() },
  });
  await assert.rejects(pilot.reservePilot(a.owner.id, a.token), /ใช้ไม่ได้/);
});
test("Pilot A: twenty concurrent owners can reserve exactly five total slots", async () => {
  const c = await campaign(),
    candidates = [];
  for (let i = 0; i < 20; i++) candidates.push(await invited(c.id));
  const results = await Promise.allSettled(
    candidates.map((a) => pilot.reservePilot(a.owner.id, a.token)),
  );
  const ok = results.filter((r) => r.status === "fulfilled");
  assert.equal(
    ok.length,
    5,
    JSON.stringify(
      results
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason.message),
    ),
  );
  assert.equal(
    await db.pilotEnrollment.count({ where: { campaignId: c.id } }),
    5,
  );
  for (const r of results)
    if (r.status === "rejected") assert.equal(r.reason.status, 409);
  assert.equal(await db.saasPayment.count(), 0);
});
test("Pilot A: activation is atomic, starts thirty days once and never rewrites the paid plan", async () => {
  const c = await campaign(),
    a = await invited(c.id),
    e = await pilot.reservePilot(a.owner.id, a.token);
  const first = await activate(c.id, a.owner.id, e.id);
  const replay = await serial((tx) =>
    pilot.activatePilot(tx, a.owner.id, e.id, first.tenant.id),
  );
  assert.equal(+first.grant.endsAt! - +first.grant.activatedAt!, 30 * 86400000);
  assert.equal(+replay.endsAt!, +first.grant.endsAt!);
  const raw = await db.tenant.findUniqueOrThrow({
    where: { id: first.tenant.id },
  });
  assert.equal(raw.planCode, "FREE_TRIAL");
  assert.equal(raw.isLifetime, false);
  assert.equal(raw.enableKds, false);
  const effective = await rights.effectiveTenantById(raw.id);
  assert.equal(effective.entitlement.source, "PILOT");
  assert.equal(effective.entitlement.state, "ACTIVE");
  assert.equal(effective.tenant.maxBranches, 3);
  assert.equal(effective.tenant.maxStaff, -1);
  assert(effective.tenant.enableKds);
  await assert.rejects(
    serial((tx) =>
      pilot.activatePilot(tx, a.owner.id + "foreign", e.id, raw.id),
    ),
    /ไม่พบสิทธิ์/,
  );
  const before = await db.tenant.count();
  await assert.rejects(activate(c.id, a.owner.id, e.id), /ธุรกิจอื่น/);
  assert.equal(await db.tenant.count(), before);
  await assert.rejects(
    db.pilotEnrollment.update({
      where: { id: e.id },
      data: { activatedAt: new Date(0), version: { increment: 1 } },
    }),
  );
  await assert.rejects(db.pilotEnrollment.delete({ where: { id: e.id } }));
  assert.equal(await db.saasPayment.count(), 0);
});
test("Pilot A: expiry, revocation, suspension and paid precedence are deterministic without a worker", async () => {
  const c = await campaign(),
    a = await invited(c.id),
    e = await pilot.reservePilot(a.owner.id, a.token),
    f = await activate(c.id, a.owner.id, e.id);
  assert.equal(
    rights.resolveEntitlements(f.tenant, f.grant, +f.grant.endsAt!).entitlement
      .state,
    "READ_ONLY",
  );
  assert.equal(
    rights.resolveEntitlements(f.tenant, { ...f.grant, status: "REVOKED" })
      .entitlement.state,
    "READ_ONLY",
  );
  assert.equal(
    rights.resolveEntitlements(
      { ...f.tenant, subscriptionStatus: "SUSPENDED" },
      f.grant,
    ).entitlement.state,
    "SUSPENDED",
  );
  const paid = {
    ...f.tenant,
    planCode: "STARTER_MONTHLY" as const,
    subscriptionStatus: "ACTIVE" as const,
    currentPeriodEndsAt: new Date(Date.now() + 86400000),
  };
  assert.equal(
    rights.resolveEntitlements(paid, f.grant).entitlement.source,
    "PAID",
  );
  const staleVersion = f.grant.version;
  const extended = await pilot.extendPilot(
    adminId,
    e.id,
    staleVersion,
    new Date(+f.grant.endsAt! + 86400000),
    "Provider not yet enabled",
  );
  assert.equal(+extended.activatedAt!, +f.grant.activatedAt!);
  assert.equal(+extended.endsAt!, +f.grant.endsAt! + 86400000);
  await assert.rejects(
    pilot.extendPilot(
      adminId,
      e.id,
      staleVersion,
      new Date(+extended.endsAt! + 86400000),
      "Stale tab extension",
    ),
    /เปลี่ยนแล้ว/,
  );
  assert.equal(
    await db.pilotAuditEvent.count({
      where: { enrollmentId: e.id, action: "EXTENDED" },
    }),
    1,
  );
});
test("Pilot A: spent slots remain consumed after expiry, withdrawal or paid conversion", async () => {
  const c = await campaign();
  for (let i = 0; i < 5; i++) {
    const a = await invited(c.id),
      e = await pilot.reservePilot(a.owner.id, a.token);
    await activate(c.id, a.owner.id, e.id);
    await db.pilotEnrollment.update({
      where: { id: e.id },
      data: {
        status: ["EXPIRED", "REVOKED", "CONVERTED"][i % 3],
        version: { increment: 1 },
      },
    });
  }
  const sixth = await invited(c.id);
  await assert.rejects(
    pilot.reservePilot(sixth.owner.id, sixth.token),
    /เต็มแล้ว/,
  );
  assert.equal(
    await db.pilotEnrollment.count({
      where: { campaignId: c.id, activatedAt: { not: null } },
    }),
    5,
  );
});
test("Pilot A: an expired reservation frees capacity without a worker but cannot activate a store", async () => {
  const c = await pilot.createPilotCampaign(adminId, `short-${randomUUID()}`);
  await db.pilotCampaign.update({ where: { id: c.id }, data: { capacity: 1 } });
  await pilot.setCampaignStatus(adminId, c.id, "OPEN", c.version);
  const a = await invited(c.id);
  await db.pilotInvitation.update({
    where: { id: a.invitation.id },
    data: { expiresAt: new Date(Date.now() + 1500) },
  });
  const e = await pilot.reservePilot(a.owner.id, a.token);
  await new Promise((r) =>
    setTimeout(r, Math.max(0, +e.reservedUntil! - Date.now()) + 50),
  );
  const b = await invited(c.id);
  const next = await pilot.reservePilot(b.owner.id, b.token);
  assert.notEqual(next.id, e.id);
  const before = await db.tenant.count();
  await assert.rejects(activate(c.id, a.owner.id, e.id), /หมดอายุ/);
  assert.equal(await db.tenant.count(), before);
  assert.equal(await pilot.expirePilotReservations(c.id), 1);
});
test("Pilot A: private mode blocks all new payment channels even when a gateway is supplied", async () => {
  const { createCheckout, checkoutSchema } =
    await import("../src/lib/billing-checkout");
  const u = await user(),
    t = await db.tenant.create({
      data: {
        ownerId: u.id,
        name: "Admission",
        slug: `admit-${randomUUID()}`,
        trialEndsAt: new Date(Date.now() + 86400000),
      },
    });
  try {
    await db.releaseSettings.update({
      where: { id: "platform" },
      data: {
        releaseMode: "PRIVATE_PILOT",
        checkoutMode: "DISABLED",
        version: { increment: 1 },
      },
    });
    for (const method of ["STRIPE_CARD", "STRIPE_PROMPTPAY", "BANK_SLIP"]) {
      const input = checkoutSchema.parse({
        requestKey: randomUUID(),
        storeSlug: t.slug,
        planCode: "STARTER_MONTHLY",
        method,
        confirmedTotal: 41730,
      });
      await assert.rejects(
        createCheckout(t.id, input, {} as never),
        /ยังไม่เปิดรับชำระ/,
      );
    }
    assert.equal(await db.saasPayment.count(), 0);
    const r = await request("/api/onboarding", u.id, {
      requestKey: randomUUID(),
      name: "Must not create",
      businessType: "RETAIL_SHOP",
      pin: "619472",
      confirmPin: "619472",
    });
    assert.equal(r.status, 403, await r.clone().text());
  } finally {
    await db.releaseSettings.update({
      where: { id: "platform" },
      data: {
        releaseMode: "LEGACY",
        checkoutMode: "PUBLIC",
        version: { increment: 1 },
      },
    });
  }
});
test("Pilot A HTTP: private onboarding atomically activates the existing reservation and repeated requests create one empty store", async () => {
  const c = await campaign(),
    a = await invited(c.id),
    e = await pilot.reservePilot(a.owner.id, a.token);
  const body = {
    requestKey: randomUUID(),
    name: "Empty pilot shop",
    businessType: "RETAIL_SHOP",
    pin: "619472",
    confirmPin: "619472",
  };
  try {
    await db.releaseSettings.update({
      where: { id: "platform" },
      data: {
        releaseMode: "PRIVATE_PILOT",
        checkoutMode: "DISABLED",
        version: { increment: 1 },
      },
    });
    const results = await Promise.all([
      request("/api/onboarding", a.owner.id, body),
      request("/api/onboarding", a.owner.id, body),
      request("/api/onboarding", a.owner.id, body),
    ]);
    const payload = [];
    for (const r of results) {
      assert.equal(r.status, 201, await r.clone().text());
      payload.push(await r.json());
    }
    assert.equal(new Set(payload.map((p) => p.slug)).size, 1);
    const t = await db.tenant.findUniqueOrThrow({
      where: { slug: payload[0].slug },
    });
    assert.equal(await db.tenant.count({ where: { ownerId: a.owner.id } }), 1);
    assert.equal(await db.product.count({ where: { tenantId: t.id } }), 0);
    const grant = await db.pilotEnrollment.findUniqueOrThrow({
      where: { id: e.id },
    });
    assert.equal(grant.status, "ACTIVE");
    assert.equal(grant.tenantId, t.id);
    assert.equal(+grant.endsAt! - +grant.activatedAt!, 30 * 86400000);
    assert.equal(
      (
        await request("/api/onboarding", a.owner.id, {
          ...body,
          requestKey: randomUUID(),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/api/billing/quote", a.owner.id, {
          storeSlug: t.slug,
          planCode: "PRO_MONTHLY",
        })
      ).status,
      403,
    );
    assert.equal(await db.saasPayment.count(), 0);
  } finally {
    await db.releaseSettings.update({
      where: { id: "platform" },
      data: {
        releaseMode: "LEGACY",
        checkoutMode: "PUBLIC",
        version: { increment: 1 },
      },
    });
  }
});
test("Pilot A HTTP: one effective grant governs bootstrap, terminal quota, BOM, QR, expiry and report export", async () => {
  const c = await campaign(),
    a = await invited(c.id),
    e = await pilot.reservePilot(a.owner.id, a.token),
    f = await activate(c.id, a.owner.id, e.id, true);
  const slug = f.tenant.slug;
  let res = await request(`/api/v1/${slug}/bootstrap`, a.owner.id);
  assert.equal(res.status, 200, await res.clone().text());
  const boot = await res.json();
  assert.equal(boot.entitlement.source, "PILOT");
  assert.equal(boot.state, "ACTIVE");
  assert.equal(boot.tenant.maxBranches, 3);
  assert.equal(boot.tenant.enableRecipeBom, true);
  const stranger = await user();
  assert.equal(
    (await request(`/api/v1/${slug}/bootstrap`, stranger.id)).status,
    403,
  );
  const terminalId = randomUUID();
  res = await request(`/api/v1/${slug}/shifts/open`, a.owner.id, {
    startingCash: 1000,
    terminalId,
  });
  assert.equal(res.status, 200, await res.clone().text());
  const product = await db.product.findFirstOrThrow({
    where: { tenantId: f.tenant.id, trackStockType: "RECIPE" },
    include: {
      recipeItems: true,
      modifierGroups: {
        include: { modifierGroup: { include: { options: true } } },
      },
    },
  });
  const optionIds = product.modifierGroups.flatMap((g) =>
    g.modifierGroup.options.filter((o) => o.isDefault).map((o) => o.id),
  );
  const ingredientId = product.recipeItems[0].ingredientId;
  const before = await db.branchIngredientStock.findFirstOrThrow({
    where: { tenantId: f.tenant.id, branchId: f.branch.id, ingredientId },
  });
  for (const terminal of [terminalId, randomUUID()]) {
    res = await request(`/api/v1/${slug}/orders`, a.owner.id, {
      clientOrderId: randomUUID(),
      terminalId: terminal,
      items: [{ productId: product.id, quantity: 1, optionIds }],
      method: "CASH",
      cashReceived: 1000,
    });
    assert.equal(res.status, 200, await res.clone().text());
  }
  const afterStock = await db.branchIngredientStock.findFirstOrThrow({
    where: { tenantId: f.tenant.id, branchId: f.branch.id, ingredientId },
  });
  assert(Number(afterStock.currentQty) < Number(before.currentQty));
  const zone = await db.diningZone.findFirstOrThrow({
    where: { tenantId: f.tenant.id, branchId: f.branch.id },
  });
  const token = randomUUID();
  await db.diningTable.create({
    data: {
      tenantId: f.tenant.id,
      zoneId: zone.id,
      name: "Pilot QR",
      status: "OCCUPIED",
      activeQrToken: token,
    },
  });
  assert.equal((await fetch(base + `/api/m/${token}`)).status, 200);
  const exportResponse = await request(
    `/api/billing/export?storeSlug=${slug}`,
    a.owner.id,
  );
  assert.equal(exportResponse.status, 402);
  await db.pilotEnrollment.update({
    where: { id: e.id },
    data: {
      endsAt: new Date(+f.grant.activatedAt! + 1),
      status: "EXPIRED",
      version: { increment: 1 },
    },
  });
  res = await request(`/api/v1/${slug}/bootstrap`, a.owner.id);
  const expired = await res.json();
  assert.equal(expired.state, "READ_ONLY");
  assert.equal(
    (
      await request(`/api/v1/${slug}/categories`, a.owner.id, {
        name: "Denied after expiry",
      })
    ).status,
    402,
  );
  assert.equal((await fetch(base + `/api/m/${token}`)).status, 402);
  assert.equal(
    (await request(`/api/v1/${slug}/reports/export`, a.owner.id)).status,
    200,
  );
  res = await request("/api/billing/status", a.owner.id, { storeSlug: slug });
  assert.equal((await res.json()).state, "READ_ONLY");
});
test("Pilot A: database rejects cross-tenant feedback and immutable grant reassignment", async () => {
  const c = await campaign(),
    a = await invited(c.id),
    e = await pilot.reservePilot(a.owner.id, a.token),
    f = await activate(c.id, a.owner.id, e.id);
  const other = await invited(c.id),
    oe = await pilot.reservePilot(other.owner.id, other.token),
    of = await activate(c.id, other.owner.id, oe.id);
  const staff = await db.staffMember.findFirstOrThrow({
      where: { tenantId: f.tenant.id },
    }),
    foreignStaff = await db.staffMember.findFirstOrThrow({
      where: { tenantId: of.tenant.id },
    });
  const data = {
    enrollmentId: e.id,
    tenantId: f.tenant.id,
    branchId: f.branch.id,
    submittedByUserId: a.owner.id,
    submittedByStaffId: staff.id,
    requestKey: randomUUID(),
    category: "BUG",
    message: "Counter screenshot not required",
    pageKey: "pos",
    deviceClass: "TABLET",
  };
  await db.pilotFeedback.create({ data });
  await assert.rejects(
    db.pilotFeedback.create({
      data: { ...data, requestKey: randomUUID(), branchId: of.branch.id },
    }),
  );
  await assert.rejects(
    db.pilotFeedback.create({
      data: {
        ...data,
        requestKey: randomUUID(),
        submittedByStaffId: foreignStaff.id,
      },
    }),
  );
  await assert.rejects(
    db.pilotFeedback.create({
      data: { ...data, requestKey: randomUUID(), optionalRating: 6 },
    }),
  );
  await assert.rejects(
    db.pilotEnrollment.update({
      where: { id: e.id },
      data: { tenantId: of.tenant.id, version: { increment: 1 } },
    }),
  );
});
after(async () => {
  if (server) {
    const stopped = new Promise<void>((resolve) => {
      if (server!.exitCode !== null) return resolve();
      server!.once("exit", () => resolve());
    });
    server.kill();
    await stopped;
  }
  await db?.$disconnect();
  assert.match(schema, /^qa_pilot_a_[a-f0-9]+$/);
  await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await root.$disconnect();
});
