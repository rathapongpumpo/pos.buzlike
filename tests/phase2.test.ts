import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { compare } from "bcryptjs";
import { db } from "../src/lib/db";
import { decryptMail } from "../src/lib/email-outbox";
import { tokenHash } from "../src/lib/account-tokens";
import { safeNext } from "../src/lib/account-links";
const base = process.env.TEST_BASE_URL ?? "http://localhost:3100",
  run = randomUUID();
const password = "Phase2-QA-Password!",
  users: string[] = [],
  emails: string[] = [],
  tenantIds: string[] = [];
let userId = "",
  cookie = "",
  email = "",
  slug = "",
  branchA = "",
  branchB = "";
const call = (
  path: string,
  body?: object,
  authCookie = cookie,
  method = "POST",
) =>
  fetch(base + path, {
    method: body === undefined ? "GET" : method,
    headers: {
      Cookie: authCookie,
      Origin: base,
      "Content-Type": "application/json",
      "X-Forwarded-For": `2001:db8:2::${run.slice(0, 8)}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
async function session(id: string, version = 0) {
  return `authjs.session-token=${await encode({ token: { sub: id, sessionVersion: version }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token", maxAge: 3600 })}`;
}
async function mailToken(address: string, starts = "account:") {
  const row = await db.emailOutbox.findFirstOrThrow({
    where: {
      to: address,
      dedupeKey: { startsWith: starts },
      encryptedText: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  const text = decryptMail(row.encryptedText!);
  const token = new URL(text.match(/http[^\s]+/)![0]).searchParams.get(
    "token",
  )!;
  assert.ok(!row.text.includes(token));
  assert.ok(!row.encryptedText!.includes(token));
  return token;
}
async function signup(prefix: string) {
  const address = `phase2-${prefix}-${run}@example.test`;
  emails.push(address);
  const result = await call(
    "/api/auth/register",
    { email: address, password, confirmPassword: password },
    "",
  );
  assert.equal(result.status, 201, await result.clone().text());
  const id = (await result.json()).id;
  users.push(id);
  return { id, email: address, cookie: await session(id) };
}
test("Phase 2: new accounts wait for email verification; link is private, expires, is single-use and resend invalidates the old link", async () => {
  const user = await signup("owner");
  ({ id: userId, email, cookie } = user);
  assert.equal(
    new URL((await call("/start")).headers.get("location")!, base).pathname,
    "/verify-email",
  );
  const input = {
    requestKey: randomUUID(),
    name: "ร้านทดสอบเฟสสอง",
    businessType: "RETAIL_SHOP",
    pin: "827146",
    confirmPin: "827146",
  };
  assert.equal((await call("/api/onboarding", input)).status, 403);
  const first = await mailToken(email);
  assert.equal(
    (await call("/api/account/resend-verification", {})).status,
    200,
  );
  const second = await mailToken(email);
  assert.notEqual(first, second);
  assert.equal(
    (await call("/api/account/verify-email", { token: first }, "")).status,
    400,
  );
  await db.accountToken.update({
    where: { tokenHash: tokenHash(second) },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal(
    (await call("/api/account/verify-email", { token: second }, "")).status,
    400,
  );
  await call("/api/account/resend-verification", {});
  const valid = await mailToken(email);
  const responses = await Promise.all([
    call("/api/account/verify-email", { token: valid }, ""),
    call("/api/account/verify-email", { token: valid }, ""),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400]);
  assert.ok(
    (await db.user.findUniqueOrThrow({ where: { id: userId } }))
      .emailVerifiedAt,
  );
  assert.equal(
    (await call("/api/account/resend-verification", {})).status,
    200,
  );
  assert.equal(
    (await call("/api/account/resend-verification", {})).status,
    429,
  );
});
test("Phase 2: onboarding draft rejects stale tabs, keeps no PIN, and concurrent/lost-response retries produce one empty store", async () => {
  const requestKey = randomUUID(),
    input = {
      requestKey,
      version: 0,
      name: "ร้านทดสอบเฟสสอง",
      businessType: "RETAIL_SHOP",
    };
  const saved = await call("/api/onboarding/draft", input, cookie, "PUT");
  assert.equal(saved.status, 200);
  const draft = (await saved.json()).draft;
  assert.equal(draft.version, 1);
  assert.equal(
    (await call("/api/onboarding/draft", input, cookie, "PUT")).status,
    409,
  );
  const loaded = await (await call("/api/onboarding/draft")).json();
  assert.equal(loaded.draft.name, input.name);
  assert.ok(!JSON.stringify(loaded).includes("pin"));
  const body = {
    requestKey,
    name: input.name,
    businessType: input.businessType,
    pin: "827146",
    confirmPin: "827146",
  };
  const responses = await Promise.all(
    Array.from({ length: 4 }, () => call("/api/onboarding", body)),
  );
  assert.ok(
    responses.every((r) => r.status === 201),
    JSON.stringify(await Promise.all(responses.map((r) => r.clone().text()))),
  );
  const results = await Promise.all(responses.map((r) => r.json()));
  slug = results[0].slug;
  assert.ok(results.every((r) => r.slug === slug));
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug } });
  tenantIds.push(tenant.id);
  assert.equal(await db.tenant.count({ where: { ownerId: userId } }), 1);
  assert.equal(await db.product.count({ where: { tenantId: tenant.id } }), 0);
  assert.equal(
    (await call("/api/onboarding", { ...body, name: "เปลี่ยนคำขอเดิม" }))
      .status,
    409,
  );
  assert.equal((await call("/api/onboarding", body)).status, 201);
  assert.equal(
    (await (await call("/api/onboarding/draft")).json()).draft.completedSlug,
    slug,
  );
  branchA = (
    await db.storeBranch.findFirstOrThrow({ where: { tenantId: tenant.id } })
  ).id;
  await db.tenant.update({
    where: { id: tenant.id },
    data: { maxBranches: 5, maxStaff: 10 },
  });
  branchB = (
    await db.storeBranch.create({
      data: { tenantId: tenant.id, name: "สาขาสอง" },
    })
  ).id;
});
test("Phase 2: password reset is generic, validates confirmation/expiry, consumes once, revokes every old session and supports real login", async () => {
  const missing = await call(
    "/api/account/forgot-password",
    { email: `missing-${run}@example.test` },
    "",
  );
  const known = await call("/api/account/forgot-password", { email }, "");
  assert.equal(await missing.text(), await known.text());
  const expired = await mailToken(email);
  await db.accountToken.update({
    where: { tokenHash: tokenHash(expired) },
    data: { expiresAt: new Date(0) },
  });
  assert.equal(
    (
      await call(
        "/api/account/reset-password",
        { token: expired, password, confirmPassword: password },
        "",
      )
    ).status,
    400,
  );
  await call("/api/account/forgot-password", { email }, "");
  const reset = await mailToken(email);
  assert.equal(
    (
      await call(
        "/api/account/reset-password",
        {
          token: reset,
          password: "a".repeat(73),
          confirmPassword: "a".repeat(73),
        },
        "",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/api/account/reset-password",
        {
          token: reset,
          password: "New-Phase2-Password!",
          confirmPassword: "wrong",
        },
        "",
      )
    ).status,
    400,
  );
  const result = await call(
    "/api/account/reset-password",
    {
      token: reset,
      password: "New-Phase2-Password!",
      confirmPassword: "New-Phase2-Password!",
    },
    "",
  );
  assert.equal(result.status, 200);
  assert.equal(
    (
      await call(
        "/api/account/reset-password",
        { token: reset, password, confirmPassword: password },
        "",
      )
    ).status,
    400,
  );
  assert.equal((await call("/api/onboarding/draft")).status, 401);
  const updated = await db.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(updated.sessionVersion, 1);
  assert.ok(await compare("New-Phase2-Password!", updated.passwordHash!));
  const csrf = await call("/api/auth/csrf", undefined, "");
  const csrfToken = (await csrf.json()).csrfToken;
  const login = await fetch(base + "/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      Cookie: csrf.headers
        .getSetCookie()
        .map((s) => s.split(";")[0])
        .join("; "),
      Origin: base,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password: "New-Phase2-Password!",
      callbackUrl: base + "/start",
    }),
    redirect: "manual",
  });
  cookie = login.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
  assert.ok(cookie.includes("session-token="));
  assert.equal(
    (await call(`/api/v1/${slug}/bootstrap?branchId=${branchA}`)).status,
    200,
  );
});
test("Phase 2: invitations require owner, bind email and branch, survive signup verification, and accept only once", async () => {
  const invited = await signup("staff");
  assert.equal(
    (
      await (
        await call("/api/onboarding/draft", undefined, invited.cookie)
      ).json()
    ).error,
    "กรุณายืนยันอีเมล",
  );
  const body = {
    storeSlug: slug,
    branchId: branchA,
    email: invited.email,
    displayName: "พนักงานรับเชิญ",
    role: "CASHIER",
    branchIds: [branchA],
  };
  assert.equal(
    (await call("/api/invitations/create", body, invited.cookie)).status,
    403,
  );
  assert.equal((await call("/api/invitations/create", body)).status, 200);
  const token = await mailToken(invited.email, "invite:");
  assert.equal(
    (
      await call("/api/invitations/accept", {
        token,
        pin: "741852",
        confirmPin: "741852",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/invitations/accept",
        { token, pin: "741852", confirmPin: "741852" },
        invited.cookie,
      )
    ).status,
    403,
  );
  await call(
    "/api/account/verify-email",
    { token: await mailToken(invited.email) },
    "",
  );
  const result = await call(
    "/api/invitations/accept",
    { token, pin: "741852", confirmPin: "741852" },
    invited.cookie,
  );
  assert.equal(result.status, 200, await result.clone().text());
  assert.equal(
    (
      await call(
        "/api/invitations/accept",
        { token, pin: "741852", confirmPin: "741852" },
        invited.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `/api/v1/${slug}/bootstrap?branchId=${branchA}`,
        undefined,
        invited.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        `/api/v1/${slug}/bootstrap?branchId=${branchB}`,
        undefined,
        invited.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/invitations/list?storeSlug=" + slug,
        undefined,
        invited.cookie,
      )
    ).status,
    403,
  );
  assert.equal((await call("/api/invitations/create", body)).status, 409);
  assert.equal(safeNext("https://evil.example/"), "/start");
  assert.equal(safeNext(`/invite?token=${token}`), `/invite?token=${token}`);
});
test("Phase 2: resend/revoke/expiry prevent accepting an old invitation, and tenant-scoped administration cannot cross stores", async () => {
  const address = `phase2-revoke-${run}@example.test`;
  emails.push(address);
  assert.equal(
    (
      await call("/api/invitations/create", {
        storeSlug: slug,
        branchId: branchA,
        email: address,
        displayName: "รอตอบรับ",
        role: "CASHIER",
        branchIds: [branchB],
      })
    ).status,
    200,
  );
  const first = await mailToken(address, "invite:");
  const invite = await db.staffInvitation.findFirstOrThrow({
    where: { email: address },
  });
  const other = await db.tenant.create({
    data: {
      ownerId: userId,
      name: "ร้านอีกแห่ง",
      slug: `phase2-other-${run}`,
      trialEndsAt: new Date(Date.now() + 86400000),
    },
  });
  tenantIds.push(other.id);
  await db.storeBranch.create({
    data: { tenantId: other.id, name: "สาขาหลัก" },
  });
  await db.staffMember.create({
    data: {
      tenantId: other.id,
      userId,
      role: "OWNER",
      displayName: "เจ้าของร้าน",
      pinCodeHash: "TEST_ONLY",
    },
  });
  assert.equal(
    (
      await call("/api/invitations/revoke", {
        storeSlug: other.slug,
        id: invite.id,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call("/api/invitations/resend", {
        storeSlug: slug,
        branchId: branchA,
        id: invite.id,
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/api/invitations/preview", { token: first }, "")).status,
    400,
  );
  const next = await mailToken(address, "invite:");
  await db.staffInvitation.update({
    where: { id: invite.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal(
    (await call("/api/invitations/preview", { token: next }, "")).status,
    400,
  );
  await call("/api/invitations/resend", {
    storeSlug: slug,
    branchId: branchA,
    id: invite.id,
  });
  const last = await mailToken(address, "invite:");
  await call("/api/invitations/revoke", {
    storeSlug: slug,
    branchId: branchA,
    id: invite.id,
  });
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug } });
  await db.tenant.update({ where: { id: tenant.id }, data: { maxStaff: 2 } });
  assert.equal(
    (
      await call("/api/invitations/resend", {
        storeSlug: slug,
        branchId: branchA,
        id: invite.id,
      })
    ).status,
    402,
  );
  await db.tenant.update({ where: { id: tenant.id }, data: { maxStaff: 10 } });
  assert.equal(
    (await call("/api/invitations/preview", { token: last }, "")).status,
    400,
  );
  assert.equal(
    (await call("/api/account/forgot-password", { email }, "", "POST")).status,
    200,
  );
  assert.equal(
    (await call("/api/account/forgot-password", { email }, "", "POST")).status,
    429,
  );
});
after(async () => {
  await db.emailOutbox.deleteMany({ where: { to: { in: emails } } });
  for (const tenantId of tenantIds) {
    await db.order.deleteMany({ where: { tenantId } });
    await db.cashierShift.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  }
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.rateLimit.deleteMany({
    where: {
      OR: [
        { key: { contains: run } },
        { key: { in: users.map((id) => `verify:${id}`) } },
      ],
    },
  });
  await db.$disconnect();
});
