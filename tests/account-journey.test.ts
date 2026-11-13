import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { db } from "../src/lib/db";
import { provisionEmptyTenant } from "../src/lib/provision";
import { staffCookie } from "../src/lib/staff-session";
import { decryptMail } from "../src/lib/email-outbox";

const base = process.env.TEST_BASE_URL ?? "http://localhost:3100";
const runId = randomUUID();
const email = `journey-${runId}@example.test`;
const password = `QA-${randomUUID()}-only`;
const ip = `2001:db8:1::${runId.slice(0, 8)}`;
const userIds: string[] = [];
const tenantIds: string[] = [];
let userId = "",
  signed = "",
  owner = "",
  ownerId = "",
  slug = "",
  tenantId = "";
const request = (path: string, cookie = "") =>
  fetch(base + path, { headers: { Cookie: cookie }, redirect: "manual" });
const cookiesFrom = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
const location = (res: Response) =>
  new URL(res.headers.get("location")!, base).pathname;
async function token(id: string, maxAge = 3600) {
  return `authjs.session-token=${await encode({ token: { sub: id }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token", maxAge })}`;
}
async function createStore(id: string, name: string) {
  const tenant = await db.tenant.create({
    data: {
      ownerId: id,
      name,
      slug: `journey-${randomUUID()}`,
      trialEndsAt: new Date(Date.now() + 86400000),
    },
  });
  tenantIds.push(tenant.id);
  await db.$transaction(
    (tx) =>
      provisionEmptyTenant(
        tx,
        tenant.id,
        "619472",
        id,
        "เจ้าของร้าน",
        "",
        "NONE",
      ),
    { timeout: 30000 },
  );
  return tenant;
}
before(async () => {
  const response = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      "X-Forwarded-For": ip,
    },
    body: JSON.stringify({ email, password, confirmPassword: password }),
  });
  assert.equal(response.status, 201);
  userId = (await response.json()).id;
  userIds.push(userId);
  const verificationMail = await db.emailOutbox.findFirstOrThrow({ where: { userId, encryptedText: { not: null } } });
  const verificationToken = new URL(decryptMail(verificationMail.encryptedText!).match(/http[^\s]+/)![0]).searchParams.get("token");
  const verified = await fetch(base + "/api/account/verify-email", { method: "POST", headers: { "Content-Type": "application/json", Origin: base, "X-Forwarded-For": ip }, body: JSON.stringify({token: verificationToken}) });
  assert.equal(verified.status, 200);
  signed = await token(userId);
  const ownerUser = await db.user.create({
    data: { email: `owner-${runId}@example.test`, fullName: "Journey owner" },
  });
  ownerId = ownerUser.id;
  userIds.push(ownerId);
  owner = await token(ownerId);
  const tenant = await createStore(ownerId, "ร้านแรกสำหรับทดสอบเส้นทาง");
  slug = tenant.slug;
  tenantId = tenant.id;
});

test("Account journey: guests and expired sessions see signup/login; protected entry requires login", async () => {
  for (const path of ["/", "/pricing"]) {
    const response = await request(path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /href="\/login"/);
    assert.match(html, /href="\/register"/);
    assert.ok(!html.includes("มีเมนูตัวอย่างให้ลองขาย"));
    assert.ok(!html.includes("ระบบเตรียมเมนูตัวอย่าง"));
  }
  for (const path of ["/login", "/register"])
    assert.equal((await request(path)).status, 200);
  for (const path of ["/start", "/onboarding", `/${slug}/pos`, "/superadmin"]) {
    assert.equal(location(await request(path)), "/login");
  }
  const expired = await token(userId, -60);
  assert.equal(location(await request("/start", expired)), "/login");
  assert.match(await (await request("/", expired)).text(), /href="\/login"/);
});

test("Account journey: actual credentials login rejects wrong passwords and creates a usable session", async () => {
  for (const correct of [false, true]) {
    const csrf = await request("/api/auth/csrf");
    const { csrfToken } = await csrf.json();
    const response = await fetch(base + "/api/auth/callback/credentials", {
      method: "POST",
      redirect: "manual",
      headers: {
        Cookie: cookiesFrom(csrf),
        Origin: base,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Auth-Return-Redirect": "1",
      },
      body: new URLSearchParams({
        csrfToken,
        email: email.toUpperCase(),
        password: correct ? password : "wrong-password",
        callbackUrl: base + "/start",
      }),
    });
    const result = await response.json();
    if (!correct) {
      assert.match(result.url, /error=CredentialsSignin/);
      assert.ok(!cookiesFrom(response).includes("authjs.session-token="));
    } else {
      assert.equal(new URL(result.url).pathname, "/start");
      const actualSession = cookiesFrom(response);
      assert.ok(actualSession.includes("authjs.session-token="));
      assert.equal(
        (await (await request("/api/auth/session", actualSession)).json()).user
          .id,
        userId,
      );
      assert.equal(
        location(await request("/start", actualSession)),
        "/onboarding",
      );
    }
  }
});

test("Account journey: signed-in new accounts resume setup everywhere and never see signup/login actions", async () => {
  for (const path of ["/", "/pricing"]) {
    const response = await request(path, signed);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /ตั้งร้านต่อ/);
    assert.match(html, /href="\/onboarding"/);
    assert.ok(!/href="\/(login|register)"/.test(html));
  }
  for (const path of ["/login", "/register"])
    assert.equal(location(await request(path, signed)), "/start");
  assert.equal(location(await request("/start", signed)), "/onboarding");
  const setup = await request("/onboarding", signed);
  assert.equal(setup.status, 200);
  assert.match(await setup.text(), /ขั้นตอน.*ตั้งค่าร้าน/);
});

test("Account journey: existing empty stores resume Products; intentional extra-store setup and picker work", async () => {
  assert.equal(location(await request("/start", owner)), `/${slug}/start`);
  assert.equal(
    location(await request(`/${slug}/start`, owner)),
    `/${slug}/products`,
  );
  assert.equal(location(await request("/onboarding", owner)), "/start");
  assert.equal((await request("/onboarding?new=1", owner)).status, 200);
  assert.equal((await request("/start?switch=1", owner)).status, 200);
  const category = await db.category.create({
    data: { tenantId, name: "สินค้าจริง" },
  });
  await db.product.create({
    data: {
      tenantId,
      categoryId: category.id,
      sku: "SELF-001",
      name: "สินค้าของร้าน",
      price: 45,
      trackStockType: "NONE",
    },
  });
  assert.equal(
    location(await request(`/${slug}/start`, owner)),
    `/${slug}/pos`,
  );
  const second = await createStore(ownerId, "ร้านที่สองสำหรับทดสอบเส้นทาง");
  const picker = await request("/start", owner);
  assert.equal(picker.status, 200);
  const html = await picker.text();
  assert.ok(html.includes(`href="/${slug}/start"`));
  assert.ok(html.includes(`href="/${second.slug}/start"`));
  assert.ok(!html.includes(email));
  await db.staffMember.updateMany({
    where: { tenantId: second.id, userId: ownerId },
    data: { isActive: false },
  });
  assert.equal(location(await request("/start", owner)), `/${slug}/start`);
});

test("Account journey: entry follows operator role; forbidden pages have a safe exit instead of billing loops", async () => {
  for (const [role, destination] of [
    ["KITCHEN", "kds"],
    ["WAITER", "tables"],
    ["CASHIER", "pos"],
  ] as const) {
    const staff = await db.staffMember.create({
      data: {
        tenantId,
        displayName: role,
        role,
        pinCodeHash: "unused-for-signed-cookie-test",
        branchAccess: {
          create: {
            branchId: (
              await db.storeBranch.findFirstOrThrow({ where: { tenantId } })
            ).id,
          },
        },
      },
    });
    const cookie = `${owner}; pos-staff-${tenantId}=${staffCookie(staff.id, ownerId, tenantId)}`;
    assert.equal(
      location(await request(`/${slug}/start`, cookie)),
      `/${slug}/${destination}`,
    );
    const forbidden = await (await request(`/${slug}/settings`, cookie)).text();
    assert.ok(forbidden.includes("ไม่มีสิทธิ์ทำรายการนี้"));
    assert.ok(forbidden.includes('href="/start?switch=1"'));
    assert.ok(!forbidden.includes(`href="/${slug}/billing"`));
  }
  await db.tenant.update({
    where: { id: tenantId },
    data: { subscriptionStatus: "SUSPENDED" },
  });
  const suspended = await (await request(`/${slug}/start`, owner)).text();
  assert.ok(suspended.includes("ร้านค้าถูกระงับการใช้งาน"));
  assert.ok(suspended.includes('href="/start?switch=1"'));
  assert.equal(
    (await request("/no-such-journey-store/pos", owner)).status,
    404,
  );
  await db.tenant.update({
    where: { id: tenantId },
    data: { subscriptionStatus: "TRIALING" },
  });
});

test("Account journey: platform admins enter admin; removed users become guests; signout clears account and operator cookies", async () => {
  const admin = await db.user.create({
    data: {
      email: `admin-${runId}@example.test`,
      fullName: "Journey admin",
      systemRole: "SUPER_ADMIN",
    },
  });
  userIds.push(admin.id);
  const adminCookie = await token(admin.id);
  assert.equal(location(await request("/start", adminCookie)), "/superadmin");
  assert.equal(
    location(await request("/onboarding", adminCookie)),
    "/superadmin",
  );
  const html = await (await request("/", adminCookie)).text();
  assert.match(html, /จัดการแพลตฟอร์ม/);
  assert.ok(!/href="\/(login|register)"/.test(html));
  const removed = await db.user.create({
    data: { email: `removed-${runId}@example.test`, fullName: "Removed QA" },
  });
  const removedCookie = await token(removed.id);
  await db.user.delete({ where: { id: removed.id } });
  assert.equal(location(await request("/start", removedCookie)), "/login");
  assert.equal(
    await (await request("/api/auth/session", removedCookie)).json(),
    null,
  );
  const csrf = await request("/api/auth/csrf", owner);
  const { csrfToken } = await csrf.json();
  const response = await fetch(base + "/api/auth/signout", {
    method: "POST",
    redirect: "manual",
    headers: {
      Cookie: `${owner}; ${cookiesFrom(csrf)}; pos-staff-${tenantId}=test-only-cookie`,
      Origin: base,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({ csrfToken, callbackUrl: base + "/" }),
  });
  assert.equal(response.status, 200);
  const cleared = response.headers.getSetCookie();
  assert.ok(
    cleared.some((cookie) => cookie.startsWith("authjs.session-token=;")),
  );
  assert.ok(
    cleared.some(
      (cookie) =>
        cookie.startsWith(`pos-staff-${tenantId}=;`) &&
        (cookie.includes("Max-Age=0") ||
          cookie.includes("Expires=Thu, 01 Jan 1970")),
    ),
  );
  const endedCookie = cookiesFrom(response);
  assert.equal(
    await (await request("/api/auth/session", endedCookie)).json(),
    null,
  );
  assert.equal(location(await request("/start", endedCookie)), "/login");
});

after(async () => {
  await db.product.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.rateLimit.deleteMany({
    where: { key: { in: [`register:${ip}`, `login:${email}`] } },
  });
  await db.$disconnect();
});
