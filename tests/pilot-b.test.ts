import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { hash } from "bcryptjs";
const schema = "qa_pilot_b_" + randomUUID().replaceAll("-", "");
const root = new PrismaClient();
let db: typeof import("../src/lib/db").db;
let pilot: typeof import("../src/lib/pilot");
let provision: typeof import("../src/lib/provision").provisionEmptyTenant;
let decryptMail: typeof import("../src/lib/email-outbox").decryptMail;
let server: ChildProcess | undefined,
  adminId = "",
  passwordHash = "";
const base = "http://localhost:3102",
  password = "Pilot-B-Password!";
before(async () => {
  await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.href;
  execFileSync(
    process.execPath,
    [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: { ...process.env }, stdio: "pipe" },
  );
  ({ db } = await import("../src/lib/db"));
  pilot = await import("../src/lib/pilot");
  ({ provisionEmptyTenant: provision } = await import("../src/lib/provision"));
  ({ decryptMail } = await import("../src/lib/email-outbox"));
  passwordHash = await hash(password, 10);
  adminId = (
    await db.user.create({
      data: {
        email: `admin-${randomUUID()}@example.test`,
        fullName: "Admin",
        systemRole: "SUPER_ADMIN",
        emailVerifiedAt: new Date(),
      },
    })
  ).id;
  const c = await pilot.createPilotCampaign(adminId, "founders-5");
  await pilot.setCampaignStatus(adminId, c.id, "OPEN", c.version);
  await db.releaseSettings.update({
    where: { id: "platform" },
    data: { releaseMode: "PRIVATE_PILOT", checkoutMode: "DISABLED" },
  });
  server = spawn(
    process.execPath,
    [
      path.resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3102",
    ],
    {
      env: {
        ...process.env,
        AUTH_URL: base,
        NEXT_PUBLIC_APP_URL: base,
        SMTP_HOST: "",
        SMTP_USER: "",
        SMTP_PASS: "",
        AUTH_GOOGLE_ID: "",
        AUTH_GOOGLE_SECRET: "",
        STRIPE_SECRET_KEY: "",
        STRIPE_WEBHOOK_SECRET: "",
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/auth/session")).status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready, "Build first and keep test port 3102 free");
});
const cookie = async (id: string) =>
  `authjs.session-token=${await encode({ token: { sub: id, sessionVersion: 0 }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token", maxAge: 3600 })}`;
const cookiesFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
async function call(
  route: string,
  body?: object,
  session = "",
  method = body ? "POST" : "GET",
  origin = base,
) {
  return fetch(base + route, {
    method,
    redirect: "manual",
    headers: {
      Cookie: session,
      Origin: origin,
      "Content-Type": "application/json",
      "X-Forwarded-For": `qa-${randomUUID()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function user(verified = true, selectedPlan?: "PRO_YEARLY") {
  const u = await db.user.create({
    data: {
      email: `b-${randomUUID()}@example.test`,
      fullName: "Pilot owner",
      passwordHash,
      emailVerifiedAt: verified ? new Date() : null,
      selectedPlan,
    },
  });
  return { ...u, cookie: await cookie(u.id) };
}
async function campaign() {
  const c = await pilot.createPilotCampaign(adminId, `b-${randomUUID()}`);
  return pilot.setCampaignStatus(adminId, c.id, "OPEN", c.version);
}
async function invited(verified = true) {
  const c = await campaign(),
    u = await user(verified),
    invite = await pilot.issuePilotInvitation(adminId, c.id, u.email);
  const response = await call(
    "/api/pilot/context",
    { token: invite.token },
    u.cookie,
  );
  assert.equal(response.status, 200, await response.clone().text());
  return { u, c, invite, cookie: `${u.cookie}; ${cookiesFrom(response)}` };
}
async function claim(f: Awaited<ReturnType<typeof invited>>) {
  const response = await call("/api/pilot/claim", {}, f.cookie);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json() as Promise<{ enrollmentId: string }>;
}
async function tenant(ownerId: string) {
  const t = await db.tenant.create({
    data: {
      ownerId,
      name: "Original shop",
      slug: `b-${randomUUID()}`,
      trialEndsAt: new Date(Date.now() + 86400000),
    },
  });
  await db.$transaction((tx) =>
    provision(tx, t.id, "846295", ownerId, "เจ้าของร้าน", "", "NONE"),
  );
  return t;
}
async function login(email: string, context = "") {
  const csrf = await call("/api/auth/csrf");
  const { csrfToken } = await csrf.json();
  const response = await fetch(base + "/api/auth/callback/credentials", {
    method: "POST",
    redirect: "manual",
    headers: {
      Cookie: [cookiesFrom(csrf), context].filter(Boolean).join("; "),
      Origin: base,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: base + "/pilot",
    }),
  });
  const result = await response.json();
  assert(!result.url.includes("error="), result.url);
  return cookiesFrom(response);
}

test("Pilot B: private public pages show waitlist and future regular prices, never trial14 or purchase CTA", async () => {
  const html = await (await call("/")).text();
  assert.match(html, /ลงทะเบียนรอ/);
  assert.match(html, /199/);
  assert.match(html, /499/);
  assert(!html.includes("ทดลองใช้ฟรี 14 วัน"));
  assert(!html.includes("เลือก Lifetime"));
  assert(!html.includes("/subscribe?plan="));
  const signup = await (await call("/register")).text();
  assert(!signup.includes("ทดลองใช้ฟรี 14 วัน"));
  assert.match(signup, /ลงทะเบียนรอเปิดบริการ/);
  assert.equal(
    new URL(
      (await call("/subscribe?plan=PRO_YEARLY")).headers.get("location")!,
      base,
    ).pathname,
    "/pilot",
  );
});

test("Pilot B: invitation GET/prefetch and context exchange never reserve or start a grant; cookie is private", async () => {
  const f = await invited();
  const before = await db.pilotEnrollment.count();
  const response = await call(`/pilot/invite?token=${f.invite.token}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(await response.text(), /คุณได้รับคำเชิญ/);
  await call(`/pilot/invite?token=${f.invite.token}`, undefined, "", "HEAD");
  await call("/pilot", undefined, f.cookie);
  assert.equal(await db.pilotEnrollment.count(), before);
  const exchanged = await call("/api/pilot/context", { token: f.invite.token });
  const setCookie = exchanged.headers.getSetCookie().join(";");
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=lax/i);
  assert(!setCookie.includes(f.invite.token));
  assert.deepEqual(await exchanged.json(), { next: "/pilot" });
  assert.equal((await call("/api/pilot/context")).status, 405);
});

test("Pilot B: verified signup preserves invite through mailbox verification and credential login on another device", async () => {
  const c = await campaign(),
    email = `signup-${randomUUID()}@example.test`;
  const invite = await pilot.issuePilotInvitation(adminId, c.id, email);
  const context = cookiesFrom(
    await call("/api/pilot/context", { token: invite.token }),
  );
  const wrong = await call(
    "/api/auth/register",
    {
      email: `wrong-${randomUUID()}@example.test`,
      password,
      confirmPassword: password,
      next: "/pilot",
    },
    context,
  );
  assert.equal(wrong.status, 403);
  const signup = await call(
    "/api/auth/register",
    { email, password, confirmPassword: password, next: "/pilot" },
    context,
  );
  assert.equal(signup.status, 201, await signup.clone().text());
  const { id } = await signup.json();
  const saved = await db.user.findUniqueOrThrow({ where: { id } });
  assert.equal(saved.pendingPilotInvitationId, invite.invitation.id);
  assert.equal(saved.pendingPilotInvitationVersion, 1);
  assert.equal(
    (await call("/api/pilot/claim", {}, await cookie(id))).status,
    403,
  );
  const mail = await db.emailOutbox.findFirstOrThrow({ where: { userId: id } });
  const link = new URL(
    decryptMail(mail.encryptedText!).match(/http[^\s]+/)![0],
  );
  assert.equal(link.searchParams.get("next"), "/pilot");
  assert.equal(
    link.origin,
    base,
    "Verification mail must use the runtime server origin, not the build-time public URL",
  );
  assert.equal(
    (
      await call("/api/account/verify-email", {
        token: link.searchParams.get("token"),
      })
    ).status,
    200,
  );
  const anotherDevice = await login(email);
  assert.match(
    await (await call("/pilot", undefined, anotherDevice)).text(),
    /รับสิทธิ์และเลือกตั้งร้าน/,
  );
  assert.equal((await call("/api/pilot/claim", {}, anotherDevice)).status, 200);
});

test("Pilot B: an existing unverified legacy account saves context during real password login and must verify", async () => {
  const f = await invited(false);
  await db.user.update({
    where: { id: f.u.id },
    data: {
      pendingPilotInvitationId: null,
      pendingPilotInvitationVersion: null,
    },
  });
  const context = cookiesFrom(
    await call("/api/pilot/context", { token: f.invite.token }),
  );
  const signed = await login(f.u.email, context);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: f.u.id } }))
      .pendingPilotInvitationId,
    f.invite.invitation.id,
  );
  assert.match(
    await (await call("/pilot", undefined, signed)).text(),
    /ไปยืนยันอีเมล/,
  );
  assert.equal((await call("/api/pilot/claim", {}, signed)).status, 403);
  assert.equal(
    (await call("/api/pilot/waitlist", { action: "join" }, signed)).status,
    403,
  );
});

test("Pilot B: claim retries reserve once; HTTP setup activates one empty store with original deadline and Pro features", async () => {
  const f = await invited();
  const grants = await Promise.all([claim(f), claim(f)]);
  assert.equal(grants[0].enrollmentId, grants[1].enrollmentId);
  const input = {
    requestKey: randomUUID(),
    name: "My empty store",
    businessType: "RETAIL_SHOP",
    pin: "846295",
    confirmPin: "846295",
    pilotEnrollmentId: grants[0].enrollmentId,
  };
  const replies = await Promise.all([
    call("/api/onboarding", input, f.cookie),
    call("/api/onboarding", input, f.cookie),
  ]);
  for (const reply of replies)
    assert.equal(reply.status, 201, await reply.clone().text());
  const first = await replies[0].json(),
    second = await replies[1].json();
  assert.equal(first.slug, second.slug);
  const t = await db.tenant.findUniqueOrThrow({ where: { slug: first.slug } });
  assert.equal(await db.product.count({ where: { tenantId: t.id } }), 0);
  assert.equal(await db.saasPayment.count({ where: { tenantId: t.id } }), 0);
  const original = await db.pilotEnrollment.findUniqueOrThrow({
    where: { id: grants[0].enrollmentId },
  });
  assert.equal(+original.endsAt! - +original.activatedAt!, 30 * 86400000);
  await claim(f);
  const retried = await db.pilotEnrollment.findUniqueOrThrow({
    where: { id: original.id },
  });
  assert.equal(+retried.endsAt!, +original.endsAt!);
  const bootstrap = await (
    await call(`/api/v1/${t.slug}/bootstrap`, undefined, f.cookie)
  ).json();
  assert.equal(bootstrap.entitlement.source, "PILOT");
  assert.equal(bootstrap.tenant.maxBranches, 3);
  assert.equal(bootstrap.tenant.enableKds, true);
  assert.equal(bootstrap.release.checkoutAvailable, false);
  const billing = await (
    await call(`/${t.slug}/billing`, undefined, f.cookie)
  ).text();
  assert(!billing.includes("/subscribe?plan="));
  assert.equal(
    (
      await call(
        "/api/onboarding",
        { ...input, requestKey: randomUUID() },
        f.cookie,
      )
    ).status,
    409,
  );
});

test("Pilot B: the owner explicitly activates the existing trial shop; foreign and paid shops are rejected", async () => {
  const f = await invited(),
    grant = await claim(f),
    t = await tenant(f.u.id),
    foreign = await tenant((await user()).id);
  const data = { enrollmentId: grant.enrollmentId, tenantId: foreign.id };
  assert.equal((await call("/api/pilot/activate", data, f.cookie)).status, 404);
  const paid = await tenant(f.u.id);
  await db.tenant.update({
    where: { id: paid.id },
    data: { planCode: "PRO_MONTHLY", subscriptionStatus: "ACTIVE" },
  });
  assert.equal(
    (
      await call(
        "/api/pilot/activate",
        { ...data, tenantId: paid.id },
        f.cookie,
      )
    ).status,
    409,
  );
  const before = await db.tenant.findUniqueOrThrow({
    where: { id: t.id },
    include: { branches: true, staffMembers: true },
  });
  assert.equal(
    (await call("/api/pilot/activate", { ...data, tenantId: t.id }, f.cookie))
      .status,
    200,
  );
  assert.deepEqual(
    await db.tenant.findUniqueOrThrow({
      where: { id: t.id },
      include: { branches: true, staffMembers: true },
    }),
    before,
  );
  assert.equal(
    (await call("/api/pilot/activate", { ...data, tenantId: t.id }, f.cookie))
      .status,
    200,
  );
});

test("Pilot B: waitlist is verified, self-service, idempotent, withdrawable and never creates trial or marketing consent", async () => {
  const u = await user();
  const before = await db.tenant.count();
  await call("/pilot/waitlist", undefined, u.cookie);
  assert.equal(
    await db.pilotWaitlistEntry.count({ where: { userId: u.id } }),
    0,
  );
  const replies = await Promise.all([
    call("/api/pilot/waitlist", { action: "join" }, u.cookie),
    call("/api/pilot/waitlist", { action: "join" }, u.cookie),
  ]);
  for (const reply of replies) assert.equal(reply.status, 200);
  const entry = await db.pilotWaitlistEntry.findUniqueOrThrow({
    where: { userId: u.id },
  });
  assert.equal(entry.notifyConsentAt, null);
  assert.equal(
    (await call("/api/pilot/waitlist", { action: "withdraw" }, u.cookie))
      .status,
    200,
  );
  assert.equal(
    (await db.pilotWaitlistEntry.findUniqueOrThrow({ where: { id: entry.id } }))
      .status,
    "WITHDRAWN",
  );
  await call("/api/pilot/waitlist", { action: "join" }, u.cookie);
  assert.equal(
    (await db.pilotWaitlistEntry.findUniqueOrThrow({ where: { userId: u.id } }))
      .id,
    entry.id,
  );
  assert.equal(await db.tenant.count(), before);
});

test("Pilot B: private admission ignores old plan intent and blocks direct new trial and checkout paths", async () => {
  const u = await user(true, "PRO_YEARLY");
  assert.equal(
    new URL(
      (await call("/start", undefined, u.cookie)).headers.get("location")!,
      base,
    ).pathname,
    "/pilot/waitlist",
  );
  assert.equal(
    new URL(
      (await call("/onboarding?new=1", undefined, u.cookie)).headers.get(
        "location",
      )!,
      base,
    ).pathname,
    "/pilot",
  );
  assert.equal(
    (await call("/api/billing/intent", { plan: "PRO_YEARLY" }, u.cookie, "PUT"))
      .status,
    403,
  );
  const input = {
    requestKey: randomUUID(),
    name: "Bypass",
    businessType: "RETAIL_SHOP",
    pin: "846295",
    confirmPin: "846295",
  };
  assert.equal((await call("/api/onboarding", input, u.cookie)).status, 403);
  assert.equal((await call("/api/pilot/claim", {}, u.cookie)).status, 403);
  const t = await tenant(u.id);
  assert.equal(
    (
      await call(
        "/api/billing/quote",
        { storeSlug: t.slug, planCode: "STARTER_MONTHLY" },
        u.cookie,
      )
    ).status,
    403,
  );
  for (const method of ["STRIPE_CARD", "STRIPE_PROMPTPAY", "BANK_SLIP"])
    assert.equal(
      (
        await call(
          "/api/billing/checkout",
          {
            storeSlug: t.slug,
            requestKey: randomUUID(),
            planCode: "STARTER_MONTHLY",
            method,
            confirmedTotal: 21293,
          },
          u.cookie,
        )
      ).status,
      403,
    );
});

test("Pilot B: expired, revoked, rotated, wrong-email and tampered contexts fail closed", async () => {
  const f = await invited(),
    outsider = await user();
  const context = f.cookie
    .split("; ")
    .find((c) => c.startsWith("buzlike-pilot-context="))!;
  assert.equal(
    (await call("/api/pilot/claim", {}, `${outsider.cookie}; ${context}`))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/pilot/claim",
        {},
        `${outsider.cookie}; buzlike-pilot-context=invalid`,
      )
    ).status,
    403,
  );
  await db.pilotInvitation.update({
    where: { id: f.invite.invitation.id },
    data: { tokenVersion: { increment: 1 } },
  });
  assert.equal((await call("/api/pilot/claim", {}, f.cookie)).status, 400);
  await db.pilotInvitation.update({
    where: { id: f.invite.invitation.id },
    data: {
      createdAt: new Date(Date.now() - 8 * 86400000),
      expiresAt: new Date(Date.now() - 86400000),
    },
  });
  assert.equal(
    (await call("/api/pilot/context", { token: f.invite.token })).status,
    410,
  );
  const revoked = await invited();
  await db.pilotInvitation.update({
    where: { id: revoked.invite.invitation.id },
    data: { revokedAt: new Date() },
  });
  assert.equal(
    (await call("/api/pilot/claim", {}, revoked.cookie)).status,
    400,
  );
  assert.equal(
    (await call("/api/pilot/context", { token: "0".repeat(64) })).status,
    410,
  );
});

test("Pilot B: claim across tabs reaches exactly five capacity slots and full clients have a waitlist exit", async () => {
  const c = await campaign(),
    fixtures = [];
  for (let i = 0; i < 7; i++) {
    const u = await user(),
      invite = await pilot.issuePilotInvitation(adminId, c.id, u.email);
    const ctx = await call(
      "/api/pilot/context",
      { token: invite.token },
      u.cookie,
    );
    fixtures.push(`${u.cookie}; ${cookiesFrom(ctx)}`);
  }
  const replies = await Promise.all(
    fixtures.map((session) => call("/api/pilot/claim", {}, session)),
  );
  assert.equal(replies.filter((r) => r.status === 200).length, 5);
  assert.equal(replies.filter((r) => r.status === 409).length, 2);
  assert.equal(
    await db.pilotEnrollment.count({ where: { campaignId: c.id } }),
    5,
  );
  assert.match(
    await (await call("/pilot", undefined, fixtures[6])).text(),
    /ดูการลงทะเบียนรอ/,
  );
});

test("Pilot B: expired reservations cannot open a shop; reclaim reuses the original owner slot", async () => {
  const f = await invited(),
    first = await claim(f);
  await db.pilotEnrollment.update({
    where: { id: first.enrollmentId },
    data: {
      status: "RELEASED",
      reservedUntil: new Date(Date.now() - 1000),
      version: { increment: 1 },
    },
  });
  const input = {
    requestKey: randomUUID(),
    name: "Expired reservation",
    businessType: "RETAIL_SHOP",
    pin: "846295",
    confirmPin: "846295",
    pilotEnrollmentId: first.enrollmentId,
  };
  assert.equal((await call("/api/onboarding", input, f.cookie)).status, 409);
  assert.equal(await db.tenant.count({ where: { ownerId: f.u.id } }), 0);
  const renewed = await claim(f);
  assert.equal(renewed.enrollmentId, first.enrollmentId);
  assert.equal(
    await db.pilotEnrollment.count({
      where: { ownerId: f.u.id, campaignId: f.c.id },
    }),
    1,
  );
});

test("Pilot B: explicit pilot signup retains waitlist wording in LEGACY and claim rate limiting is enforced", async () => {
  await db.releaseSettings.update({
    where: { id: "platform" },
    data: { releaseMode: "LEGACY", checkoutMode: "PUBLIC" },
  });
  try {
    const html = await (
      await call("/register?next=%2Fpilot%2Fwaitlist")
    ).text();
    assert.match(html, /ลงทะเบียนรอเปิดบริการ/);
    assert(!html.includes("ทดลองใช้ฟรี 14 วัน"));
  } finally {
    await db.releaseSettings.update({
      where: { id: "platform" },
      data: { releaseMode: "PRIVATE_PILOT", checkoutMode: "DISABLED" },
    });
  }
  const f = await invited();
  for (let i = 0; i < 15; i++)
    assert.equal((await call("/api/pilot/claim", {}, f.cookie)).status, 200);
  assert.equal((await call("/api/pilot/claim", {}, f.cookie)).status, 429);
  assert.equal(
    await db.pilotEnrollment.count({ where: { ownerId: f.u.id } }),
    1,
  );
});

test("Pilot B: request origin and authentication protect every mutating admission endpoint", async () => {
  for (const route of ["context", "claim", "activate", "waitlist"]) {
    assert.equal(
      (
        await call(
          `/api/pilot/${route}`,
          {},
          "",
          "POST",
          "https://outside.example",
        )
      ).status,
      403,
    );
  }
  assert.equal(
    (await call("/api/pilot/waitlist", { action: "join" })).status,
    401,
  );
  assert.equal((await call("/api/pilot/claim", {})).status, 401);
});

after(async () => {
  if (server && server.exitCode === null) {
    await new Promise<void>((resolve) => {
      server!.once("exit", () => resolve());
      server!.kill();
      setTimeout(resolve, 3000);
    });
  }
  if (db) await db.$disconnect();
  await root.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await root.$disconnect();
});
