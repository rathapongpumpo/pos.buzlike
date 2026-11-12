import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
const schema = "qa_pilot_c_" + randomUUID().replaceAll("-", "");
const root = new PrismaClient(),
  base = "http://localhost:3104",
  DAY = 86400000;
let db: typeof import("../src/lib/db").db;
let pilot: typeof import("../src/lib/pilot");
let ops: typeof import("../src/lib/pilot-operations");
let mail: typeof import("../src/lib/email-outbox");
let staffCookie: typeof import("../src/lib/staff-session").staffCookie;
let provision: typeof import("../src/lib/provision").provisionEmptyTenant;
let server: ChildProcess | undefined, adminId: string, adminCookie: string;
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
  process.env.AUTH_URL = base;
  ({ db } = await import("../src/lib/db"));
  pilot = await import("../src/lib/pilot");
  ops = await import("../src/lib/pilot-operations");
  mail = await import("../src/lib/email-outbox");
  ({ staffCookie } = await import("../src/lib/staff-session"));
  ({ provisionEmptyTenant: provision } = await import("../src/lib/provision"));
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
  adminCookie = await session(adminId);
  server = spawn(
    process.execPath,
    [
      path.resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3104",
    ],
    {
      env: {
        ...process.env,
        NEXT_PUBLIC_APP_URL: base,
        SMTP_HOST: "",
        SMTP_USER: "",
        SMTP_PASS: "",
        AUTH_GOOGLE_ID: "",
        AUTH_GOOGLE_SECRET: "",
        STRIPE_SECRET_KEY: "",
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(base + "/api/auth/session")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready, "Build first; port 3104 must be free");
});
async function session(id: string) {
  return `authjs.session-token=${await encode({ token: { sub: id, sessionVersion: 0 }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token", maxAge: 3600 })}`;
}
async function call(
  route: string,
  body?: object,
  cookie = adminCookie,
  origin: string | null = base,
) {
  return fetch(base + route, {
    method: body ? "POST" : "GET",
    redirect: "manual",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...(origin ? { Origin: origin } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function ok(response: Response) {
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
async function campaign() {
  const c = await pilot.createPilotCampaign(adminId, `c-${randomUUID()}`);
  return pilot.setCampaignStatus(adminId, c.id, "OPEN", c.version);
}
async function grant(days = 30) {
  const c = await campaign(),
    u = await db.user.create({
      data: {
        email: `c-${randomUUID()}@example.test`,
        fullName: "Pilot owner",
        emailVerifiedAt: new Date(),
      },
    });
  const invite = await pilot.issuePilotInvitation(adminId, c.id, u.email),
    reservation = await pilot.reservePilot(u.id, invite.token);
  const tenant = await db.tenant.create({
    data: {
      ownerId: u.id,
      name: "Pilot shop",
      slug: `c-${randomUUID()}`,
      trialEndsAt: new Date(Date.now() + 14 * DAY),
    },
  });
  const branch = await db.$transaction((tx) =>
    provision(tx, tenant.id, "846295", u.id, "Owner", "", "NONE"),
  );
  const now = await pilot.databaseTime(db),
    activatedAt = new Date(+now - (30 - days) * DAY),
    endsAt = new Date(+activatedAt + 30 * DAY);
  const enrollment = await db.pilotEnrollment.update({
    where: { id: reservation.id },
    data: {
      tenantId: tenant.id,
      activatedAt,
      endsAt,
      status: "ACTIVE",
      version: { increment: 1 },
    },
  });
  const owner = await db.staffMember.findFirstOrThrow({
    where: { tenantId: tenant.id, userId: u.id },
  });
  return {
    c,
    u,
    invite,
    tenant,
    branch,
    enrollment,
    owner,
    cookie: await session(u.id),
    endpoint: `/api/v1/${tenant.slug}/feedback?branchId=${branch.id}`,
  };
}
const feedback = (overrides = {}) => ({
  requestKey: randomUUID(),
  category: "BUG",
  message: "พบปัญหาที่หน้าขาย ต้องการให้ตรวจสอบ",
  pageKey: "pos",
  deviceClass: "MOBILE",
  ...overrides,
});
test("C: admin authentication, CSRF, version conflicts and no secret disclosure", async () => {
  const draft = await pilot.createPilotCampaign(adminId, `draft-${randomUUID()}`);
  assert.equal(draft.version, 0);
  await ok(await call("/api/admin/pilot", {action:"campaign", id:draft.id, version:0, status:"OPEN", reason:"เปิดจากฉบับร่างเพื่อทดสอบ"}));
  assert.equal((await call("/api/admin/pilot", undefined, "")).status, 401);
  const f = await grant();
  assert.equal(
    (await call("/api/admin/pilot", undefined, f.cookie)).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/admin/pilot",
        {
          action: "campaign",
          id: f.c.id,
          version: f.c.version,
          status: "PAUSED",
          reason: "ทดสอบเปลี่ยนสถานะ",
        },
        adminCookie,
        null,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/admin/pilot",
        {
          action: "campaign",
          id: f.c.id,
          version: f.c.version,
          status: "PAUSED",
          reason: "ทดสอบเปลี่ยนสถานะ",
        },
        adminCookie,
        "https://evil.test",
      )
    ).status,
    403,
  );
  const result = await ok(await call("/api/admin/pilot"));
  assert(!JSON.stringify(result).includes("tokenHash"));
  f.c = await db.pilotCampaign.findUniqueOrThrow({ where: { id: f.c.id } });
  await ok(
    await call("/api/admin/pilot", {
      action: "campaign",
      id: f.c.id,
      version: f.c.version,
      status: "PAUSED",
      reason: "ทดสอบเปลี่ยนสถานะ",
    }),
  );
  assert.equal(
    (
      await call("/api/admin/pilot", {
        action: "campaign",
        id: f.c.id,
        version: f.c.version,
        status: "OPEN",
        reason: "ทดสอบเปลี่ยนสถานะ",
      })
    ).status,
    409,
  );
});
test("C: invitation creation is atomic, encrypted, idempotent and rotates/revokes old context", async () => {
  const c = await campaign(),
    email = `invite-${randomUUID()}@example.test`,
    request = {
      action: "invite",
      campaignId: c.id,
      email,
      requestKey: randomUUID(),
      reason: "ทดสอบส่งคำเชิญ",
    };
  const responses = await Promise.all([
    call("/api/admin/pilot", request),
    call("/api/admin/pilot", request),
  ]);
  const a = await ok(responses[0]),
    b = await ok(responses[1]);
  assert.equal(a.id, b.id);
  let queued = await db.emailOutbox.findMany({
    where: { dedupeKey: { startsWith: `pilot-invite:${a.id}:` } },
  });
  assert.equal(queued.length, 1);
  assert(!queued[0].text.includes("token="));
  const content = mail.decryptMail(queued[0].encryptedText!);
  assert(content.includes(base + "/pilot/invite?token="));
  const token = content.match(/token=([a-f0-9]{64})/)![1];
  const u = await db.user.create({
    data: { email, fullName: "Invited", emailVerifiedAt: new Date() },
  });
  const reserved = await pilot.reservePilot(u.id, token);
  await ok(
    await call("/api/admin/pilot", {
      action: "resend",
      campaignId: c.id,
      id: a.id,
      version: 1,
      reason: "ส่งใหม่ตามคำขอ",
    }),
  );
  assert.equal(
    (await db.pilotEnrollment.findUniqueOrThrow({ where: { id: reserved.id } }))
      .status,
    "RELEASED",
  );
  await assert.rejects(() => pilot.reservePilot(u.id, token));
  await assert.rejects(() =>
    pilot.reservePilotContext(u.id, { invitationId: a.id, tokenVersion: 1 }),
  );
  const sent: string[] = [];
  await mail.flushEmailOutbox({
    send: async (m) => {
      sent.push(m.text);
    },
    onlyId: queued[0].id,
  });
  assert.equal(sent.length, 0);
  queued = await db.emailOutbox.findMany({
    where: { dedupeKey: `pilot-invite:${a.id}:2` },
  });
  const newToken = mail
    .decryptMail(queued[0].encryptedText!)
    .match(/token=([a-f0-9]{64})/)![1];
  await ok(
    await call("/api/admin/pilot", {
      action: "revokeInvitation",
      campaignId: c.id,
      id: a.id,
      version: 2,
      reason: "ยกเลิกคำเชิญทดสอบ",
    }),
  );
  await assert.rejects(() => pilot.reservePilot(u.id, newToken));
  await mail.flushEmailOutbox({
    send: async (m) => {
      sent.push(m.text);
    },
    onlyId: queued[0].id,
  });
  assert.equal(sent.length, 0);
  assert.equal(
    await db.pilotAuditEvent.count({
      where: { campaignId: c.id, action: { startsWith: "INVITATION_" } },
    }),
    3,
  );
});
test("C: duplicate feedback does not duplicate history; invalid payload, HTML and request collisions", async () => {
  const f = await grant(),
    payload = feedback({
      message: '<img src=x onerror="window.pwned=1"> ข้อความทดสอบ',
    });
  const [a, b] = await Promise.all([
    call(f.endpoint, payload, f.cookie),
    call(f.endpoint, payload, f.cookie),
  ]);
  const x = await ok(a),
    y = await ok(b);
  assert.equal(x.id, y.id);
  assert.equal(
    (
      await call(
        f.endpoint,
        { ...payload, message: "แก้ข้อความในคำขอเดิม" },
        f.cookie,
      )
    ).status,
    409,
  );
  for (const invalid of [
    feedback({ optionalRating: 6 }),
    feedback({ message: "x".repeat(2001) }),
    feedback({ tenantId: "foreign" }),
    feedback({ category: "INVALID" }),
  ])
    assert.equal((await call(f.endpoint, invalid, f.cookie)).status, 400);
  const result = await ok(await call(f.endpoint, undefined, f.cookie));
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].message, payload.message);
  assert.equal(
    (await call(f.endpoint, feedback(), f.cookie, null)).status,
    403,
  );
});
test("C: switched staff sees own reports in authorized branch, never background owner's reports", async () => {
  const f = await grant();
  await ok(await call(f.endpoint, feedback(), f.cookie));
  const other = await db.storeBranch.create({
    data: { tenantId: f.tenant.id, name: "สาขาสอง" },
  });
  const cashier = await db.staffMember.create({
    data: {
      tenantId: f.tenant.id,
      displayName: "Cashier",
      role: "CASHIER",
      pinCodeHash: "fixture",
    },
  });
  await db.staffBranchAccess.createMany({
    data: [f.branch.id, other.id].map((branchId) => ({
      tenantId: f.tenant.id,
      staffId: cashier.id,
      branchId,
    })),
  });
  const switched =
    f.cookie +
    `; pos-staff-${f.tenant.id}=${staffCookie(cashier.id, f.u.id, f.tenant.id)}`;
  const first = await ok(await call(f.endpoint, feedback(), switched));
  const secondEndpoint = `/api/v1/${f.tenant.slug}/feedback?branchId=${other.id}`;
  await ok(await call(secondEndpoint, feedback(), switched));
  const rows = (await ok(await call(f.endpoint, undefined, switched))).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, first.id);
  assert.equal(rows[0].submittedByStaffId, cashier.id);
  assert.equal(rows[0].submittedByUserId, f.u.id);
  assert.equal(
    (await ok(await call(f.endpoint, undefined, f.cookie))).rows.length,
    3,
  );
  await db.staffBranchAccess.delete({
    where: { staffId_branchId: { staffId: cashier.id, branchId: f.branch.id } },
  });
  assert.equal((await call(f.endpoint, undefined, switched)).status, 403);
  assert.equal((await call(f.endpoint, feedback(), switched)).status, 403);
  await db.staffMember.update({
    where: { id: cashier.id },
    data: { isActive: false },
  });
  assert.equal((await call(secondEndpoint, undefined, switched)).status, 403);
});
test("C: cross tenant/branch denied and expired pilot can still submit feedback", async () => {
  const f = await grant(-1),
    other = await grant();
  assert.equal((await call(other.endpoint, undefined, f.cookie)).status, 403);
  assert.equal(
    (
      await call(
        `/api/v1/${f.tenant.slug}/feedback?branchId=${other.branch.id}`,
        feedback(),
        f.cookie,
      )
    ).status,
    403,
  );
  await ok(await call(f.endpoint, feedback(), f.cookie));
  const { effectiveTenant } = await import("../src/lib/entitlements");
  assert.equal(
    (await effectiveTenant(f.tenant)).entitlement.state,
    "READ_ONLY",
  );
});
test("C: feedback transitions, public history, stale updates and admin filters", async () => {
  const f = await grant(),
    row = await ok(
      await call(f.endpoint, feedback({ optionalRating: 4 }), f.cookie),
    );
  await ok(
    await call("/api/admin/feedback", {
      id: row.id,
      expectedStatus: "NEW",
      expectedHistoryId: null,
      status: "TRIAGED",
      severity: "P1",
      note: "รับเรื่องและตรวจสอบแล้ว",
    }),
  );
  assert.equal(
    (
      await call("/api/admin/feedback", {
        id: row.id,
        expectedStatus: "NEW",
        expectedHistoryId: null,
        status: "RESOLVED",
        severity: "P1",
        note: "ข้อมูลเก่าจากอีกหน้าต่าง",
      })
    ).status,
    409,
  );
  const result = await ok(
    await call(
      `/api/admin/feedback?tenantId=${f.tenant.id}&branchId=${f.branch.id}&status=TRIAGED&category=BUG&severity=P1&deviceClass=MOBILE&businessType=CAFE_BEVERAGE`,
    ),
  );
  assert.equal(result.rows.length, 1);
  assert.equal(
    (await ok(await call(f.endpoint, undefined, f.cookie))).rows[0].history[0]
      .note,
    "รับเรื่องและตรวจสอบแล้ว",
  );
  await ok(
    await call("/api/admin/feedback", {
      id: row.id,
      expectedStatus: "TRIAGED",
      expectedHistoryId: (
        await db.pilotFeedbackHistory.findFirstOrThrow({
          where: { feedbackId: row.id },
        })
      ).id,
      status: "RESOLVED",
      severity: "P2",
      note: "แก้ไขและตรวจสอบเรียบร้อย",
    }),
  );
  assert.equal(
    await db.pilotFeedbackHistory.count({ where: { feedbackId: row.id } }),
    2,
  );
  assert.equal(
    (await call("/api/admin/feedback", undefined, f.cookie)).status,
    403,
  );
});
test("C: feedback throttles per operator, admin mutation throttles per account", async () => {
  const f = await grant();
  for (let n = 0; n < 10; n++)
    await ok(await call(f.endpoint, feedback(), f.cookie));
  assert.equal((await call(f.endpoint, feedback(), f.cookie)).status, 429);
  await db.rateLimit.deleteMany({ where: { key: `pilot-admin:${adminId}` } });
  for (let n = 0; n < 30; n++)
    assert.equal(
      (await call("/api/admin/pilot", { action: "bad" })).status,
      400,
    );
  assert.equal((await call("/api/admin/pilot", { action: "bad" })).status, 429);
  await db.rateLimit.deleteMany({ where: { key: `pilot-admin:${adminId}` } });
});
test("C: parallel maintenance enqueues once per version and reminder stage; expired grants audited", async () => {
  const fixtures = await Promise.all([
    grant(6),
    grant(2),
    grant(0.5),
    grant(-1),
  ]);
  await Promise.all([
    ops.runPilotMaintenance(),
    ops.runPilotMaintenance(),
    ops.runPilotMaintenance(),
  ]);
  for (let n = 0; n < fixtures.length; n++) {
    const f = fixtures[n],
      rows = await db.emailOutbox.findMany({
        where: { pilotEnrollmentId: f.enrollment.id },
      });
    assert.equal(rows.length, 1);
    assert.equal(
      rows[0].notificationKind,
      ["DAY_7", "DAY_3", "DAY_1", "EXPIRED"][n],
    );
    assert.equal(
      rows[0].pilotTargetEndsAt!.getTime(),
      f.enrollment.endsAt!.getTime(),
    );
  }
  const last = fixtures[3];
  assert.equal(
    (
      await db.pilotEnrollment.findUniqueOrThrow({
        where: { id: last.enrollment.id },
      })
    ).status,
    "EXPIRED",
  );
  assert.equal(
    await db.pilotAuditEvent.count({
      where: { enrollmentId: last.enrollment.id, action: "EXPIRED" },
    }),
    1,
  );
});
test("C: extension invalidates queued mail; duplicate versions fail; revoke never frees activated slot", async () => {
  const f = await grant(0.5);
  await ops.runPilotMaintenance();
  const notice = await db.emailOutbox.findFirstOrThrow({
    where: { pilotEnrollmentId: f.enrollment.id },
  });
  const updated = await pilot.extendPilot(
    adminId,
    f.enrollment.id,
    f.enrollment.version,
    new Date(Date.now() + 40 * DAY),
    "ขยายเวลาเพื่อทดสอบเพิ่มเติม",
  );
  let sent = 0;
  await mail.flushEmailOutbox({
    onlyId: notice.id,
    send: async () => {
      sent++;
    },
  });
  assert.equal(sent, 0);
  await assert.rejects(() =>
    pilot.extendPilot(
      adminId,
      f.enrollment.id,
      f.enrollment.version,
      new Date(Date.now() + 41 * DAY),
      "คำขอเดิมอีกครั้ง",
    ),
  );
  await ops.revokePilot(
    adminId,
    f.enrollment.id,
    updated.version,
    "ร้านขอถอนจากโครงการทดสอบ",
  );
  const { effectiveTenant } = await import("../src/lib/entitlements");
  assert.equal(
    (await effectiveTenant(f.tenant)).entitlement.state,
    "READ_ONLY",
  );
  assert.equal(
    await db.pilotEnrollment.count({
      where: { campaignId: f.c.id, activatedAt: { not: null } },
    }),
    1,
  );
});
test("C: extension racing expiry preserves deadline and never reinstates revoked grants", async () => {
  const f = await grant(-1),
    end = new Date(Date.now() + 10 * DAY);
  const results = await Promise.allSettled([
    ops.runPilotMaintenance(),
    pilot.extendPilot(
      adminId,
      f.enrollment.id,
      f.enrollment.version,
      end,
      "ขยายสิทธิ์ระหว่างหมดเวลา",
    ),
  ]);
  if (results[1].status === "rejected") {
    const fresh = await db.pilotEnrollment.findUniqueOrThrow({
      where: { id: f.enrollment.id },
    });
    await pilot.extendPilot(
      adminId,
      f.enrollment.id,
      fresh.version,
      end,
      "โหลดรุ่นล่าสุดแล้วขยายสิทธิ์",
    );
  }
  const final = await db.pilotEnrollment.findUniqueOrThrow({
    where: { id: f.enrollment.id },
  });
  assert.equal(+final.endsAt!, +end);
  assert.equal(final.status, "ACTIVE");
  await ops.revokePilot(
    adminId,
    final.id,
    final.version,
    "ถอนสิทธิ์เพื่อจบการทดสอบ",
  );
  await assert.rejects(() =>
    pilot.extendPilot(
      adminId,
      final.id,
      final.version + 1,
      new Date(Date.now() + 20 * DAY),
      "ห้ามขยายร้านที่ถอนแล้ว",
    ),
  );
});
test("C: parallel SMTP claims once and extension waits for existing SMTP hand-off", async () => {
  const f = await grant(0.5);
  await ops.runPilotMaintenance();
  const row = await db.emailOutbox.findFirstOrThrow({
    where: { pilotEnrollmentId: f.enrollment.id },
  });
  let unlock!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => {
      unlock = r;
    }),
    started = new Promise<void>((r) => {
      entered = r;
    });
  let sent = 0;
  const delivery = mail.flushEmailOutbox({
    onlyId: row.id,
    send: async () => {
      sent++;
      entered();
      await gate;
    },
  });
  await started;
  const competing = await mail.flushEmailOutbox({
    onlyId: row.id,
    send: async () => {
      sent++;
    },
  });
  assert.equal(competing.sent, 0);
  let extended = false;
  const extension = pilot
    .extendPilot(
      adminId,
      f.enrollment.id,
      f.enrollment.version,
      new Date(Date.now() + 40 * DAY),
      "ขยายหลังระบบกำลังส่งอีเมล",
    )
    .then(() => {
      extended = true;
    });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(extended, false);
  unlock();
  await delivery;
  await extension;
  assert.equal(sent, 1);
  assert(
    (await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })).sentAt,
  );
});
test("C: failed reminder retries with stable Message-ID and releases its lease", async () => {
  const f = await grant(2);
  await ops.runPilotMaintenance();
  const row = await db.emailOutbox.findFirstOrThrow({
    where: { pilotEnrollmentId: f.enrollment.id },
  });
  let first = "";
  const failure = await mail.flushEmailOutbox({
    onlyId: row.id,
    send: async (m) => {
      first = m.messageId;
      throw Error("SMTP unavailable");
    },
  });
  assert.equal(failure.failed, 1);
  const failed = await db.emailOutbox.findUniqueOrThrow({
    where: { id: row.id },
  });
  assert(!failed.lockedAt && !failed.sentAt && failed.availableAt > new Date());
  await db.emailOutbox.update({
    where: { id: row.id },
    data: { availableAt: new Date(0) },
  });
  await mail.flushEmailOutbox({
    onlyId: row.id,
    send: async (m) => {
      assert.equal(m.messageId, first);
    },
  });
  assert(
    (await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })).sentAt,
  );
});
after(async () => {
  if (server && server.exitCode === null)
    await new Promise<void>((resolve) => {
      server!.once("exit", () => resolve());
      server!.kill();
      setTimeout(resolve, 3000);
    });
  if (db) await db.$disconnect();
  await root.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await root.$disconnect();
});
